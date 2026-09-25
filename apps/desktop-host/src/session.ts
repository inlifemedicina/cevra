import {
  LocalSourceIngestService,
  MediaApplicationService,
  ResolvedAudioPlanApplicationService,
  SourceTechnicalDescriptorApplicationService,
  SourceTechnicalDescriptorResolver,
  TranscriptionApplicationService
} from "@cevra/application";
import type {
  AdoptSourceTechnicalDescriptorOutcome,
  AdoptSourceTechnicalDescriptorRequest,
  ExecuteResolvedAudioPlanOutcome,
  ExecuteResolvedAudioPlanRequest,
  MediaExecutionRepository,
  MediaExecutionIntentRepository
} from "@cevra/application";
import type { MediaEngineAdapter } from "@cevra/contracts";
import {
  FfmpegMediaEngine,
  NodeMediaArtifactStore,
  PersistentMediaWorkerClient,
  ProcessMediaWorkerTransport
} from "@cevra/media-ffmpeg";
import { ProjectHistory } from "@cevra/project-ir";
import {
  assertModelCacheIsolated,
  FasterWhisperTranscriptionAdapter,
  resolveRuntimePaths as resolveTranscriptionRuntimePaths,
  type LocalTranscriptionAdapterOptions,
  type SupportedTranscriptionModelId
} from "@cevra/transcription-faster-whisper";
import { FileTranscriptCache } from "@cevra/transcript-cache";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { DesktopPersistenceError, DesktopProjectPersistence } from "./persistence.js";
import {
  DesktopMediaExecutionArchiveFullError,
  isDesktopMediaExecutionArchiveOperationalError
} from "./media-execution-archive.js";
import type { CapabilityState, DesktopHostState } from "./protocol.js";

type Locale = "pt-BR" | "en-US";

export interface DesktopSessionServices {
  history: ProjectHistory;
  ingest?: Pick<LocalSourceIngestService, "ingest">;
  sourceTechnicalDescriptor?: Pick<SourceTechnicalDescriptorApplicationService, "adopt">;
  transcription?: Pick<TranscriptionApplicationService, "transcribeSource">;
  mediaCapability: CapabilityState;
  transcriptionCapability: CapabilityState;
  persistence?: DesktopProjectPersistence;
  resolvedAudioPlan?: Pick<ResolvedAudioPlanApplicationService, "execute" | "markCheckpointSucceeded">;
  close?(): Promise<void>;
}

export class DesktopSession {
  private readonly operations = new Map<string, AbortController>();
  private readonly activeTasks = new Map<string, Promise<unknown>>();
  private activeMutationTask: Promise<unknown> | null = null;

  constructor(private readonly services: DesktopSessionServices) {}

  state(): DesktopHostState {
    return {
      project: this.services.history.current,
      canUndo: this.services.history.canUndo,
      canRedo: this.services.history.canRedo,
      status: { hostAvailable: true, persistence: this.services.persistence?.state ?? "local-unsaved" },
      capabilities: {
        mediaImport: { ...this.services.mediaCapability },
        transcription: { ...this.services.transcriptionCapability }
      }
    };
  }

  async ingestLocal(params: { uri: string; displayName: string; operationId: string; locale: Locale }): Promise<{ state: DesktopHostState; importedSourceId: string }> {
    if (!this.services.mediaCapability.available || !this.services.ingest) throw safeError("MEDIA_UNAVAILABLE");
    return this.runOperation(params.operationId, (signal) => this.runMutation(async () => {
      const outcome = await this.services.ingest!.ingest({ uri: params.uri, displayName: params.displayName, locale: params.locale }, signal);
      await this.persistMutation();
      return { state: this.state(), importedSourceId: outcome.source.id };
    }));
  }

  async transcribeSource(params: { sourceId: string; operationId: string; locale: Locale }): Promise<DesktopHostState> {
    if (!this.services.transcriptionCapability.available || !this.services.transcription) throw safeError("TRANSCRIPTION_UNAVAILABLE");
    return this.runOperation(params.operationId, (signal) => this.runMutation(async () => {
      await this.services.transcription!.transcribeSource({
        sourceId: params.sourceId,
        id: params.operationId,
        locale: params.locale,
        language: "auto",
        wordTimestamps: true
      }, signal);
      await this.persistMutation();
      return this.state();
    }));
  }

