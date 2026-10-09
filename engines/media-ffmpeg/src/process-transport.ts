import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import type { PersistentWorkerTransport } from "./persistent-worker.js";
import { OwnedRenderResourceError, OwnedRenderResourceWatchdog, type OwnedRenderResourceObserver, type OwnedRenderResourceEvidence } from "./owned-render-resources.js";

export interface MediaWorkerProcessOptions {
  mode: "release" | "development";
  pythonExecutable: string;
  workerScript: string;
  cwd?: string;
  env?: Record<string, string | undefined>;
  shutdownTimeoutMs?: number;
  controlTimeoutMs?: number;
  renderTimeoutMs?: number;
  renderLivenessIntervalMs?: number;
}

interface RpcError { code: number; message: string }
interface RpcResponse { id?: unknown; result?: unknown; error?: RpcError }
interface PendingRequest {
  method: string;
  jobId?: string;
  terminalError?: Error;
  resolve(value: unknown): void;
  reject(reason: Error): void;
  cleanup(): void;
}

export class WorkerProcessExitedError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "WorkerProcessExitedError";
  }
}

export class ProcessMediaWorkerTransport implements PersistentWorkerTransport {
  private child: ChildProcessWithoutNullStreams | undefined;
  private starting: Promise<void> | undefined;
  private stopping: Promise<void> | undefined;
  // Keep the failed child owned until close (not merely exit / reference removal).
  private retirement: Promise<void> | undefined;
  private readonly invalid = new WeakSet<ChildProcessWithoutNullStreams>();
  private readonly closed = new WeakSet<ChildProcessWithoutNullStreams>();
  private readonly expiredRetirements = new WeakSet<ChildProcessWithoutNullStreams>();
  private nextId = 1;
  private resourceLease: { child?: ChildProcessWithoutNullStreams; terminalError?: Error } | undefined;
  private stdoutBuffer = "";
  private stderrTail = "";
  private readonly pending = new Map<number, PendingRequest>();

