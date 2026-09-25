import {
  MAX_AUDIO_SEQUENCE_GAIN_DB,
  MIN_AUDIO_SEQUENCE_GAIN_DB,
  validateMediaOperation,
  type AudioSequenceChannelLayout,
  type RenderAudioSequenceOperationV1
} from "@cevra/contracts";
import type { JournalActor, ProjectHistory, ProjectIR, TimelineClip } from "@cevra/project-ir";
import { MediaApplicationError } from "./errors.js";
import {
  MediaExecutionPreCommitError,
  mediaExecutionMutationApplied,
  type MediaApplicationService
} from "./media-service.js";
import {
  InMemoryMediaExecutionRepository,
  MediaExecutionAlreadyExistsError,
  type MediaExecutionIntentRepository
} from "./repository.js";
import {
  SourceTechnicalDescriptorResolver,
  createSourceContentVerificationMemo,
  type SourceContentVerificationMemo
} from "./source-technical-descriptor.js";
import type {
  MediaExecutionIntentV1,
  MediaExecutionOutcome,
  MediaExecutionRecord,
  MediaProjectBinding,
  MediaRecoveryResult
} from "./types.js";

export const RESOLVED_AUDIO_PLAN_VERSION = 1 as const;
export const FINAL_MUX_DURATION_TOLERANCE_MS = 23 as const;

export type AudioNormalizationDecision =
  | { type: "none" }
  | { type: "target-lufs"; targetLufs: number };

export type ResolvedAudioPlanErrorCode =
  | "AUDIO_PLAN_INVALID_REQUEST"
  | "AUDIO_PLAN_PROJECT_CONFLICT"
  | "AUDIO_PLAN_NO_RENDERABLE_AUDIO"
  | "AUDIO_PLAN_UNSUPPORTED_TIMING"
  | "AUDIO_PLAN_UNSUPPORTED_SOURCE"
  | "AUDIO_PLAN_DUCKING_UNSUPPORTED"
  | "AUDIO_PLAN_SOURCE_OFFLINE"
  | "AUDIO_PLAN_SOURCE_CONTENT_CHANGED"
  | "AUDIO_PLAN_SOURCE_VERIFICATION_UNAVAILABLE"
  | "AUDIO_PLAN_GAIN_UNSUPPORTED"
  | "AUDIO_PLAN_NORMALIZATION_UNSUPPORTED"
  | "AUDIO_PLAN_VISUAL_BINDING_INVALID";

export class ResolvedAudioPlanError extends Error {
  constructor(readonly code: ResolvedAudioPlanErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = "ResolvedAudioPlanError";
  }
}

export interface CompileResolvedAudioPlanRequest {
  id: string;
  audioOutputUri: string;
  outputChannelLayout: AudioSequenceChannelLayout;
  normalization: AudioNormalizationDecision;
  projectJournalEntryCount: number;
}

export interface ResolvedAudioSourceBinding {
  sourceId: string;
  uri: string;
  checksum?: string;
}

export interface ResolvedAudioPlanV1 {
  version: typeof RESOLVED_AUDIO_PLAN_VERSION;
  id: string;
  projectBinding: MediaProjectBinding;
  normalization: { type: "none" };
  outputDurationMs: number;
  outputChannelLayout: AudioSequenceChannelLayout;
  sourceBindings: ResolvedAudioSourceBinding[];
  audioClipIds: string[];
  operation: RenderAudioSequenceOperationV1;
}

export interface ResolvedVisualReferenceV1 {
  version: 1;
  uri: string;
  projectBinding: MediaProjectBinding;
  durationMs: number;
  producerExecutionId: string;
}

export interface ExecuteResolvedAudioPlanRequest {
  id: string;
  plan: ResolvedAudioPlanV1;
  visual: ResolvedVisualReferenceV1;
  outputUri: string;
  exportId: string;
  presetId: string;
  locale?: "pt-BR" | "en-US";
  actor?: JournalActor;
}

export interface ExecuteResolvedAudioPlanOutcome {
  plan: ResolvedAudioPlanV1;
  audioExecution: MediaExecutionOutcome["record"];
  muxExecution: MediaExecutionOutcome["record"];
  project: ProjectIR;
  audioCleanup: { removed: string[]; failed: string[] };
}

export interface ResolvedAudioPlanApplicationServiceOptions {
  history: ProjectHistory;
  media: Pick<MediaApplicationService, "execute" | "cleanupOwnedOutputs" | "getExecutionRecord" | "assertOwnedOutputPublication">;
  intents?: MediaExecutionIntentRepository;
  sourceVerifier?: SourceTechnicalDescriptorResolver;
  clock?: () => string;
  idGenerator?: () => string;
}

