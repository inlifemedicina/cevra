import {
  AUDIO_SEQUENCE_SAMPLE_FORMAT,
  AUDIO_SEQUENCE_SAMPLE_RATE,
  MEDIA_DELIVERY_MATRIX,
  normalizeAudioCodec,
  normalizeVideoCodec,
  resolveAudioDelivery,
  resolveAudioMutationDelivery,
  resolveMediaContainer,
  resolveStandardAvDelivery,
  resolveTranscodeDelivery,
  validateMediaOperation,
  type MediaEngineAdapter,
  type MediaOperation,
  type MediaOperationResult
} from "@cevra/contracts";
import { applyCommand, type EditCommand, type ProjectHistory, type ProjectIR } from "@cevra/project-ir";
import { MediaApplicationError } from "./errors.js";
import type { MediaExecutionRepository } from "./repository.js";
import {
  provenanceFrom,
  type MediaApplicationErrorCode,
  type MediaExecutionAttempt,
  type MediaExecutionOutcome,
  type MediaExecutionRecord,
  type MediaExecutionRequest,
  type MediaProjectMutation,
  type MediaRecoveryResult
} from "./types.js";

export interface MediaArtifactStore {
  kind(uri: string): Promise<"missing" | "file" | "symlink" | "other">;
  exists(uri: string): Promise<boolean>;
  remove(uri: string): Promise<void>;
}

export interface MediaApplicationServiceOptions {
  engine: MediaEngineAdapter;
  history: ProjectHistory;
  executions: MediaExecutionRepository;
  artifacts: MediaArtifactStore;
  clock?: () => string;
  idGenerator?: () => string;
}

class AttemptFailure extends Error {
  constructor(readonly code: MediaApplicationErrorCode, message: string, readonly parameter?: string) {
    super(message);
  }
}

export class MediaApplicationService {
  private readonly engine: MediaEngineAdapter;
  private readonly history: ProjectHistory;
  private readonly executions: MediaExecutionRepository;
  private readonly artifacts: MediaArtifactStore;
  private readonly clock: () => string;
  private readonly idGenerator: () => string;

  constructor(options: MediaApplicationServiceOptions) {
    this.engine = options.engine;
    this.history = options.history;
    this.executions = options.executions;
    this.artifacts = options.artifacts;
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.idGenerator = options.idGenerator ?? defaultId;
  }

  async execute(request: MediaExecutionRequest, signal?: AbortSignal): Promise<MediaExecutionOutcome> {
    const executionId = request.id ?? this.idGenerator();
    const locale = request.locale ?? this.history.current.project.defaultLocale;
    let operation: MediaOperation;
    try {
      operation = validateMediaOperation(request.operation);
      validateMutation(operation, request.mutation);
    } catch (cause) {
      throw new MediaApplicationError("MEDIA_INVALID_REQUEST", locale, executionId, {}, cause);
    }
    if (await this.executions.get(executionId)) {
      throw new MediaApplicationError("MEDIA_INVALID_REQUEST", locale, executionId);
    }
    const record: MediaExecutionRecord = {
      id: executionId,
      projectId: this.history.current.project.id,
      locale,
      operation: clone(operation),
      mutation: clone(request.mutation),
      actor: clone(request.actor ?? { type: "user" }),
      status: "requested",
      createdAt: this.clock(),
      attempts: []
    };
    await this.executions.save(record);
    return this.runAttempt(record, signal);
  }

  async retry(executionId: string, signal?: AbortSignal): Promise<MediaExecutionOutcome> {
    const record = await this.executions.get(executionId);
    const locale = record?.locale ?? this.history.current.project.defaultLocale;
    if (!record) throw new MediaApplicationError("MEDIA_OPERATION_NOT_FOUND", locale, executionId);
    if (record.projectId !== this.history.current.project.id || !["failed", "cancelled", "interrupted"].includes(record.status)) {
      throw new MediaApplicationError("MEDIA_OPERATION_NOT_RETRYABLE", locale, executionId);
    }
    try {
      record.operation = clone(validateMediaOperation(record.operation));
      validateMutation(record.operation, record.mutation);
    } catch (cause) {
      record.status = "failed";
      await this.executions.save(record);
      throw new MediaApplicationError("MEDIA_INVALID_REQUEST", locale, executionId, {}, cause);
    }
    return this.runAttempt(record, signal);
  }