  constructor(private readonly options: MediaWorkerProcessOptions) {
    for (const [name, value] of [["controlTimeoutMs", options.controlTimeoutMs ?? 5000], ["shutdownTimeoutMs", options.shutdownTimeoutMs ?? 5000], ["renderLivenessIntervalMs", options.renderLivenessIntervalMs ?? 5000]] as const) {
      if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a finite positive number.`);
    }
  }

  get workerPid(): number | undefined { return this.child?.pid; }

  /** Trusted Host scope for all phases of one owned job. No RPC/UI budget overrides.
   * The future export caller must register all live files and await retirement before cleanup.
   */
  async withOwnedRenderBudget<T>(options: {
    ownedDirectory: string; rendererRssLimitBytes: number; ownedFileLimitBytes: number;
    /** @internal Filesystem/process test seam, never product input. */ observe?: OwnedRenderResourceObserver;
  }, operation: () => Promise<T>): Promise<{ result: T; resourceEvidence: OwnedRenderResourceEvidence }> {
    if (this.resourceLease) throw new OwnedRenderResourceError("MEDIA_RENDER_RESOURCE_BUSY");
    const lease: { child?: ChildProcessWithoutNullStreams; terminalError?: Error } = {};
    this.resourceLease = lease;
    let watchdog: OwnedRenderResourceWatchdog | undefined;
    let failure: OwnedRenderResourceError | undefined;
    let primaryError: unknown;
    let failed = false;
    let result: T | undefined;
    let resourceEvidence: OwnedRenderResourceEvidence | undefined;
    let retired = false;
    try {
      try {
        await this.start();
        const child = this.child;
        if (!child?.pid || process.platform === "win32") throw new OwnedRenderResourceError("MEDIA_RENDER_RESOURCE_OBSERVATION_FAILED");
        lease.child = child;
        watchdog = new OwnedRenderResourceWatchdog({ ...options, processGroupId: child.pid, onFailure: error => {
          failure = error; this.failWorker(child, error);
        } });
        await watchdog.start();
        if (!watchdog.processIds.includes(child.pid)) throw new OwnedRenderResourceError("MEDIA_RENDER_RESOURCE_OBSERVATION_FAILED");
        result = await operation();
        await watchdog.check();
        if (lease.terminalError) throw lease.terminalError;
        if (this.child !== child || this.invalid.has(child) || child.exitCode !== null || child.signalCode !== null
          || !watchdog.processIds.includes(child.pid) || watchdog.processIds.some(pid => pid !== child.pid)) {
          throw new OwnedRenderResourceError("MEDIA_RENDER_RESOURCE_OBSERVATION_FAILED");
        }
      } catch (error) { failed = true; primaryError = failure ?? error; }

      if (failed) {
        const child = lease.child;
        if (child) this.failWorker(child, primaryError instanceof Error ? primaryError : new Error("Owned render scope failed.", { cause: primaryError }));
        // Keep observation and admission held until the captured generation
        // retires on every abnormal exit, including caller validation errors.
        try { await this.settle(); } catch (cleanupError) { attachCleanupError(primaryError, cleanupError); }
        retired = true;
      }
      try { resourceEvidence = await watchdog?.stop(); }
      catch (error) {
        if (!failed) { failed = true; primaryError = error; }
        else if (error !== primaryError) attachCleanupError(primaryError, error);
      }
      if (failed && !retired) {
        if (lease.child) this.failWorker(lease.child, primaryError instanceof Error ? primaryError : new Error("Owned render scope failed.", { cause: primaryError }));
        try { await this.settle(); } catch (cleanupError) { attachCleanupError(primaryError, cleanupError); }
      }
      if (failed) throw primaryError;
      return { result: result!, resourceEvidence: resourceEvidence! };
    } finally {
      this.resourceLease = undefined;
    }
  }

  /** Observe failure retirement before deleting caller-owned render inputs. */
  async settle(): Promise<void> { await this.stopping; await this.retirement; }

  async start(): Promise<void> {
    this.assertResourceGeneration();
    if (this.stopping) await this.stopping;
    this.assertResourceGeneration();
    if (this.retirement) {
      await this.retirement;
      this.assertResourceGeneration();
      this.retirement = undefined;
    }
    if (this.starting) { await this.starting; this.assertResourceGeneration(); return; }
    if (this.child && !this.invalid.has(this.child) && this.child.exitCode === null && this.child.signalCode === null) return;
    this.assertResourceGeneration();
    this.starting ??= this.spawnWorker().finally(() => { this.starting = undefined; });
    return this.starting;
  }

  async stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    if (this.retirement) return this.retirement;
    const child = this.child;
    if (!child) return;
    this.stopping = this.stopWorker(child).finally(() => { this.stopping = undefined; });
    return this.stopping;
  }

  async request<T>(method: string, params?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    await this.start();
    return this.send<T>(method, params, signal);
  }

  private async spawnWorker(): Promise<void> {
    this.assertResourceGeneration();
    const runtimeRoot = resolve(dirname(this.options.workerScript), "..");
    const sourceEnv = this.options.env ?? process.env;
    const releaseMode = this.options.mode === "release";
    const env = { ...sourceEnv };
    env.PYTHONNOUSERSITE = "1";
    env.PYTHONDONTWRITEBYTECODE = "1";
    delete env.FFMPEG_SKILL_TIMEOUT;
    if (releaseMode) {
      for (const name of PYTHON_PROCESS_OVERRIDES) delete env[name];
      for (const name of CEVRA_RELEASE_OVERRIDES) delete env[name];
      env.CEVRA_MEDIA_RUNTIME_ROOT = runtimeRoot;
      env.CEVRA_RELEASE_MODE = "1";
      env.PATH = join(runtimeRoot, "bin");
    }
    const renderTimeoutMs = this.options.renderTimeoutMs ?? 0;
    if (!Number.isFinite(renderTimeoutMs) || renderTimeoutMs < 0) throw new RangeError("renderTimeoutMs must be a finite non-negative number.");
    env.CEVRA_MEDIA_RENDER_TIMEOUT_SECONDS = String(renderTimeoutMs / 1000);
    const child = spawn(this.options.pythonExecutable, ["-I", "-B", this.options.workerScript], {
      ...(this.options.cwd ? { cwd: this.options.cwd } : {}),
      env,
      shell: false,
      // A private POSIX process group lets the existing transport settle owned
      // native children even when the Python worker dies before job cleanup.
      detached: process.platform !== "win32",
      windowsHide: true
    });
    this.child = child;
    if (this.resourceLease && !this.resourceLease.child) this.resourceLease.child = child;
    this.stdoutBuffer = "";
    this.stderrTail = "";
    child.stdin.on("error", (error) => this.failWorker(child, channelError(error)));
    child.stdout.on("data", (chunk) => {
      if (this.child === child && !this.invalid.has(child)) this.consumeStdout(chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk) => {
      if (this.child !== child || this.invalid.has(child)) return;
      this.stderrTail = (this.stderrTail + chunk.toString("utf8")).slice(-4000);
    });
    child.on("error", (error) => this.failWorker(child, error));
    child.once("exit", (code, signal) => {
      if (this.child !== child || this.invalid.has(child)) return;
      const detail = this.stderrTail.trim();
      this.failWorker(child, new WorkerProcessExitedError(
        `CEVRA media worker exited (${code ?? signal ?? "unknown"})${detail ? `: ${detail}` : ""}`
      ));
    });
    child.once("close", () => {
      this.closed.add(child);
      this.failWorker(child, new WorkerProcessExitedError("CEVRA media worker closed."));
      this.releaseExpiredRetirement(child);
    });
    try {
      await this.send("ping");
    } catch (error) {
      this.failWorker(child, error instanceof Error ? error : new WorkerProcessExitedError("CEVRA media worker failed to start."));
      // Retain the primary start failure; cleanup failures remain attached / observable.
      try { await this.retirement; } catch (cleanupError) { attachCleanupError(error, cleanupError); }
      throw error;
    }
  }

  private send<T>(method: string, params?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const child = this.child;
    if (!child || this.invalid.has(child) || child.exitCode !== null || child.signalCode !== null ||
        !child.stdin.writable || child.stdin.destroyed || child.stdin.writableEnded) {
      const error = new WorkerProcessExitedError("CEVRA media worker input channel is unavailable.");
      if (child) this.failWorker(child, error);
      return Promise.reject(error);
    }
    if (signal?.aborted) return Promise.reject(abortError());
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let livenessTimer: ReturnType<typeof setTimeout> | undefined;
      let inactiveLivenessChecks = 0;
      const jobId = typeof params?.jobId === "string" ? params.jobId : undefined;
      const settleError = (error: Error) => {
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        pending.cleanup();
        pending.reject(pending.terminalError ?? error);
      };
      const requestTermination = (error: Error) => {
        const pending = this.pending.get(id);
        if (!pending || pending.terminalError) return;
        pending.terminalError = error;
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
        if (method === "tools/call" && typeof jobId === "string") {
          void this.send("cevra/cancel", { jobId }).catch(() => this.failWorker(child, error));
          return;
        }
        settleError(error);
      };
      const abort = () => requestTermination(abortError());
      const cleanup = () => {
        signal?.removeEventListener("abort", abort);
        if (timer) clearTimeout(timer);
        if (livenessTimer) clearTimeout(livenessTimer);
      };
      this.pending.set(id, { method, ...(jobId ? { jobId } : {}), resolve: (value) => resolve(value as T), reject, cleanup });
      signal?.addEventListener("abort", abort, { once: true });
      const checkLiveness = async () => {
        if (!this.pending.has(id)) return;
        try {
          const status = await this.send<{ activeJobId?: string | null; jobThreadActive?: boolean }>("ping");
          if (status.activeJobId !== jobId && status.jobThreadActive !== true) {
            const current = this.pending.get(id);
            if (current?.terminalError) {
              settleError(current.terminalError);
              return;
            }
            inactiveLivenessChecks += 1;
            if (inactiveLivenessChecks >= 2) {
              settleError(new WorkerProcessExitedError(`CEVRA media worker lost the response for job ${jobId ?? "unknown"}.`));
              return;
            }
          } else {
            inactiveLivenessChecks = 0;
          }
        } catch (error) {
          const current = this.pending.get(id);
          settleError(current?.terminalError ?? (error instanceof Error ? error : new WorkerProcessExitedError("CEVRA media worker stopped responding.")));
          this.failWorker(child, error instanceof Error ? error : new WorkerProcessExitedError("CEVRA media worker stopped responding."));
          return;
        }
        if (this.pending.has(id)) livenessTimer = setTimeout(checkLiveness, this.options.renderLivenessIntervalMs ?? 5000);
      };
      const timeoutMs = method === "tools/call" ? (this.options.renderTimeoutMs ?? 0) : (this.options.controlTimeoutMs ?? 5000);
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          const error = new Error(`${method} timed out after ${timeoutMs} ms`);
          error.name = "TimeoutError";
          requestTermination(error);
        }, timeoutMs);
      }
      if (method === "tools/call") {
        livenessTimer = setTimeout(checkLiveness, this.options.renderLivenessIntervalMs ?? 5000);
      }
      try {
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) })}\n`, (error) => {
          if (error) this.failWorker(child, channelError(error));
        });
      } catch (error) {
        this.failWorker(child, error instanceof Error ? channelError(error) : new Error("Media worker input write failed.", { cause: error }));
      }
    });
  }

  private consumeStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    for (;;) {
      const newline = this.stdoutBuffer.indexOf("\n");
      if (newline < 0) return;
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (!line) continue;
      let response: RpcResponse;
      try { response = JSON.parse(line) as RpcResponse; } catch { continue; }
      if (typeof response.id !== "number") continue;
      const pending = this.pending.get(response.id);
      if (!pending) continue;
      this.pending.delete(response.id);
      pending.cleanup();
      if (pending.terminalError) pending.reject(pending.terminalError);
      else if (response.error) pending.reject(response.error.code === -32002 && response.error.message === "MEDIA_RENDER_DISK_LIMIT"
        ? new OwnedRenderResourceError("MEDIA_RENDER_DISK_LIMIT")
        : Object.assign(new Error(response.error.message), { code: response.error.code }));
      else pending.resolve(response.result);
    }
  }

  private async stopWorker(child: ChildProcessWithoutNullStreams): Promise<void> {
    const timeoutMs = this.options.shutdownTimeoutMs ?? 5000;
    for (const [id, pending] of this.pending) {
      if (pending.method !== "tools/call") continue;
      this.pending.delete(id);
      pending.cleanup();
      pending.reject(pending.terminalError ?? abortError());
    }
    try {
      await withTimeout(this.send("cevra/shutdown"), timeoutMs, "worker shutdown timed out");
    } catch (error) {
      this.failWorker(child, error instanceof Error ? error : new WorkerProcessExitedError("Worker shutdown failed."));
    }
    if (!this.invalid.has(child)) {
      try {
        await waitForClose(child, this.closed, timeoutMs);
      } catch (error) {
        this.failWorker(child, error as Error);
      }
    }
    await this.retirement;
  }

  private failWorker(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (this.child !== child || this.invalid.has(child)) return;
    if (this.resourceLease?.child === child) this.resourceLease.terminalError ??= error;
    this.invalid.add(child);
    let cleanupError: unknown;
    try { terminateOwned(child); } catch (cause) { cleanupError = cause; attachCleanupError(error, cause); }
    for (const pending of this.pending.values()) {
      pending.cleanup();
      if (cleanupError) attachCleanupError(pending.terminalError, cleanupError);
      pending.reject(pending.terminalError ?? error);
    }
    this.pending.clear();
    this.retirement = waitForClose(child, this.closed, this.options.shutdownTimeoutMs ?? 5000)
      .then(() => {
        if (this.child === child) this.child = undefined;
        if (cleanupError) throw cleanupError;
      }, (cause) => {
        attachCleanupError(error, cause);
        this.expiredRetirements.add(child);
        // close can arrive after the timer fired but before this rejection handler.
        this.releaseExpiredRetirement(child);
        throw cause;
      });
    // stop/start explicitly observe this promise; don't create an unhandled rejection
    // when a failure happens between public requests.
    void this.retirement.catch(() => undefined);
  }

  private releaseExpiredRetirement(child: ChildProcessWithoutNullStreams): void {
    if (this.child !== child || !this.closed.has(child) || !this.expiredRetirements.has(child)) return;
    // Real close releases this generation, never an unresolved timeout or a new child.
    // Captured retirement promises and attached cleanup errors remain unchanged.
    this.child = undefined;
    this.retirement = undefined;
    this.expiredRetirements.delete(child);
  }

  private assertResourceGeneration(): void {
    const lease = this.resourceLease;
    if (!lease) return;
    if (lease.terminalError) throw lease.terminalError;
    if (lease.child && (this.child !== lease.child || this.invalid.has(lease.child)
      || lease.child.exitCode !== null || lease.child.signalCode !== null)) {
      lease.terminalError = new OwnedRenderResourceError("MEDIA_RENDER_RESOURCE_OBSERVATION_FAILED");
      throw lease.terminalError;
    }
  }
}