export class ResolvedAudioPlanApplicationService {
  private readonly history: ProjectHistory;
  private readonly media: Pick<MediaApplicationService, "execute" | "cleanupOwnedOutputs" | "getExecutionRecord" | "assertOwnedOutputPublication">;
  private readonly idGenerator: () => string;
  private readonly intents: MediaExecutionIntentRepository;
  private readonly clock: () => string;
  private readonly sourceVerifier: SourceTechnicalDescriptorResolver | undefined;

  constructor(options: ResolvedAudioPlanApplicationServiceOptions) {
    this.history = options.history;
    this.media = options.media;
    this.idGenerator = options.idGenerator ?? defaultId;
    this.intents = options.intents ?? new InMemoryMediaExecutionRepository();
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.sourceVerifier = options.sourceVerifier;
  }

  compile(request: Omit<CompileResolvedAudioPlanRequest, "id" | "projectJournalEntryCount"> & { id?: string }): ResolvedAudioPlanV1 {
    return compileResolvedAudioPlan(this.history.current, {
      ...request,
      id: request.id ?? this.idGenerator(),
      projectJournalEntryCount: this.history.entries.length
    });
  }

  async execute(request: ExecuteResolvedAudioPlanRequest, signal?: AbortSignal): Promise<ExecuteResolvedAudioPlanOutcome> {
    const defaultLocale = this.history.current.project.defaultLocale;
    let stableRequest: ExecuteResolvedAudioPlanRequest | undefined;
    let plan: ResolvedAudioPlanV1;
    try {
      stableRequest = clone(request);
      validateExecutionRequest(stableRequest);
      plan = validatePlanAgainstProject(this.history, stableRequest.plan);
      validateVisualReference(stableRequest.visual, plan);
      validateMediaOperation({
        type: "mux-audio",
        videoUri: stableRequest.visual.uri,
        audioUri: plan.operation.outputUri,
        outputUri: stableRequest.outputUri,
        replaceExisting: true,
        durationValidation: durationValidation(plan)
      });
      if (new Set([stableRequest.visual.uri, plan.operation.outputUri, stableRequest.outputUri]).size !== 3) {
        throw new ResolvedAudioPlanError("AUDIO_PLAN_INVALID_REQUEST", "Visual, PCM and final output paths must be distinct.");
      }
    } catch (cause) {
      const locale = stableRequest?.locale === "en-US" ? "en-US" : defaultLocale;
      throw mapApplicationError(cause, locale, typeof stableRequest?.id === "string" ? stableRequest.id : "invalid-audio-plan-execution");
    }

    const locale = stableRequest.locale ?? defaultLocale;

    const audioExecutionId = `${stableRequest.id}:audio`;
    const muxExecutionId = `${stableRequest.id}:mux`;
    const now = this.clock();
    const intent: MediaExecutionIntentV1 = {
      version: 1,
      id: stableRequest.id,
      kind: "resolved-audio-plan",
      projectId: plan.projectBinding.projectId,
      projectBinding: clone(plan.projectBinding),
      status: "requested",
      childExecutionIds: { audio: audioExecutionId, mux: muxExecutionId },
      exportIntent: {
        exportId: stableRequest.exportId,
        presetId: stableRequest.presetId,
        expectedOutputUri: stableRequest.outputUri
      },
      createdAt: now,
      updatedAt: now
    };
    try {
      await this.intents.createIntent(intent);
    } catch (cause) {
      if (cause instanceof MediaExecutionAlreadyExistsError) {
        throw new MediaApplicationError("MEDIA_INVALID_REQUEST", locale, stableRequest.id, {}, cause);
      }
      throw cause;
    }
    let audioOutcome: MediaExecutionOutcome | undefined;
    const sourceMemo = createSourceContentVerificationMemo();
    try {
      await this.transitionIntent(intent, "audio-running");
      await this.verifyPlanSources(plan, sourceMemo, signal);
      audioOutcome = await this.media.execute({
        id: audioExecutionId,
        locale,
        operation: plan.operation,
        mutation: { type: "none" },
        projectBinding: plan.projectBinding,
        actor: stableRequest.actor ?? { type: "user" }
      }, signal);
      await this.revalidatePlanSources(sourceMemo, signal);
      await this.transitionIntent(intent, "audio-succeeded");
      assertCurrentBinding(this.history, plan.projectBinding);
      const muxDurationValidation = durationValidation(plan, audioOutcome.record);

      await this.transitionIntent(intent, "mux-running");
      const muxOutcome = await this.media.execute({
        id: muxExecutionId,
        locale,
        operation: {
          type: "mux-audio",
          videoUri: stableRequest.visual.uri,
          audioUri: plan.operation.outputUri,
          outputUri: stableRequest.outputUri,
          replaceExisting: true,
          durationValidation: muxDurationValidation
        },
        mutation: { type: "export.add", exportId: stableRequest.exportId, presetId: stableRequest.presetId },
        projectBinding: plan.projectBinding,
        expectedOutput: {
          durationMs: plan.outputDurationMs,
          durationToleranceMs: FINAL_MUX_DURATION_TOLERANCE_MS
        },
        actor: stableRequest.actor ?? { type: "user" }
      }, signal, {
        beforeEngine: {
          verify: async () => this.media.assertOwnedOutputPublication(audioExecutionId, plan.operation.outputUri)
        },
        beforeCommit: {
          verify: async (guardSignal) => {
            await this.media.assertOwnedOutputPublication(audioExecutionId, plan.operation.outputUri);
            await this.preCommitSourceGuard(sourceMemo, guardSignal);
          }
        }
      });

      await this.transitionIntent(intent, "application-committed");

      const audioCleanup = await this.media.cleanupOwnedOutputs(audioExecutionId);
      return {
        plan: clone(plan),
        audioExecution: clone(audioOutcome.record),
        muxExecution: clone(muxOutcome.record),
        project: clone(muxOutcome.project),
        audioCleanup
      };
    } catch (cause) {
      if (audioOutcome) {
        const cleanup = await this.media.cleanupOwnedOutputs(audioExecutionId);
        if (cleanup.failed.length) {
          throw new MediaApplicationError("MEDIA_RECOVERY_FAILED", locale, stableRequest.id, {}, { operation: cause, cleanup });
        }
      }
      await this.transitionIntent(intent, "interrupted", true);
      throw mapApplicationError(cause, locale, stableRequest.id);
    }
  }

