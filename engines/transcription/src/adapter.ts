import type {
  CapabilityDescriptor,
  EngineHealth,
  EngineIdentity,
  ExecutionContext,
  TranscriptionEngineAdapter,
  TranscriptionRequest,
  TranscriptionResult
} from "@cevra/contracts";
import { CEVRA_ENGINE_API_VERSION } from "@cevra/contracts";
import { LocalTranscriptionError, cancellationError } from "./errors.js";
import { ProcessTranscriptionWorkerRunner } from "./process-runner.js";
import {
  DEFAULT_TRANSCRIPTION_MODEL_ID,
  FASTER_WHISPER_VERSION,
  TRANSCRIPTION_PROTOCOL_VERSION,
  type LocalTranscriptionAdapterOptions,
  type SupportedTranscriptionModelId,
  type TranscriptionWorkerRunner
} from "./types.js";
import { normalizeWorkerResult, validateAndNormalizeRequest, validateModelCacheDir, validateModelId } from "./validation.js";

export class FasterWhisperTranscriptionAdapter implements TranscriptionEngineAdapter {
  private readonly runner: TranscriptionWorkerRunner;
  private readonly modelId: SupportedTranscriptionModelId;
  private activeJobId: string | undefined;

  constructor(private readonly options: LocalTranscriptionAdapterOptions) {
    this.modelId = options.profile.modelId ?? DEFAULT_TRANSCRIPTION_MODEL_ID;
    validateModelId(this.modelId);
    validateModelCacheDir(options.profile.modelCacheDir);
    if (options.profile.device !== undefined && !["auto", "cpu", "cuda"].includes(options.profile.device)) {
      throw new LocalTranscriptionError("TRANSCRIPTION_INVALID_REQUEST", "The configured transcription device is not allow-listed.");
    }
    if (options.profile.computeType !== undefined && !["default", "int8", "int8_float16", "float16", "float32"].includes(options.profile.computeType)) {
      throw new LocalTranscriptionError("TRANSCRIPTION_INVALID_REQUEST", "The configured transcription compute type is not allow-listed.");
    }
    this.runner = options.runner ?? new ProcessTranscriptionWorkerRunner({ runtime: options.runtime });
  }

  async identity(): Promise<EngineIdentity> {
    return {
      id: "cevra.transcription.faster-whisper",
      kind: "transcription",
      displayName: "CEVRA Local Transcription",
      version: FASTER_WHISPER_VERSION,
      apiVersion: CEVRA_ENGINE_API_VERSION
    };
  }

  async healthcheck(): Promise<EngineHealth> {
    try {
      const health = await this.runner.healthcheck();
      return {
        status: "ready",
        checkedAt: new Date().toISOString(),
        checks: [{
          id: "faster-whisper-runtime",
          status: "PASS",
          evidence: { protocolVersion: health.protocolVersion, fasterWhisperVersion: health.fasterWhisperVersion }
        }]
      };
    } catch (error) {
      return {
        status: "unavailable",
        checkedAt: new Date().toISOString(),
        checks: [{ id: "faster-whisper-runtime", status: "FAIL", evidence: { code: error instanceof LocalTranscriptionError ? error.code : "TRANSCRIPTION_FAILED" } }]
      };
    }
  }

  async capabilities(): Promise<CapabilityDescriptor[]> {
    const health = await this.healthcheck();
    const available = health.status === "ready";
    return [
      { id: "transcription.local.faster-whisper", version: 1, available, detail: `model=${this.modelId}` },
      { id: "transcription.language.auto-pt-en", version: 1, available },
      { id: "transcription.word-timestamps.model", version: 1, available },
      { id: "transcription.forced-alignment", version: 1, available: false, detail: "WhisperX is not implemented." },
      { id: "transcription.diarization", version: 1, available: false }
    ];
  }

  async transcribe(request: TranscriptionRequest, context: ExecutionContext): Promise<TranscriptionResult> {
    if (!context?.jobId || typeof context.jobId !== "string" || !context.jobId.trim()) {
      throw new LocalTranscriptionError("TRANSCRIPTION_INVALID_REQUEST", "ExecutionContext.jobId is required.");
    }
    if (context.signal?.aborted) throw cancellationError(context.signal.reason);
    const normalized = validateAndNormalizeRequest(request);
    if (this.activeJobId !== undefined) {
      throw new LocalTranscriptionError("TRANSCRIPTION_BUSY", `Transcription job ${this.activeJobId} is already active.`);
    }
    this.activeJobId = context.jobId;
    const workerRequest = {
      protocolVersion: TRANSCRIPTION_PROTOCOL_VERSION,
      operation: "transcribe" as const,
      jobId: context.jobId,
      inputPath: normalized.inputPath,
      ...(normalized.language ? { language: normalized.language } : {}),
      wordTimestamps: normalized.wordTimestamps,
      modelId: this.modelId,
      modelCacheDir: this.options.profile.modelCacheDir,
      allowModelDownload: this.options.profile.allowModelDownload ?? false,
      device: this.options.profile.device ?? "cpu",
      computeType: this.options.profile.computeType ?? "int8"
    };
    try {
      const raw = await this.runner.transcribe(workerRequest, context);
      return normalizeWorkerResult(raw, workerRequest);
    } catch (error) {
      if (context.signal?.aborted && !(error instanceof LocalTranscriptionError && error.code === "TRANSCRIPTION_CANCELLED")) {
        throw cancellationError(error);
      }
      throw error;
    } finally {
      this.activeJobId = undefined;
    }
  }
}
