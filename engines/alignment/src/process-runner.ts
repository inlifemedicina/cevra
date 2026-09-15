import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExecutionContext } from "@cevra/contracts";
import { alignmentCancellation, LocalAlignmentError, type LocalAlignmentErrorCode } from "./errors.js";
import { ALIGNMENT_PROTOCOL_VERSION, CEVRA_ALIGNMENT_VERSION, type AlignmentRuntime, type AlignmentWorkerHealth, type AlignmentWorkerRequest, type AlignmentWorkerRunner } from "./types.js";

const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
export const MAX_ALIGNMENT_MESSAGE_BYTES = MAX_OUTPUT_BYTES;
const STOP_TIMEOUT_MS = 2000;
const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packagedWorker = resolve(engineRoot, "python", "cevra_alignment_worker.py");

export class ProcessAlignmentWorkerRunner implements AlignmentWorkerRunner {
  private child: ChildProcessWithoutNullStreams | undefined;
  constructor(private readonly options: { runtime: AlignmentRuntime; stopTimeoutMs?: number }) {
    if (options.stopTimeoutMs !== undefined && (!Number.isFinite(options.stopTimeoutMs) || options.stopTimeoutMs <= 0)) throw new RangeError("stopTimeoutMs must be positive.");
  }
  async align(request: AlignmentWorkerRequest, context: ExecutionContext): Promise<unknown> { return this.execute(request, context.signal, true); }
  async healthcheck(): Promise<AlignmentWorkerHealth> {
    const raw = await this.execute({ protocolVersion: 1, operation: "health" }, undefined, false);
    if (!isRecord(raw) || raw.protocolVersion !== 1 || raw.status !== "ready" || raw.alignmentVersion !== CEVRA_ALIGNMENT_VERSION || Object.keys(raw).some((key) => !["protocolVersion", "status", "alignmentVersion"].includes(key))) {
      throw new LocalAlignmentError("ALIGNMENT_MALFORMED_RESULT", "Alignment worker health response is malformed.");
    }
    return raw as unknown as AlignmentWorkerHealth;
  }
  get workerPid(): number | undefined { return this.child?.exitCode === null && this.child.signalCode === null ? this.child.pid : undefined; }
  private async execute(payload: AlignmentWorkerRequest | { protocolVersion: 1; operation: "health" }, signal: AbortSignal | undefined, track: boolean): Promise<unknown> {
    if (signal?.aborted) throw alignmentCancellation(signal.reason);
    const encoded = encodeRequest(payload);
    const paths = resolveRuntimePaths(this.options.runtime);
    const child = spawn(paths.pythonExecutable, ["-I", "-B", paths.workerScript], {
      cwd: paths.environmentRoot,
      env: workerEnvironment(paths.environmentRoot, this.options.runtime.mode === "managed"), shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"]
    });
    if (track) this.child = child;
    try { return await collect(child, encoded, signal, this.options.stopTimeoutMs ?? STOP_TIMEOUT_MS); }
    finally { if (track && this.child === child) this.child = undefined; }
  }
}

export function resolveRuntimePaths(runtime: AlignmentRuntime): { pythonExecutable: string; environmentRoot: string; workerScript: string } {
  if (!runtime.pythonExecutable || !isAbsolute(runtime.pythonExecutable)) unavailable("An explicit absolute Python executable is required.");
  const environmentRoot = resolve(runtime.environmentRoot ?? dirname(runtime.pythonExecutable));
  const workerScript = resolve(runtime.mode === "development" && runtime.workerScript ? runtime.workerScript : packagedWorker);
  for (const [label, path] of [["Python executable", runtime.pythonExecutable], ["alignment environment", environmentRoot], ["worker script", workerScript]] as const) {
    if (!existsSync(path)) unavailable(`${label} is unavailable.`);
    if (label !== "Python executable" && lstatSync(path).isSymbolicLink()) unavailable(`${label} must not be a symlink.`);
  }
  const environmentReal = realpathSync(environmentRoot);
  if (!inside(environmentRoot, resolve(runtime.pythonExecutable))) unavailable("The Python executable must belong to the alignment environment.");
  if (runtime.mode === "managed") {
    if (!isAbsolute(runtime.privatePythonRoot) || !existsSync(runtime.privatePythonRoot)) unavailable("The private CEVRA Python root is unavailable.");
    const privateRoot = realpathSync(runtime.privatePythonRoot);
    if (overlap(privateRoot, environmentReal)) unavailable("The alignment dependency environment must be isolated from the private Python distribution.");
    validateVenv(environmentReal, privateRoot);
    const executableReal = realpathSync(runtime.pythonExecutable);
    if (!inside(privateRoot, executableReal) && !inside(environmentReal, executableReal)) unavailable("The managed alignment interpreter escapes authorized runtime roots.");
    for (const protectedRoot of runtime.protectedRoots ?? []) {
      if (!isAbsolute(protectedRoot) || !existsSync(protectedRoot) || overlap(realpathSync(protectedRoot), environmentReal)) unavailable("The alignment environment overlaps a protected runtime root.");
    }
  }
  // Preserve the venv launcher path: resolving its symlink to the base interpreter
  // would discard the isolated alignment environment at process startup.
  return { pythonExecutable: resolve(runtime.pythonExecutable), environmentRoot: environmentReal, workerScript: realpathSync(workerScript) };
}