  private async verifyPlanSources(
    plan: ResolvedAudioPlanV1,
    memo: SourceContentVerificationMemo,
    signal?: AbortSignal
  ): Promise<void> {
    const sourceById = new Map(this.history.current.sources.map((source) => [source.id, source]));
    for (const binding of plan.sourceBindings) {
      const source = sourceById.get(binding.sourceId);
      if (!source?.technicalDescriptor) continue;
      if (!this.sourceVerifier) {
        throw new ResolvedAudioPlanError("AUDIO_PLAN_SOURCE_VERIFICATION_UNAVAILABLE", "Source content verification is unavailable for descriptor-bearing media.");
      }
      const resolution = await this.sourceVerifier.verify(source, memo, signal);
      if (resolution.status !== "verified") throw sourceResolutionError(resolution.status);
    }
  }

  private async revalidatePlanSources(memo: SourceContentVerificationMemo, signal?: AbortSignal): Promise<void> {
    if (memo.entries.size === 0) return;
    if (!this.sourceVerifier) {
      throw new ResolvedAudioPlanError("AUDIO_PLAN_SOURCE_VERIFICATION_UNAVAILABLE", "Source content verification became unavailable.");
    }
    const status = await this.sourceVerifier.revalidate(memo, signal);
    if (status !== "verified") throw sourceResolutionError(status);
  }

  private async preCommitSourceGuard(memo: SourceContentVerificationMemo, signal?: AbortSignal): Promise<void> {
    if (memo.entries.size === 0) return;
    if (!this.sourceVerifier) throw new MediaExecutionPreCommitError("SOURCE_VERIFICATION_UNAVAILABLE");
    const status = await this.sourceVerifier.revalidate(memo, signal);
    if (status === "verified") return;
    if (status === "offline") throw new MediaExecutionPreCommitError("SOURCE_OFFLINE");
    if (status === "content-changed") throw new MediaExecutionPreCommitError("SOURCE_CONTENT_CHANGED");
    throw new MediaExecutionPreCommitError("SOURCE_VERIFICATION_UNAVAILABLE");
  }

  async markCheckpointSucceeded(intentId: string): Promise<void> {
    const intent = await this.intents.getIntent(intentId);
    if (!intent || intent.projectId !== this.history.current.project.id || intent.status !== "application-committed") {
      throw new Error("Resolved audio intent is not awaiting a durable checkpoint.");
    }
    if (!canonicalExportMatches(this.history.current, intent)) {
      throw new Error("Resolved audio export is not present in canonical ProjectHistory.");
    }
    await this.transitionIntent(intent, "durable-succeeded");
  }

