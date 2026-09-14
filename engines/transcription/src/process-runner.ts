import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExecutionContext } from "@cevra/contracts";
import { cancellationError, LocalTranscriptionError, type LocalTranscriptionErrorCode } from "./errors.js";
import {
  FASTER_WHISPER_VERSION,
  TRANSCRIPTION_PROTOCOL_VERSION,
  type TranscriptionRuntime,
  type TranscriptionWorkerHealth,
  type TranscriptionWorkerRequest,
  type TranscriptionWorkerRunner
} from "./types.js";

const DEFAULT_STOP_TIMEOUT_MS = 2000;
const MAX_WORKER_OUTPUT_BYTES = 16 * 1024 * 1024;
const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packagedWorker = resolve(engineRoot, "python", "cevra_transcription_worker.py");

export interface ProcessTranscriptionWorkerOptions {
  runtime: TranscriptionRuntime;
  stopTimeoutMs?: number;
}

export class ProcessTranscriptionWorkerRunner implements TranscriptionWorkerRunner {
  private child: ChildProcessWithoutNullStreams | undefined;

  constructor(private readonly options: ProcessTranscriptionWorkerOptions) {
    const timeout = options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS;
    if (!Number.isFinite(timeout) || timeout <= 0) throw new RangeError("stopTimeoutMs must be a finite positive number.");
  }

  async transcribe(request: TranscriptionWorkerRequest, context: ExecutionContext): Promise<unknown> {
    return this.execute(request, context.signal);
  }

  async healthcheck(): Promise<TranscriptionWorkerHealth> {
    const raw = await this.execute({ protocolVersion: TRANSCRIPTION_PROTOCOL_VERSION, operation: "health" });
    if (
      !raw ||
      typeof raw !== "object" ||
      (raw as { protocolVersion?: unknown }).protocolVersion !== TRANSCRIPTION_PROTOCOL_VERSION ||
      (raw as { status?: unknown }).status !== "ready" ||
      (raw as { fasterWhisperVersion?: unknown }).fasterWhisperVersion !== FASTER_WHISPER_VERSION
    ) {
      throw new LocalTranscriptionError("TRANSCRIPTION_MALFORMED_RESULT", "Transcription worker health response is malformed.");
    }
    return raw as TranscriptionWorkerHealth;
  }

  get workerPid(): number | undefined {
    return this.child?.exitCode === null && this.child.signalCode === null ? this.child.pid : undefined;
  }

  private async execute(payload: TranscriptionWorkerRequest | HealthRequest, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) throw cancellationError(signal.reason);
    const paths = resolveRuntimePaths(this.options.runtime);
    const child = spawn(paths.pythonExecutable, ["-I", "-B", paths.workerScript], {
      cwd: paths.environmentRoot,
      env: workerEnvironment(
        paths.environmentRoot,
        payload.operation === "transcribe" ? payload.modelCacheDir : undefined,
        this.options.runtime.mode === "managed"
      ),
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.child = child;
    try {
      return await collectWorkerResult(child, payload, signal, this.options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS);
    } finally {
      if (this.child === child) this.child = undefined;
    }
  }
}

interface HealthRequest {
  protocolVersion: typeof TRANSCRIPTION_PROTOCOL_VERSION;
  operation: "health";
}

interface ResolvedRuntimePaths {
  pythonExecutable: string;
  environmentRoot: string;
  workerScript: string;
}

export function resolveRuntimePaths(runtime: TranscriptionRuntime): ResolvedRuntimePaths {
  if (!runtime.pythonExecutable || typeof runtime.pythonExecutable !== "string") runtimeUnavailable("An explicit Python executable is required.");
  if (!isAbsolute(runtime.pythonExecutable)) runtimeUnavailable("The Python executable must be an absolute path.");
  const environmentRoot = resolve(runtime.environmentRoot ?? dirname(runtime.pythonExecutable));
  const workerScript = resolve(runtime.mode === "development" && runtime.workerScript ? runtime.workerScript : packagedWorker);
  for (const [label, path] of [["Python executable", runtime.pythonExecutable], ["transcription environment", environmentRoot], ["worker script", workerScript]] as const) {
    if (!existsSync(path)) runtimeUnavailable(`${label} is unavailable.`);
    if (lstatSync(path).isSymbolicLink() && label !== "Python executable") runtimeUnavailable(`${label} must not be a symlink.`);
  }
  const environmentReal = realpathSync(environmentRoot);
  const executableLexical = resolve(runtime.pythonExecutable);
  if (!inside(environmentRoot, executableLexical)) runtimeUnavailable("The Python executable must belong to the transcription environment.");
  if (runtime.mode === "managed") {
    if (!isAbsolute(runtime.privatePythonRoot) || !existsSync(runtime.privatePythonRoot)) runtimeUnavailable("The private CEVRA Python root is unavailable.");
    const privatePythonReal = realpathSync(runtime.privatePythonRoot);
    if (inside(privatePythonReal, environmentReal) || inside(environmentReal, privatePythonReal)) {
      runtimeUnavailable("The transcription dependency environment must be isolated from the private Python distribution.");
    }
    if (!existsSync(resolve(environmentReal, "pyvenv.cfg"))) runtimeUnavailable("The managed transcription environment is not an isolated virtual environment.");
    const executableReal = realpathSync(runtime.pythonExecutable);
    if (!inside(privatePythonReal, executableReal) && !inside(environmentReal, executableReal)) {
      runtimeUnavailable("The managed interpreter escapes the authorized CEVRA runtime roots.");
    }
  }
  return { pythonExecutable: runtime.pythonExecutable, environmentRoot: environmentReal, workerScript: realpathSync(workerScript) };
}

function workerEnvironment(environmentRoot: string, modelCacheDir: string | undefined, managed: boolean): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    LANG: process.env.LANG ?? "C.UTF-8",
    LC_ALL: process.env.LC_ALL ?? process.env.LANG ?? "C.UTF-8",
    PYTHONNOUSERSITE: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    VIRTUAL_ENV: environmentRoot,
    PATH: "",
    CEVRA_TRANSCRIPTION_MANAGED: managed ? "1" : "0"
  };
  if (modelCacheDir) {
    env.HF_HOME = modelCacheDir;
    env.HUGGINGFACE_HUB_CACHE = modelCacheDir;
  }
  return env;
}

