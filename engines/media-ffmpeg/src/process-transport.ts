import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import type { PersistentWorkerTransport } from "./persistent-worker.js";

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
  constructor(message: string) {
    super(message);
    this.name = "WorkerProcessExitedError";
  }
}

export class ProcessMediaWorkerTransport implements PersistentWorkerTransport {
  private child: ChildProcessWithoutNullStreams | undefined;
  private starting: Promise<void> | undefined;
  private stopping: Promise<void> | undefined;
  private nextId = 1;
  private stdoutBuffer = "";
  private stderrTail = "";
  private readonly pending = new Map<number, PendingRequest>();

  constructor(private readonly options: MediaWorkerProcessOptions) {
    for (const [name, value] of [["controlTimeoutMs", options.controlTimeoutMs ?? 5000], ["shutdownTimeoutMs", options.shutdownTimeoutMs ?? 5000], ["renderLivenessIntervalMs", options.renderLivenessIntervalMs ?? 5000]] as const) {
      if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a finite positive number.`);
    }
  }

  get workerPid(): number | undefined { return this.child?.pid; }

  async start(): Promise<void> {
    if (this.child?.exitCode === null && this.child.signalCode === null) return;
    if (this.stopping) await this.stopping;
    this.starting ??= this.spawnWorker().finally(() => { this.starting = undefined; });
    return this.starting;
  }

  async stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    this.stopping = this.stopWorker(child).finally(() => { this.stopping = undefined; });
    return this.stopping;
  }

  async request<T>(method: string, params?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    await this.start();
    return this.send<T>(method, params, signal);
  }

  private async spawnWorker(): Promise<void> {
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
    this.stdoutBuffer = "";
    this.stderrTail = "";
    child.stdout.on("data", (chunk) => this.consumeStdout(chunk.toString("utf8")));
    child.stderr.on("data", (chunk) => {
      this.stderrTail = (this.stderrTail + chunk.toString("utf8")).slice(-4000);
    });
    child.on("error", (error) => this.failWorker(child, error));
    child.once("exit", (code, signal) => {
      const detail = this.stderrTail.trim();
      this.failWorker(child, new WorkerProcessExitedError(
        `CEVRA media worker exited (${code ?? signal ?? "unknown"})${detail ? `: ${detail}` : ""}`
      ));
    });
    try {
      await this.send("ping");
    } catch (error) {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      await waitForExit(child, 1000).catch(() => undefined);
      this.failWorker(child, error instanceof Error ? error : new WorkerProcessExitedError("CEVRA media worker failed to start."));
      throw error;
    }
  }

  private send<T>(method: string, params?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null || !child.stdin.writable) {
      return Promise.reject(new WorkerProcessExitedError("CEVRA media worker is not running."));
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
        pending.reject(error);
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
          void this.send("cevra/cancel", { jobId }).catch(() => settleError(error));
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
          const status = await this.send<{ activeJobId?: string | null }>("ping");
          if (status.activeJobId !== jobId) {
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
          if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
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
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) })}\n`, (error) => {
        if (!error) return;
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        pending.cleanup();
        pending.reject(error);
      });
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
      else if (response.error) pending.reject(Object.assign(new Error(response.error.message), { code: response.error.code }));
      else pending.resolve(response.result);
    }
  }

  private async stopWorker(child: ChildProcessWithoutNullStreams): Promise<void> {
    const timeoutMs = this.options.shutdownTimeoutMs ?? 5000;
    for (const [id, pending] of this.pending) {
      if (pending.method !== "tools/call") continue;
      this.pending.delete(id);
      pending.cleanup();
      pending.reject(abortError());
    }
    try {
      await withTimeout(this.send("cevra/shutdown"), timeoutMs, "worker shutdown timed out");
    } catch {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
    if (child.exitCode === null && child.signalCode === null) {
      try {
        await waitForExit(child, timeoutMs);
      } catch {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        await waitForExit(child, 1000);
      }
    }
  }

  private failWorker(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (this.child !== child) return;
    if (process.platform !== "win32" && child.pid !== undefined) {
      try { process.kill(-child.pid, "SIGKILL"); }
      catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== "ESRCH") {
          error = new WorkerProcessExitedError(`Owned media process-group termination failed: ${String(cause)}`);
        }
      }
    }
    this.child = undefined;
    for (const pending of this.pending.values()) {
      pending.cleanup();
      pending.reject(error);
    }
    this.pending.clear();
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

function waitForExit(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return withTimeout(new Promise<void>((resolve) => child.once("exit", () => resolve())), timeoutMs, "worker exit timed out");
}