  async reconcilePendingWithoutReplay(): Promise<MediaRecoveryResult[]> {
    const statuses = ["requested", "audio-running", "audio-succeeded", "mux-running", "application-committed"] as const;
    const pending = await this.intents.listIntentsByStatus(this.history.current.project.id, statuses);
    const results: MediaRecoveryResult[] = [];
    for (const intent of pending) {
      if (await this.canonicalMuxChildApplied(intent)) {
        const audioCleanup = await this.cleanupChild(intent.childExecutionIds.audio);
        intent.cleanupUncertainUris = audioCleanup.cleanup.failed;
        intent.reconciledAt = this.clock();
        await this.transitionIntent(intent, audioCleanup.recoveryFailed ? "recovery-incomplete" : "durable-succeeded");
        results.push({
          executionId: intent.id,
          status: audioCleanup.recoveryFailed ? "failed" : "succeeded",
          ...(audioCleanup.recoveryFailed ? { errorCode: "MEDIA_RECOVERY_FAILED" as const } : {})
        });
        continue;
      }
      const failed = new Set<string>();
      let recoveryFailed = false;
      for (const executionId of [intent.childExecutionIds.audio, intent.childExecutionIds.mux]) {
        const childCleanup = await this.cleanupChild(executionId);
        for (const uri of childCleanup.cleanup.failed) failed.add(uri);
        recoveryFailed ||= childCleanup.recoveryFailed;
      }
      intent.reconciledAt = this.clock();
      intent.cleanupUncertainUris = [...failed];
      const incomplete = failed.size > 0 || recoveryFailed;
      await this.transitionIntent(intent, incomplete ? "recovery-incomplete" : "interrupted");
      results.push({
        executionId: intent.id,
        status: incomplete ? "failed" : "interrupted",
        errorCode: incomplete ? "MEDIA_RECOVERY_FAILED" : "MEDIA_OPERATION_INTERRUPTED"
      });
    }
    return results;
  }

  private async cleanupChild(executionId: string): Promise<{
    cleanup: { removed: string[]; failed: string[] };
    recoveryFailed: boolean;
  }> {
    try {
      return { cleanup: await this.media.cleanupOwnedOutputs(executionId), recoveryFailed: false };
    } catch (cause) {
      if (cause instanceof MediaApplicationError && cause.code === "MEDIA_OPERATION_NOT_FOUND") {
        return { cleanup: { removed: [], failed: [] }, recoveryFailed: false };
      }
      return { cleanup: { removed: [], failed: [] }, recoveryFailed: true };
    }
  }

  private async canonicalMuxChildApplied(intent: MediaExecutionIntentV1): Promise<boolean> {
    if (!canonicalExportMatches(this.history.current, intent)) return false;
    const mux = await this.media.getExecutionRecord(intent.childExecutionIds.mux);
    if (!mux || mux.projectId !== intent.projectId || !["committing", "succeeded"].includes(mux.status)
      || mux.operation.type !== "mux-audio"
      || mux.operation.outputUri !== intent.exportIntent.expectedOutputUri
      || mux.mutation.type !== "export.add"
      || mux.mutation.exportId !== intent.exportIntent.exportId
      || mux.mutation.presetId !== intent.exportIntent.presetId) {
      return false;
    }
    return mediaExecutionMutationApplied(mux, this.history.current);
  }

  private async transitionIntent(
    intent: MediaExecutionIntentV1,
    status: MediaExecutionIntentV1["status"],
    bestEffort = false
  ): Promise<void> {
    intent.status = status;
    intent.updatedAt = this.clock();
    try {
      await this.intents.saveIntent(intent);
    } catch (cause) {
      if (!bestEffort) throw cause;
    }
  }
}

function canonicalExportMatches(project: ProjectIR, intent: MediaExecutionIntentV1): boolean {
  return project.exports.some((item) => item.id === intent.exportIntent.exportId
    && item.presetId === intent.exportIntent.presetId
    && item.outputUri === intent.exportIntent.expectedOutputUri
    && item.status === "completed");
}

function sourceResolutionError(status: string): ResolvedAudioPlanError {
  if (status === "offline") {
    return new ResolvedAudioPlanError("AUDIO_PLAN_SOURCE_OFFLINE", "A source file is offline during verified audio execution.");
  }
  if (status === "content-changed") {
    return new ResolvedAudioPlanError("AUDIO_PLAN_SOURCE_CONTENT_CHANGED", "A source file changed during verified audio execution.");
  }
  return new ResolvedAudioPlanError(
    "AUDIO_PLAN_SOURCE_VERIFICATION_UNAVAILABLE",
    "The current source content cannot be verified with the adopted method."
  );
}