function validateVenv(environmentRoot: string, privateRoot: string): void {
  const path = resolve(environmentRoot, "pyvenv.cfg");
  if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) unavailable("The managed alignment environment requires pyvenv.cfg.");
  const fields = new Map(readFileSync(path, "utf8").split(/\r?\n/u).filter(Boolean).map((line) => { const at = line.indexOf("="); if (at <= 0) unavailable("Alignment pyvenv.cfg is malformed."); return [line.slice(0, at).trim().toLowerCase(), line.slice(at + 1).trim()]; }));
  if (fields.get("include-system-site-packages")?.toLowerCase() !== "false") unavailable("System site-packages must be disabled.");
  const home = fields.get("home");
  if (!home) unavailable("Alignment venv provenance is missing.");
  for (const [name, value] of [["home", home], ["executable", fields.get("executable")], ["base-executable", fields.get("base-executable")]] as const) {
    if (value === undefined) continue;
    if (!isAbsolute(value) || /[\u0000-\u001f\u007f]/u.test(value) || !inside(privateRoot, canonicalizePotentialPath(value))) unavailable(`Alignment pyvenv.cfg ${name} escapes the private Python root.`);
  }
}

function canonicalizePotentialPath(path: string): string {
  let cursor = resolve(path); const suffix: string[] = [];
  while (!existsSync(cursor)) { const parent = dirname(cursor); if (parent === cursor) unavailable("A managed runtime path cannot be canonicalized."); suffix.unshift(basename(cursor)); cursor = parent; }
  return resolve(realpathSync(cursor), ...suffix);
}

export async function verifyPinnedModel(modelPath: string, files: Readonly<Record<string, string>>): Promise<void> {
  try {
    if (!isAbsolute(modelPath) || !existsSync(modelPath) || !lstatSync(modelPath).isDirectory() || lstatSync(modelPath).isSymbolicLink()) throw new LocalAlignmentError("ALIGNMENT_MODEL_UNAVAILABLE", "The pinned local alignment model is unavailable.");
    const root = realpathSync(modelPath);
    const expectedNames = Object.keys(files).sort();
    const entries = readdirSync(root, { withFileTypes: true });
    const actualNames = entries.map((entry) => entry.name).sort();
    if (actualNames.length !== expectedNames.length || actualNames.some((name, index) => name !== expectedNames[index])) {
      throw new LocalAlignmentError("ALIGNMENT_MODEL_UNAVAILABLE", "The pinned local alignment model contains an unexpected runtime file.");
    }
    if (entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())) {
      throw new LocalAlignmentError("ALIGNMENT_MODEL_UNAVAILABLE", "The pinned local alignment model contains an unsupported filesystem entry.");
    }
    for (const [name, expected] of Object.entries(files)) {
      const path = resolve(root, name);
      if (!inside(root, path) || !existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new LocalAlignmentError("ALIGNMENT_MODEL_UNAVAILABLE", "The pinned local alignment model is incomplete.");
      const actual = await sha256(path);
      if (actual !== expected) throw new LocalAlignmentError("ALIGNMENT_MODEL_UNAVAILABLE", "The pinned local alignment model failed integrity verification.");
    }
  } catch (cause) {
    if (cause instanceof LocalAlignmentError) throw cause;
    throw new LocalAlignmentError("ALIGNMENT_MODEL_UNAVAILABLE", "The pinned local alignment model could not be verified.", { cause });
  }
}

export function assertModelRootIsolated(modelRoot: string, runtime: AlignmentRuntime): void {
  if (!isAbsolute(modelRoot)) unavailable("The alignment model root must be absolute.");
  if (runtime.mode !== "managed") return;
  const candidateLexical = resolve(modelRoot);
  const candidateCanonical = canonicalizePotentialPath(candidateLexical);
  for (const protectedPath of [runtime.privatePythonRoot, runtime.environmentRoot, ...(runtime.protectedRoots ?? [])]) {
    if (!isAbsolute(protectedPath)) unavailable("A protected alignment runtime root is invalid.");
    const protectedLexical = resolve(protectedPath);
    const protectedCanonical = canonicalizePotentialPath(protectedLexical);
    if (overlap(candidateLexical, protectedLexical) || overlap(candidateCanonical, protectedCanonical)) unavailable("The alignment model root overlaps a protected runtime root.");
  }
}