const PYTHON_PROCESS_OVERRIDES = [
  "CONDA_PREFIX", "DYLD_FALLBACK_FRAMEWORK_PATH", "DYLD_FALLBACK_LIBRARY_PATH", "DYLD_FRAMEWORK_PATH",
  "DYLD_IMAGE_SUFFIX", "DYLD_INSERT_LIBRARIES", "DYLD_LIBRARY_PATH", "DYLD_ROOT_PATH",
  "DYLD_VERSIONED_FRAMEWORK_PATH", "DYLD_VERSIONED_LIBRARY_PATH", "LD_AUDIT", "LD_LIBRARY_PATH",
  "LD_PRELOAD", "PYTHONBREAKPOINT", "PYTHONCASEOK", "PYTHONEXECUTABLE",
  "PYTHONHOME", "PYTHONINSPECT", "PYTHONPATH", "PYTHONPLATLIBDIR", "PYTHONSTARTUP",
  "PYTHONUSERBASE", "PYTHONWARNINGS", "VIRTUAL_ENV"
] as const;

const CEVRA_RELEASE_OVERRIDES = [
  "CEVRA_ALLOW_GPL_DEV_ENCODERS", "CEVRA_DECODE_ACCELERATION", "CEVRA_FFMPEG_SKILL_ROOT",
  "CEVRA_MEDIA_BIN_DIR", "CEVRA_MEDIA_RUNTIME_ROOT", "CEVRA_VIDEO_ENCODER_AV1",
  "CEVRA_VIDEO_ENCODER_H264", "CEVRA_VIDEO_ENCODER_HEVC", "FFMPEG_SKILL_NO_OVERWRITE",
  "FFMPEG_SKILL_TIMEOUT", "CEVRA_MEDIA_RENDER_TIMEOUT_SECONDS"
] as const;