export function compileResolvedAudioPlan(project: ProjectIR, request: CompileResolvedAudioPlanRequest): ResolvedAudioPlanV1 {
  validateCompileRequest(request);
  const snapshotId = project.history.headSnapshotId;
  if (!snapshotId) throw new ResolvedAudioPlanError("AUDIO_PLAN_PROJECT_CONFLICT", "Project has no authoritative history snapshot.");
  if (request.normalization.type !== "none" || project.audio.normalizeTargetLufs !== undefined) {
    throw new ResolvedAudioPlanError(
      "AUDIO_PLAN_NORMALIZATION_UNSUPPORTED",
      "Explicit loudness normalization is not available in this slice and cannot be ignored."
    );
  }
  if (project.audio.musicDuckDb !== undefined) {
    throw new ResolvedAudioPlanError(
      "AUDIO_PLAN_DUCKING_UNSUPPORTED",
      "Canonical music ducking requires an explicit approved audio-plan capability and cannot be ignored."
    );
  }
  if (!Number.isSafeInteger(project.timeline.durationMs) || project.timeline.durationMs <= 0) {
    throw new ResolvedAudioPlanError("AUDIO_PLAN_NO_RENDERABLE_AUDIO", "Project timeline has no positive output duration.");
  }

  const tracks = new Map(project.timeline.tracks.map((track, index) => [track.id, { track, index }]));
  const sources = new Map(project.sources.map((source) => [source.id, source]));
  const candidates: Array<{ clip: TimelineClip; trackIndex: number; clipIndex: number }> = [];
  for (const [clipIndex, clip] of project.timeline.clips.entries()) {
    const trackRecord = tracks.get(clip.trackId);
    if (!trackRecord || trackRecord.track.kind !== "audio" || trackRecord.track.muted || clip.volume === 0) continue;
    candidates.push({ clip, trackIndex: trackRecord.index, clipIndex });
  }
  if (candidates.length === 0) {
    throw new ResolvedAudioPlanError(
      "AUDIO_PLAN_NO_RENDERABLE_AUDIO",
      "No unmuted non-zero clips exist on canonical audio tracks; video-track audio is not inferred implicitly."
    );
  }

  candidates.sort((left, right) => left.clip.timelineStartMs - right.clip.timelineStartMs
    || left.trackIndex - right.trackIndex
    || left.clipIndex - right.clipIndex
    || left.clip.id.localeCompare(right.clip.id));

  const sourceBindings = new Map<string, ResolvedAudioSourceBinding>();
  const items: RenderAudioSequenceOperationV1["items"] = [];
  for (const { clip } of candidates) {
    const source = sources.get(clip.sourceId);
    if (!source || (source.kind !== "audio" && source.kind !== "video")) {
      throw new ResolvedAudioPlanError("AUDIO_PLAN_UNSUPPORTED_SOURCE", `Audio clip ${clip.id} does not reference an eligible audio/video source.`);
    }
    if (clip.speed !== 1) {
      throw new ResolvedAudioPlanError("AUDIO_PLAN_UNSUPPORTED_TIMING", `Audio clip ${clip.id} uses unsupported speed ${clip.speed}.`);
    }
    const timelineDuration = clip.timelineEndMs - clip.timelineStartMs;
    const sourceDuration = clip.sourceEndMs - clip.sourceStartMs;
    if (!Number.isSafeInteger(timelineDuration) || timelineDuration <= 0 || timelineDuration !== sourceDuration) {
      throw new ResolvedAudioPlanError("AUDIO_PLAN_UNSUPPORTED_TIMING", `Audio clip ${clip.id} has inconsistent source and timeline ranges.`);
    }
    if (clip.timelineEndMs > project.timeline.durationMs || (source.durationMs !== undefined && clip.sourceEndMs > source.durationMs)) {
      throw new ResolvedAudioPlanError("AUDIO_PLAN_UNSUPPORTED_TIMING", `Audio clip ${clip.id} exceeds canonical timeline/source duration.`);
    }
    const gainDb = 20 * Math.log10(clip.volume) + project.audio.masterGainDb;
    if (!Number.isFinite(gainDb) || gainDb < MIN_AUDIO_SEQUENCE_GAIN_DB || gainDb > MAX_AUDIO_SEQUENCE_GAIN_DB) {
      throw new ResolvedAudioPlanError(
        "AUDIO_PLAN_GAIN_UNSUPPORTED",
        `Audio clip ${clip.id} plus master gain is outside the existing audio-sequence bounds.`
      );
    }
    if (!sourceBindings.has(source.id)) {
      sourceBindings.set(source.id, {
        sourceId: source.id,
        uri: source.uri,
        ...(source.checksum ? { checksum: source.checksum } : {})
      });
    }
    items.push({
      sourceId: source.id,
      sourceStartMs: clip.sourceStartMs,
      sourceEndMs: clip.sourceEndMs,
      timelineStartMs: clip.timelineStartMs,
      ...(Math.abs(gainDb) > 1e-12 ? { gainDb } : {})
    });
  }

  const bindings = [...sourceBindings.values()];
  const operation = validateMediaOperation({
    type: "render-audio-sequence",
    version: 1,
    sources: bindings.map((source) => ({ id: source.sourceId, uri: source.uri })),
    items,
    outputUri: request.audioOutputUri,
    outputDurationMs: project.timeline.durationMs,
    outputChannelLayout: request.outputChannelLayout
  });
  if (operation.type !== "render-audio-sequence") throw new Error("Resolved operation type changed unexpectedly.");

  return clone({
    version: RESOLVED_AUDIO_PLAN_VERSION,
    id: request.id,
    projectBinding: {
      projectId: project.project.id,
      projectRevision: project.history.revision,
      projectSnapshotId: snapshotId,
      projectJournalEntryCount: request.projectJournalEntryCount
    },
    normalization: { type: "none" },
    outputDurationMs: project.timeline.durationMs,
    outputChannelLayout: request.outputChannelLayout,
    sourceBindings: bindings,
    audioClipIds: candidates.map(({ clip }) => clip.id),
    operation
  });
}