  /** Internal Desktop boundary; no WebView/Tauri command is exposed by MR-V01. */
  async adoptSourceTechnicalDescriptor(
    request: AdoptSourceTechnicalDescriptorRequest,
    signal?: AbortSignal
  ): Promise<AdoptSourceTechnicalDescriptorOutcome> {
    if (!this.services.mediaCapability.available || !this.services.sourceTechnicalDescriptor) throw safeError("MEDIA_UNAVAILABLE");
    return this.runMutation(async () => {
      const outcome = await this.services.sourceTechnicalDescriptor!.adopt(structuredClone(request), signal);
      await this.persistMutation();
      return outcome;
    });
  }

  cancel(operationId: string): { operationId: string; cancelled: boolean } {
    const controller = this.operations.get(operationId);
    if (!controller) return { operationId, cancelled: false };
    controller.abort();
    return { operationId, cancelled: true };
  }

  async undo(): Promise<DesktopHostState> {
    return this.runMutation(async () => {
      const changed = this.services.history.canUndo;
      this.services.history.undo();
      if (changed) await this.persistMutation();
      return this.state();
    });
  }

  async redo(): Promise<DesktopHostState> {
    return this.runMutation(async () => {
      const changed = this.services.history.canRedo;
      this.services.history.redo();
      if (changed) await this.persistMutation();
      return this.state();
    });
  }

  /** Internal Desktop composition boundary; intentionally not exposed by Tauri/WebView. */
  async executeResolvedAudioPlan(
    request: ExecuteResolvedAudioPlanRequest,
    signal?: AbortSignal
  ): Promise<ExecuteResolvedAudioPlanOutcome> {
    if (!this.services.resolvedAudioPlan) throw safeError("MEDIA_UNAVAILABLE");
    const stableRequest = structuredClone(request);
    const intentId = stableRequest.id;
    return this.runMutation(async () => {
      const outcome = await this.services.resolvedAudioPlan!.execute(stableRequest, signal);
      await this.persistMutation();
      await this.services.resolvedAudioPlan!.markCheckpointSucceeded(intentId);
      return outcome;
    });
  }

  async close(): Promise<void> {
    for (const controller of this.operations.values()) controller.abort();
    await Promise.allSettled([
      ...this.activeTasks.values(),
      ...(this.activeMutationTask ? [this.activeMutationTask] : [])
    ]);
    try {
      await this.services.close?.();
    } finally {
      await this.services.persistence?.close();
    }
  }

  private async runOperation<T>(operationId: string, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.operations.has(operationId)) throw safeError("OPERATION_DUPLICATE");
    const controller = new AbortController();
    this.operations.set(operationId, controller);
    const task = operation(controller.signal);
    this.activeTasks.set(operationId, task);
    try {
      return await task;
    } finally {
      this.operations.delete(operationId);
      this.activeTasks.delete(operationId);
    }
  }

  private async persistMutation(): Promise<void> {
    if (!this.services.persistence) return;
    try {
      await this.services.persistence.checkpoint(this.services.history);
    } catch {
      throw safeError("PROJECT_PERSISTENCE_FAILED", { state: this.state() });
    }
  }

  private async runMutation<T>(operation: () => Promise<T>): Promise<T> {
    if (this.activeMutationTask) throw safeError("PROJECT_MUTATION_BUSY");
    const task = operation();
    this.activeMutationTask = task;
    try {
      return await task;
    } finally {
      if (this.activeMutationTask === task) this.activeMutationTask = null;
    }
  }
}

