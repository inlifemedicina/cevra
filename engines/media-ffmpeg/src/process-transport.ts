import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { PersistentWorkerTransport } from "./persistent-worker.js";

export interface MediaWorkerProcessOptions {
  pythonExecutable: string;
  workerScript: string;
  cwd?: string;
  env?: Record<string, string | undefined>;
  shutdownTimeoutMs?: number;
}

interface RpcError { code: number; message: string }
interface RpcResponse { id?: unknown; result?: unknown; error?: RpcError }
interface PendingRequest {
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

  constructor(private readonly options: MediaWorkerProcessOptions) {}

  get workerPid(): number | undefined { return this.child?.pid; }

  async start(): Promise<void> {
    if (this.child?.exitCode === null) return;
    if (this.stopping) await this.stopping;
    this.starting ??= this.spawnWorker().finally(() => { this.starting = undefined; });
    return this.starting;
  }

  async stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    const child = this.child;
    if (!child || child.exitCode !== null) return;
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
    const releaseMode = existsSync(join(runtimeRoot, "manifest.json")) || isEnabled(sourceEnv.CEVRA_RELEASE_MODE);
    const env = { ...sourceEnv };
    env.PYTHONNOUSERSITE = "1";
    env.PYTHONDONTWRITEBYTECODE = "1";
    if (releaseMode) {
      for (const name of PYTHON_PROCESS_OVERRIDES) delete env[name];
      for (const name of CEVRA_RELEASE_OVERRIDES) delete env[name];
      env.CEVRA_MEDIA_RUNTIME_ROOT = runtimeRoot;
      env.CEVRA_RELEASE_MODE = "1";
      env.PATH = join(runtimeRoot, "bin");
    }
    const child = spawn(this.options.pythonExecutable, ["-I", "-B", this.options.workerScript], {
      ...(this.options.cwd ? { cwd: this.options.cwd } : {}),
      env,
      shell: false,
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
    await this.send("ping");
  }

  private send<T>(method: string, params?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const child = this.child;
    if (!child || child.exitCode !== null || !child.stdin.writable) {
      return Promise.reject(new WorkerProcessExitedError("CEVRA media worker is not running."));
    }
    if (signal?.aborted) return Promise.reject(abortError());
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const abort = () => {
        const jobId = params?.jobId;
        if (method === "tools/call" && typeof jobId === "string") {
          void this.send("cevra/cancel", { jobId }).catch(() => undefined);
        }
      };
      const cleanup = () => signal?.removeEventListener("abort", abort);
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, cleanup });
      signal?.addEventListener("abort", abort, { once: true });
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
      if (response.error) pending.reject(Object.assign(new Error(response.error.message), { code: response.error.code }));
      else pending.resolve(response.result);
    }
  }

  private async stopWorker(child: ChildProcessWithoutNullStreams): Promise<void> {
    const timeoutMs = this.options.shutdownTimeoutMs ?? 5000;
    try {
      await withTimeout(this.send("cevra/shutdown"), timeoutMs, "worker shutdown timed out");
    } catch {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
    if (child.exitCode === null) {
      try {
        await waitForExit(child, timeoutMs);
      } catch {
        if (child.exitCode === null) child.kill("SIGKILL");
        await waitForExit(child, 1000);
      }
    }
  }

  private failWorker(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (this.child !== child) return;
    this.child = undefined;
    for (const pending of this.pending.values()) {
      pending.cleanup();
      pending.reject(error);
    }
    this.pending.clear();
  }
}

const PYTHON_PROCESS_OVERRIDES = [
  "CONDA_PREFIX", "DYLD_FALLBACK_LIBRARY_PATH", "DYLD_INSERT_LIBRARIES", "DYLD_LIBRARY_PATH",
  "LD_LIBRARY_PATH", "LD_PRELOAD", "PYTHONBREAKPOINT", "PYTHONCASEOK", "PYTHONEXECUTABLE",
  "PYTHONHOME", "PYTHONINSPECT", "PYTHONPATH", "PYTHONPLATLIBDIR", "PYTHONSTARTUP",
  "PYTHONUSERBASE", "PYTHONWARNINGS", "VIRTUAL_ENV"
] as const;

const CEVRA_RELEASE_OVERRIDES = [
  "CEVRA_ALLOW_GPL_DEV_ENCODERS", "CEVRA_FFMPEG_SKILL_ROOT", "CEVRA_MEDIA_BIN_DIR", "CEVRA_MEDIA_RUNTIME_ROOT"
] as const;

function isEnabled(value: string | undefined): boolean {
  return value !== undefined && !["", "0", "false", "False"].includes(value);
}

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
  if (child.exitCode !== null) return Promise.resolve();
  return withTimeout(new Promise<void>((resolve) => child.once("exit", () => resolve())), timeoutMs, "worker exit timed out");
}