  async recoverPending(): Promise<MediaRecoveryResult[]> {
    const projectId = this.history.current.project.id;
    const pending = await this.executions.listByStatus(projectId, ["requested", "running", "committing"]);
    const recovered: MediaRecoveryResult[] = [];
    for (const record of pending) {
      const attempt = record.attempts.at(-1);
      if (record.status === "committing" && attempt?.result && mutationApplied(record, this.history.current)) {
        const project = this.history.current;
        const entry = committedEntry(record, this.history.entries);
        attempt.status = "succeeded";
        attempt.completedAt = this.clock();
        attempt.projectRevisionAfter = project.history.revision;
        if (project.history.headSnapshotId) attempt.projectSnapshotAfter = project.history.headSnapshotId;
        if (entry) attempt.projectJournalEntryId = entry.id;
        record.status = "succeeded";
        await this.executions.save(record);
        recovered.push({ executionId: record.id, status: "succeeded" });
        continue;
      }
      if (attempt) {
        const cleanup = await this.cleanup(attempt.outputUris, attempt.preexistingOutputUris);
        attempt.removedPartialOutputUris.push(...cleanup.removed);
        attempt.cleanupFailedOutputUris.push(...cleanup.failed);
        attempt.status = "interrupted";
        attempt.completedAt = this.clock();
        attempt.errorCode = cleanup.failed.length ? "MEDIA_RECOVERY_FAILED" : "MEDIA_OPERATION_INTERRUPTED";
        attempt.technicalError = "Application process stopped before the media operation completed.";
        record.status = cleanup.failed.length ? "failed" : "interrupted";
        await this.executions.save(record);
        if (cleanup.failed.length) {
          recovered.push({ executionId: record.id, status: record.status, errorCode: "MEDIA_RECOVERY_FAILED" });
          continue;
        }
      } else {
        record.status = "interrupted";
        await this.executions.save(record);
      }
      try {
        const outcome = await this.retry(record.id);
        recovered.push({ executionId: record.id, status: outcome.record.status });
      } catch (error) {
        const latest = await this.executions.get(record.id);
        recovered.push({
          executionId: record.id,
          status: latest?.status ?? "failed",
          ...(error instanceof MediaApplicationError ? { errorCode: error.code } : {})
        });
      }
    }
    return recovered;
  }

  private async runAttempt(record: MediaExecutionRecord, signal?: AbortSignal): Promise<MediaExecutionOutcome> {
    const outputUris = operationOutputUris(record.operation);
    const current = this.history.current;
    const attempt: MediaExecutionAttempt = {
      number: record.attempts.length + 1,
      jobId: `${record.id}:${record.attempts.length + 1}`,
      status: "requested",
      requestedAt: this.clock(),
      outputUris,
      preexistingOutputUris: [],
      removedPartialOutputUris: [],
      cleanupFailedOutputUris: [],
      projectRevisionBefore: current.history.revision,
      ...(current.history.headSnapshotId ? { projectSnapshotBefore: current.history.headSnapshotId } : {})
    };
    record.attempts.push(attempt);
    record.status = "requested";
    await this.executions.save(record);
    let projectStateFinalized = false;

    try {
      prevalidateMutation(current, record, outputUris[0]);
      for (const uri of outputUris) {
        const kind = await this.artifacts.kind(uri);
        if (kind !== "missing") attempt.preexistingOutputUris.push(uri);
        if (kind === "symlink") throw new AttemptFailure("MEDIA_INVALID_REQUEST", "Output path must not be a symlink.", uri);
        if (kind === "other") throw new AttemptFailure("MEDIA_INVALID_REQUEST", "Output path must be absent or a regular file.", uri);
      }
      if (attempt.preexistingOutputUris.length) {
        throw new AttemptFailure("MEDIA_OUTPUT_EXISTS", "Output already exists.", attempt.preexistingOutputUris[0]);
      }
      if (signal?.aborted) throw abortMarker();

      const identity = await this.engine.identity();
      attempt.provenance = provenanceFrom(identity);
      attempt.status = "running";
      attempt.startedAt = this.clock();
      record.status = "running";
      await this.executions.save(record);

      const result = await this.engine.execute(record.operation, { jobId: attempt.jobId, locale: record.locale, ...(signal ? { signal } : {}) });
      await this.validateResult(record.operation, result, outputUris);
      if (result.type === "file") attempt.effectiveProfile = clone(result.effectiveProfile);
      const latest = this.history.current;
      if (record.mutation.type !== "none" && (latest.history.revision !== attempt.projectRevisionBefore || latest.history.headSnapshotId !== attempt.projectSnapshotBefore)) {
        throw new AttemptFailure("MEDIA_PROJECT_CONFLICT", "Project changed while media execution was active.");
      }

      const command = mutationCommand(record, result, attempt, this.clock);
      attempt.status = "committing";
      attempt.result = clone(result);
      record.status = "committing";
      await this.executions.save(record);
      if (command) {
        try {
          this.history.commit(command, record.actor);
        } catch (cause) {
          throw new AttemptFailure("MEDIA_PROJECT_COMMIT_FAILED", technicalMessage(cause));
        }
      }
      projectStateFinalized = true;

      const project = this.history.current;
      const entry = command ? this.history.entries.at(-1) : undefined;
      attempt.status = "succeeded";
      attempt.completedAt = this.clock();
      attempt.projectRevisionAfter = project.history.revision;
      if (project.history.headSnapshotId) attempt.projectSnapshotAfter = project.history.headSnapshotId;
      if (entry) attempt.projectJournalEntryId = entry.id;
      record.status = "succeeded";
      await this.executions.save(record);
      return { record: clone(record), project };
    } catch (cause) {
      if (projectStateFinalized) {
        throw new MediaApplicationError("MEDIA_RECOVERY_FAILED", record.locale, record.id, {}, cause);
      }
      const cancelled = isAbort(cause, signal);
      const failure = cause instanceof AttemptFailure ? cause : undefined;
      const code: MediaApplicationErrorCode = cancelled ? "MEDIA_OPERATION_CANCELLED" : failure?.code ?? "MEDIA_OPERATION_FAILED";
      const cleanup = await this.cleanup(outputUris, attempt.preexistingOutputUris);
      attempt.removedPartialOutputUris.push(...cleanup.removed);
      attempt.cleanupFailedOutputUris.push(...cleanup.failed);
      attempt.status = cancelled ? "cancelled" : "failed";
      attempt.completedAt = this.clock();
      attempt.errorCode = code;
      attempt.technicalError = technicalMessage(cause);
      record.status = attempt.status;
      await this.executions.save(record);
      throw new MediaApplicationError(
        code,
        record.locale,
        record.id,
        failure?.parameter ? { outputUri: failure.parameter } : {},
        cause
      );
    }
  }

