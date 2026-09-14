import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
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
  private transcriptionChild: ChildProcessWithoutNullStreams | undefined;

  constructor(private readonly options: ProcessTranscriptionWorkerOptions) {
    const timeout = options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS;
    if (!Number.isFinite(timeout) || timeout <= 0) throw new RangeError("stopTimeoutMs must be a finite positive number.");
  }

  async transcribe(request: TranscriptionWorkerRequest, context: ExecutionContext): Promise<unknown> {
    return this.execute(request, context.signal, true);
  }

  async healthcheck(): Promise<TranscriptionWorkerHealth> {
    const raw = await this.execute({ protocolVersion: TRANSCRIPTION_PROTOCOL_VERSION, operation: "health" }, undefined, false);
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
    return this.transcriptionChild?.exitCode === null && this.transcriptionChild.signalCode === null
      ? this.transcriptionChild.pid
      : undefined;
  }

  private async execute(
    payload: TranscriptionWorkerRequest | HealthRequest,
    signal: AbortSignal | undefined,
    trackTranscription: boolean
  ): Promise<unknown> {
    if (signal?.aborted) throw cancellationError(signal.reason);
    const paths = resolveRuntimePaths(this.options.runtime);
    if (payload.operation === "transcribe" && this.options.runtime.mode === "managed") {
      assertModelCacheIsolated(payload.modelCacheDir, paths.protectedRoots);
    }
    const child = spawn(paths.pythonExecutable, ["-I", "-B", paths.workerScript], {
      cwd: paths.environmentRoot,
      env: workerEnvironment(
        paths.environmentRoot,
        payload.operation === "transcribe" ? payload.modelCacheDir : undefined,
        this.options.runtime.mode === "managed",
        payload.operation === "transcribe" && !payload.allowModelDownload
      ),
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    if (trackTranscription) this.transcriptionChild = child;
    try {
      return await collectWorkerResult(child, payload, signal, this.options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS);
    } finally {
      if (trackTranscription && this.transcriptionChild === child) this.transcriptionChild = undefined;
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
  protectedRoots: readonly string[];
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
  let protectedRoots: readonly string[] = [];
  if (runtime.mode === "managed") {
    if (!isAbsolute(runtime.privatePythonRoot) || !existsSync(runtime.privatePythonRoot)) runtimeUnavailable("The private CEVRA Python root is unavailable.");
    const privatePythonReal = realpathSync(runtime.privatePythonRoot);
    if (inside(privatePythonReal, environmentReal) || inside(environmentReal, privatePythonReal)) {
      runtimeUnavailable("The transcription dependency environment must be isolated from the private Python distribution.");
    }
    validateManagedVenvProvenance(environmentReal, privatePythonReal);
    const executableReal = realpathSync(runtime.pythonExecutable);
    if (!inside(privatePythonReal, executableReal) && !inside(environmentReal, executableReal)) {
      runtimeUnavailable("The managed interpreter escapes the authorized CEVRA runtime roots.");
    }
    protectedRoots = [privatePythonReal, environmentReal, ...resolveAdditionalProtectedRoots(runtime.protectedRoots)];
  }
  return {
    pythonExecutable: runtime.pythonExecutable,
    environmentRoot: environmentReal,
    workerScript: realpathSync(workerScript),
    protectedRoots
  };
}

function validateManagedVenvProvenance(environmentRoot: string, privatePythonRoot: string): void {
  const configPath = resolve(environmentRoot, "pyvenv.cfg");
  if (!existsSync(configPath) || lstatSync(configPath).isSymbolicLink() || !lstatSync(configPath).isFile()) {
    runtimeUnavailable("The managed transcription environment requires a regular pyvenv.cfg file.");
  }
  let fields: ReadonlyMap<string, string>;
  try {
    fields = parsePyvenvConfig(readFileSync(configPath, "utf8"));
  } catch (cause) {
    throw new LocalTranscriptionError(
      "TRANSCRIPTION_RUNTIME_UNAVAILABLE",
      "The managed transcription pyvenv.cfg is malformed.",
      { cause }
    );
  }
  if (fields.get("include-system-site-packages")?.toLowerCase() !== "false") {
    runtimeUnavailable("The managed transcription environment must disable system site-packages.");
  }
  const home = fields.get("home");
  if (!home) runtimeUnavailable("pyvenv.cfg does not identify the base Python home.");
  const provenanceFields = [
    ["home", home],
    ["executable", fields.get("executable")],
    ["base-executable", fields.get("base-executable")]
  ] as const;
  for (const [name, value] of provenanceFields) {
    if (value === undefined) continue;
    if (!isAbsolute(value) || /[\u0000-\u001f\u007f]/u.test(value)) {
      runtimeUnavailable(`pyvenv.cfg ${name} must be an absolute local path.`);
    }
    const resolved = canonicalizePotentialPath(value, `pyvenv.cfg ${name}`);
    if (!inside(privatePythonRoot, resolved)) {
      runtimeUnavailable(`pyvenv.cfg ${name} does not belong to the private CEVRA Python root.`);
    }
  }
}

export function parsePyvenvConfig(contents: string): ReadonlyMap<string, string> {
  const fields = new Map<string, string>();
  for (const [index, rawLine] of contents.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) throw new Error(`Invalid pyvenv.cfg line ${index + 1}.`);
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (!/^[a-z][a-z0-9-]*$/u.test(key) || !value || fields.has(key)) {
      throw new Error(`Invalid pyvenv.cfg field on line ${index + 1}.`);
    }
    fields.set(key, value);
  }
  return fields;
}

function resolveAdditionalProtectedRoots(roots: readonly string[] | undefined): string[] {
  if (roots === undefined) return [];
  if (!Array.isArray(roots)) runtimeUnavailable("protectedRoots must be an array of absolute local paths.");
  return roots.map((root, index) => {
    if (typeof root !== "string" || !isAbsolute(root) || /[\u0000-\u001f\u007f]/u.test(root)) {
      runtimeUnavailable(`protectedRoots[${index}] must be an absolute local path.`);
    }
    return canonicalizePotentialPath(root, `protectedRoots[${index}]`);
  });
}

export function assertModelCacheIsolated(modelCacheDir: string, protectedRoots: readonly string[]): void {
  const cacheLexical = resolve(modelCacheDir);
  const cacheCanonical = canonicalizePotentialPath(cacheLexical, "modelCacheDir");
  for (const protectedRoot of protectedRoots) {
    const rootLexical = resolve(protectedRoot);
    const rootCanonical = canonicalizePotentialPath(rootLexical, "protected root");
    if (
      pathsOverlap(cacheLexical, rootLexical) ||
      pathsOverlap(cacheCanonical, rootCanonical)
    ) {
      runtimeUnavailable("modelCacheDir must not overlap a protected CEVRA runtime root.");
    }
  }
}

export function canonicalizePotentialPath(path: string, label: string): string {
  let cursor = resolve(path);
  const suffix: string[] = [];
  while (!entryExists(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) runtimeUnavailable(`${label} cannot be canonicalized.`);
    suffix.unshift(basename(cursor));
    cursor = parent;
  }
  let existingReal: string;
  try {
    existingReal = realpathSync(cursor);
  } catch (cause) {
    throw new LocalTranscriptionError(
      "TRANSCRIPTION_RUNTIME_UNAVAILABLE",
      `${label} cannot be canonicalized safely.`,
      { cause }
    );
  }
  return resolve(existingReal, ...suffix);
}

function entryExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function pathsOverlap(left: string, right: string): boolean {
  return inside(left, right) || inside(right, left);
}

function workerEnvironment(
  environmentRoot: string,
  modelCacheDir: string | undefined,
  managed: boolean,
  offline: boolean
): NodeJS.ProcessEnv {
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
  if (offline) env.HF_HUB_OFFLINE = "1";
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