async function collectWorkerResult(
  child: ChildProcessWithoutNullStreams,
  payload: TranscriptionWorkerRequest | HealthRequest,
  signal: AbortSignal | undefined,
  stopTimeoutMs: number
): Promise<unknown> {
  let stdout = "";
  let stderr = "";
  let cancelled = false;
  let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
  const abort = () => {
    cancelled = true;
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      }, stopTimeoutMs);
    }
  };
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
    if (Buffer.byteLength(stdout) > MAX_WORKER_OUTPUT_BYTES && child.exitCode === null) child.kill("SIGKILL");
  });
  child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString("utf8")).slice(-8192); });
  child.stdin.on("error", () => undefined);
  child.stdin.end(`${JSON.stringify(payload)}\n`);

  return new Promise((resolvePromise, reject) => {
    child.once("error", (cause) => {
      cleanup();
      reject(new LocalTranscriptionError("TRANSCRIPTION_WORKER_START_FAILED", "The transcription worker could not be started.", { cause }));
    });
    child.once("exit", (code, signalCode) => {
      cleanup();
      if (cancelled || signal?.aborted) return reject(cancellationError(signal?.reason));
      if (code !== 0) {
        return reject(new LocalTranscriptionError(
          "TRANSCRIPTION_FAILED",
          `The transcription worker exited unexpectedly (${code ?? signalCode ?? "unknown"}).`,
          stderr ? { cause: new Error(stderr) } : undefined
        ));
      }
      let response: unknown;
      try { response = JSON.parse(stdout.trim()); } catch (cause) {
        return reject(new LocalTranscriptionError("TRANSCRIPTION_MALFORMED_RESULT", "The transcription worker returned invalid JSON.", { cause }));
      }
      if (!response || typeof response !== "object") {
        return reject(new LocalTranscriptionError("TRANSCRIPTION_MALFORMED_RESULT", "The transcription worker response is malformed."));
      }
      const envelope = response as { ok?: unknown; result?: unknown; error?: { code?: unknown; message?: unknown } };
      if (envelope.ok === true) return resolvePromise(envelope.result);
      if (envelope.ok === false && envelope.error && typeof envelope.error.code === "string") {
        const code = workerErrorCode(envelope.error.code);
        const detail = typeof envelope.error.message === "string" ? envelope.error.message : "The transcription worker failed.";
        return reject(new LocalTranscriptionError(code, detail));
      }
      reject(new LocalTranscriptionError("TRANSCRIPTION_MALFORMED_RESULT", "The transcription worker envelope is malformed."));
    });
    function cleanup(): void {
      signal?.removeEventListener("abort", abort);
      if (forceKillTimer) clearTimeout(forceKillTimer);
    }
  });
}

function workerErrorCode(code: string): LocalTranscriptionErrorCode {
  switch (code) {
    case "RUNTIME_UNAVAILABLE": return "TRANSCRIPTION_RUNTIME_UNAVAILABLE";
    case "MODEL_UNAVAILABLE": return "TRANSCRIPTION_MODEL_UNAVAILABLE";
    case "INVALID_REQUEST": return "TRANSCRIPTION_INVALID_REQUEST";
    case "UNSUPPORTED_LANGUAGE": return "TRANSCRIPTION_UNSUPPORTED_LANGUAGE";
    default: return "TRANSCRIPTION_FAILED";
  }
}

function inside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function runtimeUnavailable(message: string): never {
  throw new LocalTranscriptionError("TRANSCRIPTION_RUNTIME_UNAVAILABLE", message);
}