export async function createProductionDesktopSession(environment: NodeJS.ProcessEnv = process.env): Promise<DesktopSession> {
  const persistenceRoot = environment.CEVRA_PROJECT_PERSISTENCE_ROOT;
  if (!persistenceRoot) throw new DesktopPersistenceError("PROJECT_PERSISTENCE_UNAVAILABLE");
  const opened = await DesktopProjectPersistence.open(persistenceRoot, {
    recoveredSession: environment.CEVRA_HOST_RECOVERY === "1"
  });
  const configuredMediaRuntime = configuredMediaRuntimePaths(environment);
  const sourceIdentity = new NodeMediaArtifactStore();
  let media: Awaited<ReturnType<typeof createMediaServices>> | undefined;
  let mediaArchiveFailure: "archive-full" | "archive-unavailable" | undefined;
  try {
    const history = opened.history;
    const executions = await opened.persistence.openMediaExecutionRepository(history.current.project.id);
    const recovery = composeMediaApplicationServices(history, executions, unavailableMediaEngine(), sourceIdentity);
    await recovery.application.reconcilePendingWithoutReplay();
    await recovery.resolvedAudioPlan.reconcilePendingWithoutReplay();
    media = await createMediaServices(history, environment, executions, configuredMediaRuntime, sourceIdentity);
  } catch (cause) {
    if (!isDesktopMediaExecutionArchiveOperationalError(cause)) {
      await media?.close?.().catch(() => undefined);
      await opened.persistence.close();
      throw cause;
    }
    await media?.close?.().catch(() => undefined);
    media = undefined;
    mediaArchiveFailure = cause instanceof DesktopMediaExecutionArchiveFullError
      ? "archive-full"
      : "archive-unavailable";
  }
  try {
    const history = opened.history;
    const transcription = configuredMediaRuntime.invalid
      ? { capability: unavailable("runtime-invalid") }
      : await createTranscriptionServices(history, environment, configuredMediaRuntime.paths?.root, sourceIdentity);
    return new DesktopSession({
      history,
      ...(media?.ingest ? { ingest: media.ingest } : {}),
      ...(media?.sourceTechnicalDescriptor ? { sourceTechnicalDescriptor: media.sourceTechnicalDescriptor } : {}),
      ...(transcription.service ? { transcription: transcription.service } : {}),
      mediaCapability: media?.capability ?? unavailable(mediaArchiveFailure ?? "archive-unavailable"),
      transcriptionCapability: transcription.capability,
      persistence: opened.persistence,
      ...(media?.resolvedAudioPlan ? { resolvedAudioPlan: media.resolvedAudioPlan } : {}),
      close: async () => {
        await media?.close?.();
      }
    });
  } catch (cause) {
    await media?.close?.().catch(() => undefined);
    await opened.persistence.close();
    throw cause;
  }
}

async function createMediaServices(
  history: ProjectHistory,
  environment: NodeJS.ProcessEnv,
  executions: MediaExecutionRepository & MediaExecutionIntentRepository,
  configuredRuntime: ConfiguredMediaRuntime,
  sourceIdentity: NodeMediaArtifactStore
): Promise<{
  capability: CapabilityState;
  ingest?: LocalSourceIngestService;
  sourceTechnicalDescriptor?: SourceTechnicalDescriptorApplicationService;
  application: MediaApplicationService;
  resolvedAudioPlan: ResolvedAudioPlanApplicationService;
  close?: () => Promise<void>;
  runtimeRoot?: string;
}> {
  if (configuredRuntime.invalid) {
    return { capability: unavailable("runtime-invalid"), ...composeMediaApplicationServices(history, executions, unavailableMediaEngine(), sourceIdentity) };
  }
  if (!configuredRuntime.paths) {
    return { capability: unavailable("runtime-not-configured"), ...composeMediaApplicationServices(history, executions, unavailableMediaEngine(), sourceIdentity) };
  }
  try {
    const runtime = configuredRuntime.paths;
    const root = runtime.root;
    const mode = environment.CEVRA_MEDIA_RUNTIME_MODE === "development" ? "development" : "release";
    const transport = new ProcessMediaWorkerTransport({
      mode,
      pythonExecutable: runtime.pythonExecutable,
      workerScript: runtime.workerScript,
      env: environment
    });
    const worker = new PersistentMediaWorkerClient(transport);
    const engine = new FfmpegMediaEngine(worker);
    const health = await engine.healthcheck();
    if (health.status === "unavailable") {
      await worker.close();
      return { capability: unavailable("runtime-invalid"), runtimeRoot: root, ...composeMediaApplicationServices(history, executions, unavailableMediaEngine(), sourceIdentity) };
    }
    const services = composeMediaApplicationServices(history, executions, engine, sourceIdentity);
    return {
      capability: available(),
      ingest: new LocalSourceIngestService({ media: services.application, history, identity: services.artifacts }),
      sourceTechnicalDescriptor: new SourceTechnicalDescriptorApplicationService({
        media: services.application,
        history,
        identity: services.artifacts
      }),
      ...services,
      close: () => worker.close(),
      runtimeRoot: root
    };
  } catch {
    return { capability: unavailable("runtime-invalid"), ...composeMediaApplicationServices(history, executions, unavailableMediaEngine(), sourceIdentity) };
  }
}