function validateCompileRequest(request: CompileResolvedAudioPlanRequest): void {
  rejectUnexpectedKeys(request, ["id", "audioOutputUri", "outputChannelLayout", "normalization", "projectJournalEntryCount"], "resolved audio compile request");
  validateNormalization(request.normalization);
  if (!isRecord(request) || typeof request.id !== "string" || request.id.trim().length === 0
    || typeof request.audioOutputUri !== "string"
    || (request.outputChannelLayout !== "mono" && request.outputChannelLayout !== "stereo")
    || !Number.isSafeInteger(request.projectJournalEntryCount) || request.projectJournalEntryCount < 0) {
    throw new ResolvedAudioPlanError("AUDIO_PLAN_INVALID_REQUEST", "Resolved audio plan request is invalid.");
  }
  if (request.normalization.type === "target-lufs" && !Number.isFinite(request.normalization.targetLufs)) {
    throw new ResolvedAudioPlanError("AUDIO_PLAN_INVALID_REQUEST", "Normalization target must be finite.");
  }
}

function validateExecutionRequest(request: ExecuteResolvedAudioPlanRequest): void {
  rejectUnexpectedKeys(request, ["id", "plan", "visual", "outputUri", "exportId", "presetId", "locale", "actor"], "resolved audio execution request");
  if (!isRecord(request) || typeof request.id !== "string" || request.id.trim().length === 0
    || typeof request.outputUri !== "string" || typeof request.exportId !== "string" || !request.exportId.trim()
    || typeof request.presetId !== "string" || !request.presetId.trim()
    || (request.locale !== undefined && request.locale !== "pt-BR" && request.locale !== "en-US")) {
    throw new ResolvedAudioPlanError("AUDIO_PLAN_INVALID_REQUEST", "Resolved audio execution request is invalid.");
  }
  validateJournalActor(request.actor ?? { type: "user" });
}

function validatePlanAgainstProject(history: ProjectHistory, plan: ResolvedAudioPlanV1): ResolvedAudioPlanV1 {
  const project = history.current;
  validatePlanSchema(plan);
  if (!isRecord(plan) || plan.version !== RESOLVED_AUDIO_PLAN_VERSION || typeof plan.id !== "string"
    || !isRecord(plan.operation) || plan.operation.type !== "render-audio-sequence"
    || !isRecord(plan.normalization) || plan.normalization.type !== "none") {
    throw new ResolvedAudioPlanError("AUDIO_PLAN_INVALID_REQUEST", "Resolved audio plan is malformed.");
  }
  assertCurrentBinding(history, plan.projectBinding);
  const expected = compileResolvedAudioPlan(project, {
    id: plan.id,
    audioOutputUri: plan.operation.outputUri,
    outputChannelLayout: plan.outputChannelLayout,
    normalization: plan.normalization,
    projectJournalEntryCount: history.entries.length
  });
  if (!structurallyEqual(expected, plan)) {
    throw new ResolvedAudioPlanError("AUDIO_PLAN_INVALID_REQUEST", "Resolved audio plan no longer matches its canonical project state.");
  }
  return clone(expected);
}

