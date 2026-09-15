import {
  InMemoryMediaExecutionRepository,
  LocalSourceIngestService,
  MediaApplicationService,
  TranscriptionApplicationService
} from "@cevra/application";
import {
  FfmpegMediaEngine,
  NodeMediaArtifactStore,
  PersistentMediaWorkerClient,
  ProcessMediaWorkerTransport
} from "@cevra/media-ffmpeg";
import { createEmptyProject, ProjectHistory } from "@cevra/project-ir";
import {
  FasterWhisperTranscriptionAdapter,
  type LocalTranscriptionAdapterOptions,
  type SupportedTranscriptionModelId
} from "@cevra/transcription-faster-whisper";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import type { CapabilityState, DesktopHostState } from "./protocol.js";

type Locale = "pt-BR" | "en-US";

export interface DesktopSessionServices {
  history: ProjectHistory;
  ingest?: Pick<LocalSourceIngestService, "ingest">;
  transcription?: Pick<TranscriptionApplicationService, "transcribeSource">;
  mediaCapability: CapabilityState;
  transcriptionCapability: CapabilityState;
  close?(): Promise<void>;
}

export class DesktopSession {
  private readonly operations = new Map<string, AbortController>();
  private readonly activeTasks = new Map<string, Promise<unknown>>();

  constructor(private readonly services: DesktopSessionServices) {}

  state(): DesktopHostState {
    return {
      project: this.services.history.current,
      canUndo: this.services.history.canUndo,
      canRedo: this.services.history.canRedo,
      status: { hostAvailable: true, persistence: "local-unsaved" },
      capabilities: {
        mediaImport: { ...this.services.mediaCapability },
        transcription: { ...this.services.transcriptionCapability }
      }
    };
  }

  async ingestLocal(params: { uri: string; displayName: string; operationId: string; locale: Locale }): Promise<{ state: DesktopHostState; importedSourceId: string }> {
    if (!this.services.mediaCapability.available || !this.services.ingest) throw safeError("MEDIA_UNAVAILABLE");
    return this.runOperation(params.operationId, async (signal) => {
      const outcome = await this.services.ingest!.ingest({ uri: params.uri, displayName: params.displayName, locale: params.locale }, signal);
      return { state: this.state(), importedSourceId: outcome.source.id };
    });
  }

  async transcribeSource(params: { sourceId: string; operationId: string; locale: Locale }): Promise<DesktopHostState> {
    if (!this.services.transcriptionCapability.available || !this.services.transcription) throw safeError("TRANSCRIPTION_UNAVAILABLE");
    return this.runOperation(params.operationId, async (signal) => {
      await this.services.transcription!.transcribeSource({
        sourceId: params.sourceId,
        id: params.operationId,
        locale: params.locale,
        language: "auto",
        wordTimestamps: true
      }, signal);
      return this.state();
    });
  }

  cancel(operationId: string): { operationId: string; cancelled: boolean } {
    const controller = this.operations.get(operationId);
    if (!controller) return { operationId, cancelled: false };
    controller.abort();
    return { operationId, cancelled: true };
  }

  undo(): DesktopHostState {
    this.services.history.undo();
    return this.state();
  }

  redo(): DesktopHostState {
    this.services.history.redo();
    return this.state();
  }

  async close(): Promise<void> {
    for (const controller of this.operations.values()) controller.abort();
    await Promise.allSettled([...this.activeTasks.values()]);
    await this.services.close?.();
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
}

export async function createProductionDesktopSession(environment: NodeJS.ProcessEnv = process.env): Promise<DesktopSession> {
  const history = new ProjectHistory(createEmptyProject({ name: "CEVRA Vids", locale: "pt-BR" }));
  const media = await createMediaServices(history, environment);
  const transcription = await createTranscriptionServices(history, environment, media.runtimeRoot);
  return new DesktopSession({
    history,
    ...(media.ingest ? { ingest: media.ingest } : {}),
    ...(transcription.service ? { transcription: transcription.service } : {}),
    mediaCapability: media.capability,
    transcriptionCapability: transcription.capability,
    close: async () => {
      await media.close?.();
    }
  });
}

async function createMediaServices(history: ProjectHistory, environment: NodeJS.ProcessEnv): Promise<{
  capability: CapabilityState;
  ingest?: LocalSourceIngestService;
  close?: () => Promise<void>;
  runtimeRoot?: string;
}> {
  const configuredRoot = environment.CEVRA_MEDIA_RUNTIME_ROOT;
  if (!configuredRoot) return { capability: unavailable("runtime-not-configured") };
  try {
    const root = validatedMediaRuntimeRoot(configuredRoot);
    const mode = environment.CEVRA_MEDIA_RUNTIME_MODE === "development" ? "development" : "release";
    const pythonExecutable = resolve(root, "python", "bin", "python3");
    const workerScript = resolve(root, "worker", "cevra_media_worker.py");
    const transport = new ProcessMediaWorkerTransport({ mode, pythonExecutable, workerScript, env: environment });
    const worker = new PersistentMediaWorkerClient(transport);
    const engine = new FfmpegMediaEngine(worker);
    const health = await engine.healthcheck();
    if (health.status === "unavailable") {
      await worker.close();
      return { capability: unavailable("runtime-invalid"), runtimeRoot: root };
    }
    const application = new MediaApplicationService({
      engine,
      history,
      executions: new InMemoryMediaExecutionRepository(),
      artifacts: new NodeMediaArtifactStore()
    });
    return {
      capability: available(),
      ingest: new LocalSourceIngestService({ media: application, history }),
      close: () => worker.close(),
      runtimeRoot: root
    };
  } catch {
    return { capability: unavailable("runtime-invalid") };
  }
}

async function createTranscriptionServices(history: ProjectHistory, environment: NodeJS.ProcessEnv, mediaRuntimeRoot?: string): Promise<{
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
    return { capability: available(), service: new TranscriptionApplicationService({ engine: adapter, history }) };
  } catch {
    return { capability: unavailable("runtime-invalid") };
  }
}

function validatedMediaRuntimeRoot(value: string): string {
  if (!isAbsolute(value) || !existsSync(value) || lstatSync(value).isSymbolicLink()) throw new Error("Invalid Media Runtime root.");
  const root = realpathSync(value);
  const manifestPath = resolve(root, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  if (manifest.format !== "cevra-media-runtime" || manifest.formatVersion !== 1) throw new Error("Invalid Media Runtime manifest.");
  for (const required of [resolve(root, "python", "bin", "python3"), resolve(root, "worker", "cevra_media_worker.py")]) {
    if (!existsSync(required) || !lstatSync(required).isFile()) throw new Error("Incomplete Media Runtime.");
  }
  return root;
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

function safeError(code: string): Error {
  return Object.assign(new Error(code), { code });
}