interface ConfiguredMediaRuntime {
  paths?: ReturnType<typeof resolveMediaRuntimePaths>;
  invalid: boolean;
}

function configuredMediaRuntimePaths(environment: NodeJS.ProcessEnv): ConfiguredMediaRuntime {
  const configuredRoot = environment.CEVRA_MEDIA_RUNTIME_ROOT;
  if (!configuredRoot) return { invalid: false };
  try {
    return { paths: resolveMediaRuntimePaths(configuredRoot), invalid: false };
  } catch {
    return { invalid: true };
  }
}

function composeMediaApplicationServices(
  history: ProjectHistory,
  executions: MediaExecutionRepository & MediaExecutionIntentRepository,
  engine: MediaEngineAdapter,
  artifacts = new NodeMediaArtifactStore()
): {
  application: MediaApplicationService;
  resolvedAudioPlan: ResolvedAudioPlanApplicationService;
  artifacts: NodeMediaArtifactStore;
} {
  const application = new MediaApplicationService({ engine, history, executions, artifacts });
  return {
    application,
    resolvedAudioPlan: new ResolvedAudioPlanApplicationService({
      history,
      media: application,
      intents: executions,
      sourceVerifier: new SourceTechnicalDescriptorResolver(artifacts)
    }),
    artifacts
  };
}

function unavailableMediaEngine(): MediaEngineAdapter {
  return {
    async identity() { return { id: "cevra.media.unavailable", kind: "media", displayName: "Unavailable Media Runtime", version: "0.0.0", apiVersion: 1 }; },
    async healthcheck() { return { status: "unavailable", checkedAt: new Date().toISOString(), checks: [] }; },
    async capabilities() { return []; },
    async execute() { throw new Error("Media Runtime is unavailable."); }
  };
}

async function createTranscriptionServices(
  history: ProjectHistory,
  environment: NodeJS.ProcessEnv,
  mediaRuntimeRoot: string | undefined,
  sourceIdentity: NodeMediaArtifactStore
): Promise<{
  capability: CapabilityState;
  service?: TranscriptionApplicationService;
}> {
  const pythonExecutable = environment.CEVRA_TRANSCRIPTION_PYTHON;
  const environmentRoot = environment.CEVRA_TRANSCRIPTION_ENV_ROOT;
  const modelCacheDir = environment.CEVRA_TRANSCRIPTION_MODEL_CACHE;
  if (!pythonExecutable || !environmentRoot || !modelCacheDir) return { capability: unavailable("runtime-not-configured") };
  const modelId = transcriptionModel(environment.CEVRA_TRANSCRIPTION_MODEL_ID);
  // This is intentionally only a cheap presence gate. The existing adapter
  // healthcheck remains authoritative for runtime/model integrity.
  if (!modelSnapshotPresent(modelCacheDir, modelId)) return { capability: unavailable("model-not-available") };
  try {
    const mode = environment.CEVRA_TRANSCRIPTION_MODE === "development" ? "development" : "managed";
    const runtime: LocalTranscriptionAdapterOptions["runtime"] = mode === "development"
      ? {
          mode: "development",
          pythonExecutable,
          environmentRoot,
          ...(environment.CEVRA_TRANSCRIPTION_WORKER ? { workerScript: environment.CEVRA_TRANSCRIPTION_WORKER } : {})
        }
      : {
          mode: "managed",
          pythonExecutable,
          environmentRoot,
          privatePythonRoot: requiredEnvironment(environment, "CEVRA_PRIVATE_PYTHON_ROOT"),
          ...(mediaRuntimeRoot ? { protectedRoots: [mediaRuntimeRoot] } : {})
        };
    const resolvedRuntime = resolveTranscriptionRuntimePaths(runtime);
    if (mode === "managed") assertModelCacheIsolated(modelCacheDir, resolvedRuntime.protectedRoots);
    const adapter = new FasterWhisperTranscriptionAdapter({
      runtime,
      profile: {
        modelCacheDir,
        modelId,
        allowModelDownload: false,
        device: device(environment.CEVRA_TRANSCRIPTION_DEVICE),
        computeType: computeType(environment.CEVRA_TRANSCRIPTION_COMPUTE_TYPE)
      }
    });
    const health = await adapter.healthcheck();
    if (health.status !== "ready") return { capability: unavailable("runtime-invalid") };
    const cacheRoot = environment.CEVRA_TRANSCRIPT_CACHE_ROOT;
    const cache = cacheRoot && isAbsolute(cacheRoot) ? new FileTranscriptCache(cacheRoot) : undefined;
    return {
      capability: available(),
      service: new TranscriptionApplicationService({
        engine: adapter,
        history,
        ...(cache ? { cache, sourceIdentity } : {})
      })
    };
  } catch {
    return { capability: unavailable("runtime-invalid") };
  }
}