function validateVisualReference(visual: ResolvedVisualReferenceV1, plan: ResolvedAudioPlanV1): void {
  rejectUnexpectedKeys(visual, ["version", "uri", "projectBinding", "durationMs", "producerExecutionId"], "resolved visual reference");
  validateProjectBindingSchema(visual.projectBinding);
  if (!isRecord(visual) || visual.version !== 1 || typeof visual.uri !== "string"
    || typeof visual.producerExecutionId !== "string" || !visual.producerExecutionId.trim()
    || !Number.isSafeInteger(visual.durationMs) || visual.durationMs !== plan.outputDurationMs
    || !sameBinding(visual.projectBinding, plan.projectBinding)) {
    throw new ResolvedAudioPlanError(
      "AUDIO_PLAN_VISUAL_BINDING_INVALID",
      "Caller-provided visual result is not bound to the same project snapshot and duration as the audio plan."
    );
  }
}

function durationValidation(plan: ResolvedAudioPlanV1, audioExecution?: MediaExecutionRecord) {
  let audioDurationMs = plan.outputDurationMs;
  if (audioExecution) {
    const result = audioExecution.attempts.at(-1)?.result;
    const evidence = result?.type === "file" ? result.audioSequence : undefined;
    if (!evidence || evidence.sampleRate <= 0
      || !Number.isSafeInteger(evidence.outputSampleCount)
      || evidence.outputSampleCount * 1000 % evidence.sampleRate !== 0) {
      throw new ResolvedAudioPlanError(
        "AUDIO_PLAN_INVALID_REQUEST",
        "Audio Sequence did not return exact measured sample-count duration evidence."
      );
    }
    audioDurationMs = evidence.outputSampleCount * 1000 / evidence.sampleRate;
    if (audioDurationMs !== plan.outputDurationMs) {
      throw new ResolvedAudioPlanError(
        "AUDIO_PLAN_INVALID_REQUEST",
        "Audio Sequence measured sample-count duration does not match the resolved project duration."
      );
    }
  }
  return {
    version: 1 as const,
    videoDurationMs: plan.outputDurationMs,
    audioDurationMs,
    inputToleranceMs: 1,
    outputAudioToleranceMs: FINAL_MUX_DURATION_TOLERANCE_MS
  };
}

function assertCurrentBinding(history: ProjectHistory, binding: MediaProjectBinding): void {
  const project = history.current;
  if (!sameBinding(binding, {
    projectId: project.project.id,
    projectRevision: project.history.revision,
    projectSnapshotId: project.history.headSnapshotId ?? "",
    projectJournalEntryCount: history.entries.length
  })) {
    throw new ResolvedAudioPlanError("AUDIO_PLAN_PROJECT_CONFLICT", "Resolved audio plan is stale for the current project snapshot.");
  }
}

function sameBinding(left: unknown, right: MediaProjectBinding): boolean {
  return isRecord(left)
    && left.projectId === right.projectId
    && left.projectRevision === right.projectRevision
    && left.projectSnapshotId === right.projectSnapshotId
    && left.projectJournalEntryCount === right.projectJournalEntryCount;
}