  private async validateResult(operation: MediaOperation, result: MediaOperationResult, outputUris: readonly string[]): Promise<void> {
    if (outputUris.length === 0) {
      const valid = (operation.type === "probe" && result.type === "probe")
        || (operation.type === "detect-silence" && result.type === "detect-silence");
      if (!valid) throw new AttemptFailure("MEDIA_OPERATION_FAILED", "Media engine returned an incompatible result.");
      return;
    }
    if (result.type !== "file" || result.outputUri !== outputUris[0]) {
      throw new AttemptFailure("MEDIA_OUTPUT_MISSING", "Media engine returned no matching file result.");
    }
    if (!await this.artifacts.exists(result.outputUri)) {
      throw new AttemptFailure("MEDIA_OUTPUT_MISSING", "Media engine output is absent from the artifact store.");
    }
    validateDeliveryPostcondition(operation, result);
  }

  private async cleanup(outputUris: readonly string[], preexisting: readonly string[]): Promise<{ removed: string[]; failed: string[] }> {
    const protectedUris = new Set(preexisting);
    for (const uri of this.history.retainedMediaUris()) protectedUris.add(uri);
    const removed: string[] = [];
    const failed: string[] = [];
    for (const uri of outputUris) {
      if (protectedUris.has(uri)) continue;
      try {
        if (await this.artifacts.kind(uri) === "missing") continue;
        await this.artifacts.remove(uri);
        if (await this.artifacts.exists(uri)) failed.push(uri);
        else removed.push(uri);
      } catch {
        failed.push(uri);
      }
    }
    return { removed, failed };
  }
}

function validateMutation(operation: MediaOperation, mutation: MediaProjectMutation): void {
  if (operation.type === "render-audio-sequence") {
    if (mutation.type !== "none") throw new Error("Audio sequence PCM is a derived intermediate and must not mutate Project IR.");
    return;
  }
  const producesFile = operationOutputUris(operation).length > 0;
  if (producesFile === (mutation.type === "none")) throw new Error("File-producing media operations require a typed Project IR mutation.");
}

function prevalidateMutation(project: ProjectIR, record: MediaExecutionRecord, outputUri: string | undefined): void {
  if (record.mutation.type === "none") return;
  if (!outputUri) throw new AttemptFailure("MEDIA_INVALID_REQUEST", "Project mutation has no media output.");
  const provisional = mutationCommand(record, { type: "file", outputUri }, undefined, () => record.createdAt);
  if (!provisional) throw new AttemptFailure("MEDIA_INVALID_REQUEST", "Project mutation could not be resolved.");
  try {
    applyCommand(project, provisional, record.createdAt);
  } catch (cause) {
    throw new AttemptFailure("MEDIA_INVALID_REQUEST", technicalMessage(cause));
  }
}