function abortError(): Error {
  const error = new Error("CEVRA media operation was cancelled.");
  error.name = "AbortError";
  return error;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

function waitForClose(child: ChildProcessWithoutNullStreams, closed: WeakSet<ChildProcessWithoutNullStreams>, timeoutMs: number): Promise<void> {
  if (closed.has(child)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const close = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => {
      child.removeListener("close", close);
      reject(new Error("Media worker close timed out."));
    }, timeoutMs);
    child.once("close", close);
  });
}

function channelError(error: Error): Error {
  // EPIPE means the pipe's reader is unavailable; destroyed streams reject
  // writes with ERR_STREAM_DESTROYED. Neither establishes remote process death.
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EPIPE" || code === "ERR_STREAM_DESTROYED"
    ? new WorkerProcessExitedError("CEVRA media worker input channel is unavailable.", { cause: error })
    : error;
}

function attachCleanupError(error: unknown, cleanupError: unknown): void {
  if (error instanceof Error && Object.isExtensible(error) && !Object.hasOwn(error, "cleanupError")) {
    Object.defineProperty(error, "cleanupError", { value: cleanupError, enumerable: false });
  }
}

function terminateOwned(child: ChildProcessWithoutNullStreams): void {
  let groupError: unknown;
  if (process.platform !== "win32" && child.pid !== undefined) {
    try { process.kill(-child.pid, "SIGKILL"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") groupError = error; }
  }
  // Also cover Windows and a failed group kill. Never use a negative PID there.
  try {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  } catch (error) {
    if (groupError) throw new AggregateError([groupError, error], "Owned media worker termination failed.");
    throw error;
  }
  if (groupError) throw groupError;
}