function sha256(path: string): Promise<string> { return new Promise((resolveHash, reject) => { const hash = createHash("sha256"); const stream = createReadStream(path); stream.on("error", reject); stream.on("data", (chunk) => hash.update(chunk)); stream.on("end", () => resolveHash(hash.digest("hex"))); }); }
function workerEnvironment(environmentRoot: string, managed: boolean): NodeJS.ProcessEnv { return { LANG: process.env.LANG ?? "C.UTF-8", LC_ALL: process.env.LC_ALL ?? process.env.LANG ?? "C.UTF-8", PYTHONNOUSERSITE: "1", PYTHONDONTWRITEBYTECODE: "1", VIRTUAL_ENV: environmentRoot, PATH: "", HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1", CEVRA_ALIGNMENT_MANAGED: managed ? "1" : "0" }; }

async function collect(child: ChildProcessWithoutNullStreams, encodedRequest: string, signal: AbortSignal | undefined, timeout: number): Promise<unknown> {
  const stdout: Buffer[] = []; const stderr: Buffer[] = []; let bytes = 0; let cancelled = false; let force: ReturnType<typeof setTimeout> | undefined;
  const abort = () => { cancelled = true; if (child.exitCode === null && child.signalCode === null) { child.kill("SIGTERM"); force = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }, timeout); } };
  return new Promise((resolveResult, reject) => {
    let settled = false;
    const cleanup = () => { signal?.removeEventListener("abort", abort); if (force) clearTimeout(force); };
    const settle = (fn: () => void) => { if (settled) return; settled = true; cleanup(); fn(); };
    child.stdout.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes <= MAX_OUTPUT_BYTES) stdout.push(chunk); else child.kill("SIGKILL"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr.push(chunk); if (Buffer.concat(stderr).length > 8192) stderr.shift(); });
    child.stdin.on("error", () => undefined);
    child.once("error", (cause) => settle(() => reject(new LocalAlignmentError("ALIGNMENT_WORKER_START_FAILED", "The alignment worker could not be started.", { cause }))));
    child.once("close", (code, signalCode) => settle(() => {
      if (cancelled || signal?.aborted) return reject(alignmentCancellation(signal?.reason));
      if (bytes > MAX_OUTPUT_BYTES) return reject(new LocalAlignmentError("ALIGNMENT_FAILED", `The alignment worker exceeded the ${MAX_OUTPUT_BYTES}-byte output limit.`));
      if (code !== 0) return reject(new LocalAlignmentError("ALIGNMENT_FAILED", `The alignment worker exited unexpectedly (${code ?? signalCode ?? "unknown"}).`, stderr.length ? { cause: new Error(Buffer.concat(stderr).toString("utf8")) } : undefined));
      let envelope: unknown; try { envelope = JSON.parse(Buffer.concat(stdout).toString("utf8").trim()); } catch (cause) { return reject(new LocalAlignmentError("ALIGNMENT_MALFORMED_RESULT", "The alignment worker returned invalid JSON.", { cause })); }
      if (!isRecord(envelope)) return reject(new LocalAlignmentError("ALIGNMENT_MALFORMED_RESULT", "The alignment worker envelope is malformed."));
      if (envelope.ok === true && Object.keys(envelope).every((key) => ["ok", "result"].includes(key))) return resolveResult(envelope.result);
      if (envelope.ok === false && isRecord(envelope.error) && typeof envelope.error.code === "string") return reject(new LocalAlignmentError(workerCode(envelope.error.code), typeof envelope.error.message === "string" ? envelope.error.message : "Alignment failed."));
      reject(new LocalAlignmentError("ALIGNMENT_MALFORMED_RESULT", "The alignment worker envelope is malformed."));
    }));
    signal?.addEventListener("abort", abort, { once: true }); if (signal?.aborted) abort();
    // One request; stdin remains open as the parent-liveness channel until worker exit.
    child.stdin.write(encodedRequest);
  });
}
function encodeRequest(payload: object): string {
  let encoded: string;
  try { encoded = `${JSON.stringify(payload)}\n`; } catch (cause) { throw new LocalAlignmentError("ALIGNMENT_INVALID_REQUEST", "The alignment request is not serializable.", { cause }); }
  if (Buffer.byteLength(encoded, "utf8") > MAX_OUTPUT_BYTES) throw new LocalAlignmentError("ALIGNMENT_INVALID_REQUEST", `The alignment request exceeds the ${MAX_OUTPUT_BYTES}-byte limit.`);
  return encoded;
}
function workerCode(code: string): LocalAlignmentErrorCode { switch (code) { case "RUNTIME_UNAVAILABLE": return "ALIGNMENT_RUNTIME_UNAVAILABLE"; case "MODEL_UNAVAILABLE": return "ALIGNMENT_MODEL_UNAVAILABLE"; case "UNSUPPORTED_LANGUAGE": return "ALIGNMENT_UNSUPPORTED_LANGUAGE"; case "INVALID_REQUEST": return "ALIGNMENT_INVALID_REQUEST"; default: return "ALIGNMENT_FAILED"; } }
function inside(root: string, candidate: string): boolean { const rel = relative(root, candidate); return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel)); }
function overlap(a: string, b: string): boolean { return inside(a, b) || inside(b, a); }
function unavailable(message: string): never { throw new LocalAlignmentError("ALIGNMENT_RUNTIME_UNAVAILABLE", message); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