function mutationCommand(
  record: MediaExecutionRecord,
  result: MediaOperationResult | { type: "file"; outputUri: string },
  attempt: MediaExecutionAttempt | undefined,
  clock: () => string
): EditCommand | undefined {
  if (record.mutation.type === "none") return undefined;
  if (result.type !== "file") throw new AttemptFailure("MEDIA_OUTPUT_MISSING", "Project mutation requires a file result.");
  if (record.mutation.type === "export.add") {
    const completedAt = clock();
    return {
      type: "export.add",
      export: {
        id: record.mutation.exportId,
        presetId: record.mutation.presetId,
        status: "completed",
        outputUri: result.outputUri,
        createdAt: record.createdAt,
        completedAt
      }
    };
  }
  const provenance = attempt?.provenance;
  return {
    type: "source.add",
    source: {
      id: record.mutation.source.id,
      kind: record.mutation.source.kind,
      uri: result.outputUri,
      displayName: record.mutation.source.displayName,
      ...("durationMs" in result && result.durationMs !== undefined ? { durationMs: result.durationMs } : {}),
      ...(record.mutation.source.checksum ? { checksum: record.mutation.source.checksum } : {}),
      extensions: {
        ...(record.mutation.source.extensions ?? {}),
        "cevra.media": {
          executionId: record.id,
          attempt: attempt?.number ?? 0,
          ...(provenance ? {
            engineId: provenance.engineId,
            engineVersion: provenance.engineVersion,
            engineApiVersion: provenance.engineApiVersion
          } : {}),
          ...(attempt?.effectiveProfile ? { effectiveProfile: attempt.effectiveProfile } : {})
        }
      }
    }
  };
}

function operationOutputUris(operation: MediaOperation): string[] {
  switch (operation.type) {
    case "probe":
    case "detect-silence":
      return [];
    case "mux-audio":
    case "concat":
    case "trim":
    case "transcode":
    case "fit":
    case "crop":
    case "speed":
    case "volume":
    case "loudness-normalize":
    case "audio-fade":
    case "extract-audio":
    case "extract-frame":
    case "overlay-media":
    case "render-audio-sequence":
      return [operation.outputUri];
  }
}

function mutationApplied(record: MediaExecutionRecord, project: ProjectIR): boolean {
  const result = record.attempts.at(-1)?.result;
  const mutation = record.mutation;
  if (!result) return false;
  if (mutation.type === "none") return true;
  if (result.type !== "file") return false;
  if (mutation.type === "export.add") {
    return project.exports.some((item) => item.id === mutation.exportId && item.outputUri === result.outputUri && item.status === "completed");
  }
  return project.sources.some((source) => {
    const media = source.extensions?.["cevra.media"];
    return source.id === mutation.source.id
      && source.uri === result.outputUri
      && typeof media === "object"
      && media !== null
      && !Array.isArray(media)
      && (media as Record<string, unknown>).executionId === record.id;
  });
}

function committedEntry(record: MediaExecutionRecord, entries: ProjectHistory["entries"]): ProjectHistory["entries"][number] | undefined {
  return [...entries].reverse().find((entry) => {
    if (record.mutation.type === "none") return false;
    if (record.mutation.type === "export.add") {
      return entry.command.type === "export.add" && entry.command.export.id === record.mutation.exportId;
    }
    return entry.command.type === "source.add" && entry.command.source.id === record.mutation.source.id;
  });
}

function abortMarker(): Error {
  const error = new Error("Media operation aborted.");
  error.name = "AbortError";
  return error;
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof Error && error.name === "AbortError");
}

function technicalMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validateDeliveryPostcondition(operation: MediaOperation, result: Extract<MediaOperationResult, { type: "file" }>): void {
  if (!result.probe.hasVideo && !result.probe.hasAudio) throw new AttemptFailure("MEDIA_OUTPUT_MISSING", "Output contains no audio or video stream.");
  if (operation.type === "extract-frame") {
    if (!result.probe.hasVideo || result.probe.videoCodec?.toLowerCase() !== "png" || result.probe.hasAudio) {
      throw new AttemptFailure("MEDIA_OPERATION_FAILED", "Extracted frame does not satisfy the PNG output contract.");
    }
    return;
  }
  if (operation.type === "render-audio-sequence") {
    const expectedChannels = operation.outputChannelLayout === "mono" ? 1 : 2;
    const expectedSamples = operation.outputDurationMs * (AUDIO_SEQUENCE_SAMPLE_RATE / 1000);
    const expectedDataBytes = expectedSamples * expectedChannels * 4;
    if (result.probe.hasVideo || !result.probe.hasAudio
      || result.probe.audioCodec !== AUDIO_SEQUENCE_SAMPLE_FORMAT
      || result.probe.sampleRate !== AUDIO_SEQUENCE_SAMPLE_RATE
      || result.probe.channels !== expectedChannels
      || result.durationMs !== operation.outputDurationMs
      || result.effectiveProfile.container !== "wav"
      || result.effectiveProfile.audioCodec !== "pcm"
      || result.effectiveProfile.audioEncoder !== AUDIO_SEQUENCE_SAMPLE_FORMAT
      || result.audioSequence?.outputSampleCount !== expectedSamples
      || result.audioSequence.estimatedDataBytes !== expectedDataBytes
      || result.audioSequence.distinctSourceCount !== operation.sources.length
      || result.audioSequence.itemCount !== operation.items.length
      || result.audioSequence.maximumSimultaneousItemCount !== maximumSimultaneousAudioItems(operation)
      || result.audioSequence.channelLayout !== operation.outputChannelLayout) {
      throw new AttemptFailure("MEDIA_OPERATION_FAILED", "Audio sequence output does not satisfy its float32/48 kHz/timing contract.");
    }
    return;
  }
  const delivery = resolvedDelivery(operation);
  if (!delivery) return;
  const actualVideo = normalizeVideoCodec(result.probe.videoCodec);
  const actualAudio = normalizeAudioCodec(result.probe.audioCodec);
  if (delivery.audioOnly && result.probe.hasVideo) throw new AttemptFailure("MEDIA_OPERATION_FAILED", "Audio-only output contains a video stream.");
  if (!delivery.audioOnly && !result.probe.hasVideo) throw new AttemptFailure("MEDIA_OPERATION_FAILED", "Output is missing its required video stream.");
  if (delivery.audioOnly && !result.probe.hasAudio) throw new AttemptFailure("MEDIA_OPERATION_FAILED", "Audio-only output is missing its audio stream.");
  if (delivery.videoCodec && delivery.videoCodec !== "copy" && actualVideo !== delivery.videoCodec) throw new AttemptFailure("MEDIA_OPERATION_FAILED", "Output video codec does not match resolved delivery.");
  if (result.probe.hasAudio && delivery.audioCodec !== "copy" && actualAudio !== delivery.audioCodec) throw new AttemptFailure("MEDIA_OPERATION_FAILED", "Output audio codec does not match resolved delivery.");
  if (result.effectiveProfile.container !== delivery.container || result.effectiveProfile.videoCodec !== actualVideo || result.effectiveProfile.audioCodec !== actualAudio) {
    throw new AttemptFailure("MEDIA_OPERATION_FAILED", "Effective encoder profile does not match verified output streams.");
  }
}

function maximumSimultaneousAudioItems(operation: Extract<MediaOperation, { type: "render-audio-sequence" }>): number {
  const events = operation.items.flatMap((item) => {
    const duration = item.sourceEndMs - item.sourceStartMs;
    return [{ at: item.timelineStartMs, delta: 1 }, { at: item.timelineStartMs + duration, delta: -1 }];
  }).sort((left, right) => left.at - right.at || left.delta - right.delta);
  let active = 0;
  let maximum = 0;
  for (const event of events) {
    active += event.delta;
    maximum = Math.max(maximum, active);
  }
  return maximum;
}

function resolvedDelivery(operation: MediaOperation) {
  switch (operation.type) {
    case "probe": case "detect-silence": case "extract-frame": case "render-audio-sequence": return undefined;
    case "transcode": return resolveTranscodeDelivery({ outputUri: operation.outputUri, ...(operation.container ? { container: operation.container } : {}), ...(operation.videoCodec ? { videoCodec: operation.videoCodec } : {}), ...(operation.audioCodec ? { audioCodec: operation.audioCodec } : {}), transformsVideo: operation.width !== undefined || operation.height !== undefined || operation.fps !== undefined });
    case "extract-audio": return resolveAudioDelivery(operation.outputUri, operation.audioCodec);
    case "volume": case "loudness-normalize": case "audio-fade": return resolveAudioMutationDelivery(operation.outputUri);
    case "mux-audio": { const container = resolveMediaContainer(operation.outputUri); const rule = MEDIA_DELIVERY_MATRIX[container]; return { container, audioOnly: false, videoCodec: "copy" as const, audioCodec: rule.defaultAudioCodec }; }
    default: return resolveStandardAvDelivery(operation.outputUri, operation.type === "trim" || operation.type === "concat");
  }
}

function defaultId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `media_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