function validatePlanSchema(plan: ResolvedAudioPlanV1): void {
  rejectUnexpectedKeys(plan, ["version", "id", "projectBinding", "normalization", "outputDurationMs", "outputChannelLayout", "sourceBindings", "audioClipIds", "operation"], "resolved audio plan");
  validateProjectBindingSchema(plan.projectBinding);
  validateNormalization(plan.normalization);
  if (!Array.isArray(plan.sourceBindings) || plan.sourceBindings.length === 0) {
    throw new ResolvedAudioPlanError("AUDIO_PLAN_INVALID_REQUEST", "Resolved audio source bindings are invalid.");
  }
  for (const source of plan.sourceBindings) {
    rejectUnexpectedKeys(source, ["sourceId", "uri", "checksum"], "resolved audio source binding");
    if (!isRecord(source) || typeof source.sourceId !== "string" || !source.sourceId.trim()
      || typeof source.uri !== "string" || !source.uri
      || (source.checksum !== undefined && typeof source.checksum !== "string")) {
      throw new ResolvedAudioPlanError("AUDIO_PLAN_INVALID_REQUEST", "Resolved audio source binding is invalid.");
    }
  }
  if (!Array.isArray(plan.audioClipIds) || plan.audioClipIds.length === 0
    || plan.audioClipIds.some((id) => typeof id !== "string" || !id.trim())
    || !Number.isSafeInteger(plan.outputDurationMs) || plan.outputDurationMs <= 0
    || (plan.outputChannelLayout !== "mono" && plan.outputChannelLayout !== "stereo")) {
    throw new ResolvedAudioPlanError("AUDIO_PLAN_INVALID_REQUEST", "Resolved audio plan fields are invalid.");
  }
  try {
    validateMediaOperation(plan.operation);
  } catch (cause) {
    throw new ResolvedAudioPlanError("AUDIO_PLAN_INVALID_REQUEST", "Resolved audio operation is invalid.", cause);
  }
}

function validateProjectBindingSchema(binding: MediaProjectBinding): void {
  rejectUnexpectedKeys(binding, ["projectId", "projectRevision", "projectSnapshotId", "projectJournalEntryCount"], "project binding");
  if (!isRecord(binding) || typeof binding.projectId !== "string" || !binding.projectId.trim()
    || !Number.isSafeInteger(binding.projectRevision) || binding.projectRevision < 0
    || typeof binding.projectSnapshotId !== "string" || !binding.projectSnapshotId.trim()
    || !Number.isSafeInteger(binding.projectJournalEntryCount) || binding.projectJournalEntryCount < 0) {
    throw new ResolvedAudioPlanError("AUDIO_PLAN_INVALID_REQUEST", "Project binding is invalid.");
  }
}

function validateNormalization(value: AudioNormalizationDecision): void {
  if (!isRecord(value) || (value.type !== "none" && value.type !== "target-lufs")) {
    throw new ResolvedAudioPlanError("AUDIO_PLAN_INVALID_REQUEST", "Normalization decision is invalid.");
  }
  if (value.type === "none") {
    rejectUnexpectedKeys(value, ["type"], "normalization decision");
    return;
  }
  rejectUnexpectedKeys(value, ["type", "targetLufs"], "normalization decision");
  if (!Number.isFinite(value.targetLufs)) {
    throw new ResolvedAudioPlanError("AUDIO_PLAN_INVALID_REQUEST", "Normalization target must be finite.");
  }
}

function validateJournalActor(actor: JournalActor): void {
  rejectUnexpectedKeys(actor, ["type", "id"], "journal actor");
  if (!isRecord(actor) || !["user", "agent", "system"].includes(String(actor.type))
    || (actor.id !== undefined && (typeof actor.id !== "string" || !actor.id.trim()))) {
    throw new ResolvedAudioPlanError("AUDIO_PLAN_INVALID_REQUEST", "Journal actor is invalid.");
  }
}

function structurallyEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => structurallyEqual(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && structurallyEqual(left[key], right[key]));
}

function rejectUnexpectedKeys(value: unknown, allowed: readonly string[], label: string): void {
  if (!isRecord(value)) throw new ResolvedAudioPlanError("AUDIO_PLAN_INVALID_REQUEST", `${label} must be an object.`);
  const accepted = new Set(allowed);
  const extras = Object.keys(value).filter((key) => !accepted.has(key));
  if (extras.length) {
    throw new ResolvedAudioPlanError("AUDIO_PLAN_INVALID_REQUEST", `${label} contains unexpected fields: ${extras.sort().join(", ")}.`);
  }
}

function mapApplicationError(cause: unknown, locale: "pt-BR" | "en-US", executionId: string): Error {
  if (cause instanceof MediaApplicationError) return cause;
  if (cause instanceof ResolvedAudioPlanError && [
    "AUDIO_PLAN_SOURCE_OFFLINE",
    "AUDIO_PLAN_SOURCE_CONTENT_CHANGED",
    "AUDIO_PLAN_SOURCE_VERIFICATION_UNAVAILABLE"
  ].includes(cause.code)) return cause;
  if (cause instanceof ResolvedAudioPlanError && cause.code === "AUDIO_PLAN_PROJECT_CONFLICT") {
    return new MediaApplicationError("MEDIA_PROJECT_CONFLICT", locale, executionId, {}, cause);
  }
  return new MediaApplicationError("MEDIA_INVALID_REQUEST", locale, executionId, {}, cause);
}

function defaultId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `audio_plan_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