export function resolveMediaRuntimePaths(value: string): { root: string; pythonExecutable: string; workerScript: string } {
  if (!isAbsolute(value) || !existsSync(value) || lstatSync(value).isSymbolicLink()) throw new Error("Invalid Media Runtime root.");
  const root = realpathSync(value);
  const manifestPath = resolve(root, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  if (manifest.format !== "cevra-media-runtime" || manifest.formatVersion !== 1) throw new Error("Invalid Media Runtime manifest.");
  const python = manifest.python;
  const worker = manifest.worker;
  if (!isRecord(python) || python.root !== "python" || !isRecord(worker) || worker.root !== "worker") {
    throw new Error("Invalid Media Runtime component manifest.");
  }
  const pythonExecutable = runtimeComponent(root, python.executable, "python/");
  const workerScript = runtimeComponent(root, worker.entrypoint, "worker/");
  return { root, pythonExecutable, workerScript };
}

function runtimeComponent(root: string, value: unknown, requiredPrefix: string): string {
  if (typeof value !== "string" || !value.startsWith(requiredPrefix) || value.includes("\\")) {
    throw new Error("Invalid Media Runtime component path.");
  }
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) throw new Error("Invalid Media Runtime component path.");
  const candidate = resolve(root, ...parts);
  const rootRelative = relative(root, candidate);
  if (!rootRelative || rootRelative === ".." || rootRelative.startsWith(`..${sep}`) || isAbsolute(rootRelative)) {
    throw new Error("Media Runtime component escapes its root.");
  }
  if (!existsSync(candidate) || lstatSync(candidate).isSymbolicLink() || !lstatSync(candidate).isFile()) {
    throw new Error("Incomplete Media Runtime.");
  }
  const real = realpathSync(candidate);
  const realRelative = relative(root, real);
  if (!realRelative || realRelative === ".." || realRelative.startsWith(`..${sep}`) || isAbsolute(realRelative)) {
    throw new Error("Media Runtime component escapes its root.");
  }
  return real;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function modelSnapshotPresent(cacheRoot: string, modelId: string): boolean {
  if (!isAbsolute(cacheRoot) || !existsSync(cacheRoot)) return false;
  const repository = `models--Systran--faster-whisper-${modelId}`;
  const snapshots = resolve(cacheRoot, "hub", repository, "snapshots");
  const alternateSnapshots = resolve(cacheRoot, repository, "snapshots");
  return directoryExists(snapshots) || directoryExists(alternateSnapshots);
}

function directoryExists(value: string): boolean {
  try { return lstatSync(value).isDirectory() && readdirSync(value, { withFileTypes: true }).some((entry) => entry.isDirectory()); } catch { return false; }
}

function requiredEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function device(value: string | undefined): "auto" | "cpu" | "cuda" {
  return value === "auto" || value === "cuda" ? value : "cpu";
}

function computeType(value: string | undefined): "default" | "int8" | "int8_float16" | "float16" | "float32" {
  return value === "default" || value === "int8_float16" || value === "float16" || value === "float32" ? value : "int8";
}

function transcriptionModel(value: string | undefined): SupportedTranscriptionModelId {
  if (value === "tiny" || value === "small" || value === "medium" || value === "large-v3" || value === "turbo") return value;
  return "base";
}

function available(): CapabilityState { return { available: true, reason: "available" }; }
function unavailable(reason: Exclude<CapabilityState["reason"], "available">): CapabilityState { return { available: false, reason }; }

function safeError(code: string, details?: Record<string, unknown>): Error {
  return Object.assign(new Error(code), { code, ...(details ? { details } : {}) });
}
