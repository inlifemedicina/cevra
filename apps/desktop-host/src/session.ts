import {
  LocalSourceIngestService,
  EditorialDraftService,
  MediaApplicationService,
  ResolvedAudioPlanApplicationService,
  SourceTechnicalDescriptorApplicationService,
  SourceTechnicalDescriptorResolver,
  ManualVideoClipApplicationService,
  ManualVideoSequenceApplicationService,
  ManualSequencePreviewApplicationService,
  ManualSequenceExportPreparationApplicationService,
  ManualSequenceExportApplicationService,
  MediaApplicationError,
  MediaExecutionCommitError,
  resolveManualVideo,
  TranscriptionApplicationService
} from "@cevra/application";
import type {
  AdoptSourceTechnicalDescriptorOutcome,
  AdoptSourceTechnicalDescriptorRequest,
  ExecuteResolvedAudioPlanOutcome,
  ExecuteResolvedAudioPlanRequest,
  MediaExecutionRepository,
  MediaExecutionRecord,
  MediaExecutionIntentRepository
} from "@cevra/application";
import type { CreateEditorialDraftRequest, EditorialDraftState, EditorialDraftV1, ReviseEditorialDraftRequest, SemanticEditorialAnalysisCandidateV1 } from "@cevra/application";
import type { TrimManualVideoClipRequest, CreateManualVideoClipRequest, LocalVideoPreviewRequest, LocalVideoPreview, SourceThumbnail, SourceThumbnailRequest } from "@cevra/application";
import type { ManualVideoSequenceEdit } from "@cevra/application";
import { validateManualExportPreparationRequest, type ManualExportPreparationRequest, type ManualExportPreparation } from "@cevra/application";
import type { MediaEngineAdapter } from "@cevra/contracts";
import {
  FfmpegMediaEngine,
  NodeMediaArtifactStore,
  PersistentMediaWorkerClient,
  ProcessMediaWorkerTransport,
  OwnedRenderResourceError
} from "@cevra/media-ffmpeg";
import { ProjectHistory } from "@cevra/project-ir";
import {
  assertModelCacheIsolated,
  FasterWhisperTranscriptionAdapter,
  resolveLocalFasterWhisperModel,
  resolveRuntimePaths as resolveTranscriptionRuntimePaths,
  type LocalTranscriptionAdapterOptions,
  type SupportedTranscriptionModelId
} from "@cevra/transcription-faster-whisper";
import { FileTranscriptCache } from "@cevra/transcript-cache";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DesktopPersistenceError, DesktopProjectPersistence, historyCheckpointToken } from "./persistence.js";
import {
  DesktopMediaExecutionArchiveFullError,
  isDesktopMediaExecutionArchiveOperationalError
} from "./media-execution-archive.js";
import type { CapabilityState, DesktopHostState } from "./protocol.js";
import { readDesignatedFa02Pair } from "./fa02-review-admission.js";
import { readLocalVideoPreview } from "./local-video-preview.js";
import { SourceThumbnailService } from "./source-thumbnail.js";
import { DerivedVideoPreview, resolvePreviewRange, supportsOriginalProxy } from "./derived-video-preview.js";
import { NativeManualExportDestination } from "./manual-export-destination.js";
import { guardManualExportEngine } from "./manual-export-resources.js";

type Locale = "pt-BR" | "en-US";

function nativeDestinationPath(uri: string): string {
  try {
    const path = uri.startsWith("file:") ? fileURLToPath(uri) : uri;
    if (!isAbsolute(path) || path.includes("\0")) throw Error();
    return path;
  } catch { throw safeError("MANUAL_EXPORT_DESTINATION_INVALID"); }
}

export interface DesktopSessionServices {
  history: ProjectHistory;
  ingest?: Pick<LocalSourceIngestService, "ingest"> & Partial<Pick<LocalSourceIngestService, "reuseRegistered">>;
  sourceTechnicalDescriptor?: Pick<SourceTechnicalDescriptorApplicationService, "adopt">;
  transcription?: Pick<TranscriptionApplicationService, "transcribeSource">;
  mediaCapability: CapabilityState;
  transcriptionCapability: CapabilityState;
  persistence?: DesktopProjectPersistence;
  temporaryEditorialReview?: true;
  manualVideoClip?: Pick<ManualVideoClipApplicationService, "create" | "trim">;
  manualVideoSequence?: Pick<ManualVideoSequenceApplicationService, "edit"> & Partial<Pick<ManualVideoSequenceApplicationService, "previewConform">>;
  manualSequencePreview?: Pick<ManualSequencePreviewApplicationService, "prepare" | "assertCurrent" | "revalidate">;
  manualExportPreparation?: Pick<ManualSequenceExportPreparationApplicationService, "prepare">;
  manualExport?: Pick<ManualSequenceExportApplicationService, "execute">;
  manualExportCapability?: CapabilityState;
  manualExportSettle?: () => Promise<void>;
  sourceThumbnail?: Pick<SourceThumbnailService, "prepare" | "close">;
  derivedVideoPreview?: Pick<DerivedVideoPreview, "prepare"> & Partial<Pick<DerivedVideoPreview, "close">>;
  resolvedAudioPlan?: Pick<ResolvedAudioPlanApplicationService, "execute" | "markCheckpointSucceeded">;
  close?(): Promise<void>;
}

export class DesktopSession {
  private readonly editorial: EditorialDraftService;
  private acceptedAnalysis: SemanticEditorialAnalysisCandidateV1 | null = null;
  private editorialDraft: EditorialDraftV1 | null = null;
  private readonly operations = new Map<string, AbortController>();
  private readonly activeTasks = new Map<string, Promise<unknown>>();
  private activeMutationTask: Promise<unknown> | null = null;
  private previewTask: Promise<LocalVideoPreview> | null = null;
  private previewOperationId: string | null = null;
  private previewPreparationTail: Promise<unknown> = Promise.resolve();
  private readonly thumbnailOperationIds = new Set<string>();
  private legacyPreviewSequence = 0;
  private readonly legacyPreviewOperationIds = new Set<string>();
  private exportPreparationTask: Promise<ManualExportPreparation> | null = null;
  private exportPreparationOperationId: string | null = null;
  private closing = false;
  private closeAttempt: { id: string; checkpointToken?: string; committed: boolean } | null = null;

  constructor(private readonly services: DesktopSessionServices) {
    this.editorial = new EditorialDraftService(services.history);
  }

  /** Trusted in-process Application handoff only; never a WebView/RPC admission. */
  acceptEditorialAnalysis(request: CreateEditorialDraftRequest): void {
    if (this.closing) throw safeError("PROJECT_CLOSE_PENDING", { state: this.state() });
    if (this.activeMutationTask) throw safeError("PROJECT_MUTATION_BUSY");
    // One accepted analysis per session: revision 0 cannot be reused by a
    // replacement context while a WebView still holds an earlier projection.
    if (this.acceptedAnalysis) throw safeError("EDITORIAL_DRAFT_ALREADY_ACCEPTED");
    const draft = this.editorial.create(request);
    this.acceptedAnalysis = structuredClone(request.analysis);
    this.editorialDraft = draft;
  }

  editorialState(): EditorialDraftState {
    if (!this.editorialDraft || !this.acceptedAnalysis) return { status: "empty" };
    try {
      this.editorial.assertCurrent(this.editorialDraft);
      return { status: "current", draft: structuredClone(this.editorialDraft) };
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "EDITORIAL_DRAFT_STALE") return { status: "stale" };
      throw error;
    }
  }

  reviseEditorialDraft(request: ReviseEditorialDraftRequest): EditorialDraftState {
    if (this.closing) throw safeError("PROJECT_CLOSE_PENDING", { state: this.state() });
    if (this.activeMutationTask) throw safeError("PROJECT_MUTATION_BUSY");
    if (!this.editorialDraft) throw safeError("EDITORIAL_DRAFT_UNAVAILABLE");
    this.editorialDraft = this.editorial.revise(this.editorialDraft, request);
    return this.editorialState();
  }

  state(): DesktopHostState {
    return {
      project: this.services.history.current,
      sourceNumbering: this.services.history.sourceNumbering,
      canUndo: !this.services.temporaryEditorialReview && this.services.history.canUndo,
      canRedo: !this.services.temporaryEditorialReview && this.services.history.canRedo,
      status: { hostAvailable: true, persistence: this.services.temporaryEditorialReview ? "temporary-review" : this.services.persistence?.stateFor(this.services.history) ?? "local-unsaved" },
      ...(this.services.persistence && !this.services.temporaryEditorialReview ? { checkpoint: {
        token: historyCheckpointToken(this.services.history),
        pending: this.services.persistence.state === "checkpoint-pending"
      } } : {}),
      closePending: this.closeAttempt !== null,
      capabilities: {
        mediaImport: { ...this.services.mediaCapability },
        transcription: { ...this.services.transcriptionCapability },
        manualExport: this.services.manualExport && this.services.manualExportSettle && !this.services.temporaryEditorialReview
          ? { ...(this.services.manualExportCapability ?? unavailable("runtime-not-configured")) }
          : unavailable(this.services.temporaryEditorialReview ? "review-session" : "runtime-not-configured")
      }
    };
  }

  async retryCheckpoint(expectedToken: string): Promise<DesktopHostState> {
    return this.runMutation(async () => {
      if (!this.services.persistence) throw safeError("PROJECT_PERSISTENCE_UNAVAILABLE");
      if (expectedToken !== historyCheckpointToken(this.services.history)) throw safeError("PROJECT_CHECKPOINT_STALE", { state: this.state() });
      try {
        await this.services.persistence.retryCheckpoint(this.services.history);
      } catch {
        throw safeError("PROJECT_PERSISTENCE_FAILED", { state: this.state() });
      }
      return this.state();
    });
  }

  /** Native lifecycle gate only. No autosave, cancellation or mutation is implied. */
  prepareClose(attemptId: string): { ready: true; attemptId: string } {
    if (this.closeAttempt?.id === attemptId) return { ready: true, attemptId };
    if (this.closing || this.activeMutationTask || this.activeTasks.size || this.previewTask) throw safeError("PROJECT_CLOSE_BUSY", { state: this.state() });
    const persistence = this.services.persistence;
    if (!this.services.temporaryEditorialReview && (!persistence || !["local-saved", "local-recovered"].includes(persistence.stateFor(this.services.history)))) {
      throw safeError("PROJECT_CLOSE_UNSAVED", { state: this.state() });
    }
    // No await between checking canonical durability and freezing mutation admission.
    this.closeAttempt = { id: attemptId, committed: false, ...(persistence ? { checkpointToken: historyCheckpointToken(this.services.history) } : {}) };
    this.closing = true;
    return { ready: true, attemptId };
  }

  cancelClose(attemptId: string): { released: boolean; committed: boolean } {
    if (!this.closeAttempt) return { released: true, committed: false };
    if (this.closeAttempt.id !== attemptId || this.closeAttempt.committed) return { released: false, committed: this.closeAttempt.committed };
    this.closeAttempt = null;
    this.closing = false;
    return { released: true, committed: false };
  }

  admitShutdown(attemptId: string): void {
    if (this.closeAttempt?.id !== attemptId || !this.closing || this.activeMutationTask || this.activeTasks.size || this.previewTask) throw safeError("PROJECT_CLOSE_BUSY", { state: this.state() });
    if (this.closeAttempt.checkpointToken !== undefined && (
      this.closeAttempt.checkpointToken !== historyCheckpointToken(this.services.history)
      || !["local-saved", "local-recovered"].includes(this.services.persistence!.stateFor(this.services.history))
    )) {
      this.cancelClose(attemptId);
      throw safeError("PROJECT_CLOSE_UNSAVED", { state: this.state() });
    }
    this.closeAttempt.committed = true;
  }

  async ingestLocal(params: { uri: string; displayName: string; operationId: string; locale: Locale }): Promise<{ state: DesktopHostState; importedSourceId: string; reused?: boolean }> {
    if (!this.services.mediaCapability.available || !this.services.ingest) throw safeError("MEDIA_UNAVAILABLE");
    return this.runOperation(params.operationId, (signal) => this.runMutation(async () => {
      const reused = await this.services.ingest!.reuseRegistered?.({ uri: params.uri, locale: params.locale }, signal);
      if (reused) return { state: this.state(), importedSourceId: reused.id, reused: true };
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

  /** Destination comes from the native picker; this route never renders or checkpoints. */
  async prepareManualExport(request: ManualExportPreparationRequest, destinationUri: string): Promise<ManualExportPreparation> {
    if (this.closing) throw safeError("OPERATION_CANCELLED");
    if (this.services.temporaryEditorialReview) throw safeError("EDITORIAL_REVIEW_READ_ONLY");
    if (this.activeMutationTask) throw safeError("PROJECT_MUTATION_BUSY");
    if (!this.services.manualExportPreparation) throw safeError("MANUAL_EXPORT_UNAVAILABLE");
    const stable = validateManualExportPreparationRequest(request);
    if (this.operations.has(stable.operationId)) throw safeError("OPERATION_DUPLICATE");
    const journal = this.services.history.journalIdentity;
    const previous = this.exportPreparationTask;
    if (this.exportPreparationOperationId) this.cancel(this.exportPreparationOperationId);
    const task = this.runOperation(stable.operationId, async signal => {
      await previous?.catch(() => undefined);
      signal.throwIfAborted();
      if (this.activeMutationTask) throw safeError("PROJECT_MUTATION_BUSY");
      if (journal !== this.services.history.journalIdentity) throw safeError("MANUAL_EXPORT_STALE");
      const preparation = await this.services.manualExportPreparation!.prepare(stable, new NativeManualExportDestination(destinationUri), signal);
      signal.throwIfAborted();
      if (this.activeMutationTask) throw safeError("PROJECT_MUTATION_BUSY");
      if (journal !== this.services.history.journalIdentity) throw safeError("MANUAL_EXPORT_STALE");
      return preparation;
    });
    this.exportPreparationTask = task;
    this.exportPreparationOperationId = stable.operationId;
    try { return await task; } finally {
      if (this.exportPreparationTask === task) { this.exportPreparationTask = null; this.exportPreparationOperationId = null; }
    }
  }

  previewManualSequenceConform(request: { version: 1; expectedSnapshotId: string }) {
    if (!this.services.manualVideoSequence?.previewConform || this.services.temporaryEditorialReview) throw safeError("MANUAL_SEQUENCE_UNAVAILABLE");
    return this.services.manualVideoSequence.previewConform(request.expectedSnapshotId);
  }

  /** Only a native-picked destination enters this mutating, checkpointed route. */
  async exportManualSequence(request: ManualExportPreparationRequest, destinationUri: string) {
    if (!this.services.manualExport || !this.services.manualExportSettle || !this.services.manualExportCapability?.available) {
      throw safeError("MANUAL_EXPORT_UNAVAILABLE");
    }
    const stable = validateManualExportPreparationRequest(request);
    return this.runOperation(stable.operationId, signal => this.runMutation(async () => {
      // Reserve the mutation gate before cancellation listeners or retirement
      // can admit another read-only media job.
      await Promise.resolve();
      try { await this.retireManualPreviews(); }
      catch (cause) { throw Object.assign(safeError("MANUAL_EXPORT_RESOURCE_UNAVAILABLE", { state: this.state() }), { cause }); }
      signal.throwIfAborted();
      const pickedPath = nativeDestinationPath(destinationUri);
      const destination = new NativeManualExportDestination(pickedPath, { temporaryRoot: dirname(pickedPath) });
      const workspace = await destination.createOwnedWorkspace(signal);
      const before = this.services.history.entries.length;
      const exportId = `manual-export-${stable.operationId}`;
      const absentBefore = !this.services.history.current.exports.some(item => item.id === exportId);
      let primary: unknown;
      let checkpointAttempted = false;
      let completedRecord: MediaExecutionRecord | undefined;
      let canonicalCommitted = false;
      let resourceFailureCode: string | undefined;
      try {
        await workspace.revalidate(signal);
        const outcome = await this.services.manualExport!.execute(stable, destination, workspace.uri, signal);
        completedRecord = outcome.record;
        canonicalCommitted = absentBefore && this.matchesCommittedManualExport(outcome.record, stable, destination, workspace.uri, before);
        // Publication/commit can precede cancellation; save the authoritative
        // mutation rather than report a false cancellation after success.
        checkpointAttempted = true;
        await this.persistMutation();
        return { outcome: "exported" as const, state: this.state(), executionId: outcome.record.id,
          exportId: `manual-export-${stable.operationId}`, destinationLabel: basename(pickedPath) };
      } catch (error) {
        const record = completedRecord ?? (error instanceof MediaExecutionCommitError ? error.committedRecord : undefined);
        if (absentBefore && record && this.matchesCommittedManualExport(record, stable, destination, workspace.uri, before)) {
          canonicalCommitted = true;
          // The canonical export is authoritative even if its archive's final
          // save failed. Checkpoint it once; never replay or auto-retry a save.
          let checkpointError: unknown;
          if (!checkpointAttempted) {
            checkpointAttempted = true;
            try { await this.persistMutation(); } catch (failure) { checkpointError = failure; }
          }
          primary = safeError("MANUAL_EXPORT_COMMITTED_ERROR", { state: this.state(), executionId: record.id,
            exportId, destinationLabel: basename(pickedPath), checkpointStatus: this.state().status.persistence });
          Object.defineProperty(primary, "cause", { value: error });
          if (checkpointError) Object.defineProperty(primary, "checkpointError", { value: checkpointError });
        } else {
          resourceFailureCode = manualExportResourceCode(error);
          primary = resourceFailureCode ? Object.assign(safeError(resourceFailureCode, { state: this.state() }), { cause: error }) : error;
        }
        throw primary;
      } finally {
        try {
          await this.services.manualExportSettle!();
          if (primary && !canonicalCommitted && await workspace.hasUnsettledPublication(pickedPath)) {
            const uncertain = Object.assign(safeError("MANUAL_EXPORT_PUBLICATION_UNVERIFIED", { state: this.state(),
              ...(resourceFailureCode ? { causeCode: resourceFailureCode } : {}) }), { cause: primary });
            primary = uncertain;
            throw uncertain;
          }
          await workspace.remove();
        } catch (cleanupError) {
          if (cleanupError === primary) throw primary;
          if (primary && typeof primary === "object") {
            try { Object.defineProperty(primary, "cleanupError", { value: cleanupError, configurable: true }); } catch { /* Keep the execution/checkpoint failure. */ }
            if (!canonicalCommitted) throw Object.assign(safeError("MANUAL_EXPORT_CLEANUP_FAILED", { state: this.state(),
              ...(resourceFailureCode ? { causeCode: resourceFailureCode } : {}) }), { cause: primary, cleanupError });
          } else { throw safeError("MANUAL_EXPORT_CLEANUP_FAILED", { state: this.state() }); }
        }
      }
    }));
  }

  private async retireManualPreviews(): Promise<void> {
    const previous = this.previewPreparationTail;
    for (const id of this.thumbnailOperationIds) this.cancel(id);
    if (this.previewOperationId) this.cancel(this.previewOperationId);
    const legacy = [...this.activeTasks.entries()].filter(([id]) => this.legacyPreviewOperationIds.has(id));
    for (const [id] of legacy) this.cancel(id);
    await Promise.allSettled([...(previous ? [previous] : []), ...legacy.map(([, task]) => task)]);
    // The preview promise may reject before process retirement; do not start a
    // resource scope until the production transport proves quiescence too.
    await this.services.manualExportSettle!();
  }

  private matchesCommittedManualExport(record: MediaExecutionRecord, request: ManualExportPreparationRequest,
    destination: NativeManualExportDestination, workspaceUri: string, before: number): boolean {
    const id = `manual-export-${request.operationId}`, entries = this.services.history.entries, entry = entries.at(-1);
    const project = this.services.history.current, exported = project.exports.filter(item => item.id === id), attempt = record.attempts.at(-1);
    return record.id === id && record.projectId === project.project.id && record.operation.type === "render-manual-video-sequence"
      && record.operation.ownedWorkspaceUri === workspaceUri && destination.ownsOutputUri(record.operation.outputUri)
      && record.mutation.type === "export.add" && record.mutation.exportId === id
      && record.mutation.presetId === "cevra.manual.cfr30.sdr1080.h264-aac.v1"
      && record.projectBinding?.projectSnapshotId === request.expectedSnapshotId && record.projectBinding.projectJournalEntryCount === before
      && entries.length === before + 1 && entry?.command.type === "export.add" && entry.command.export.id === id
      && entry.command.export.outputUri === record.operation.outputUri && entry.command.export.presetId === record.mutation.presetId
      && exported.length === 1 && exported[0]!.status === "completed" && exported[0]!.outputUri === record.operation.outputUri
      && attempt?.status === "succeeded" && attempt.projectJournalEntryId === entry.id
      && attempt.projectSnapshotAfter === project.history.headSnapshotId && attempt.projectRevisionAfter === project.history.revision;
  }

  async undo(): Promise<DesktopHostState> {
    return this.runMutation(async () => {
      const changed = this.services.history.canUndo;
      this.services.history.undo();
      if (changed) await this.persistMutation();
      return this.state();
    });
  }

  async previewLocalVideo(request: LocalVideoPreviewRequest): Promise<LocalVideoPreview> {
    if (this.closing) throw safeError("OPERATION_CANCELLED");
    if (this.services.temporaryEditorialReview) throw safeError("EDITORIAL_REVIEW_READ_ONLY");
    if (this.activeMutationTask) throw safeError("PROJECT_MUTATION_BUSY");
    const stable = structuredClone(request);
    if (Object.keys(stable).some((key) => !["sourceId", "expectedSnapshotId", "clipId", "operationId", "sequence"].includes(key))
      || (stable.sequence !== undefined && (stable.sequence !== true || stable.clipId !== undefined || !stable.operationId))
      || (stable.clipId !== undefined && (!stable.clipId || !stable.operationId))
      || (stable.operationId !== undefined && (typeof stable.operationId !== "string" || !stable.operationId))) throw safeError("MANUAL_VIDEO_INVALID_REQUEST");
    if (stable.operationId !== undefined) {
      if (this.operations.has(stable.operationId!)) throw safeError("OPERATION_DUPLICATE");
      const resolve = () => (stable.clipId !== undefined || stable.sequence) ? resolvePreviewRange(this.services.history, stable)
        : { source: resolveManualVideo(this.services.history.current, stable) };
      resolve();
      if ((stable.clipId !== undefined || stable.sequence) && !this.services.derivedVideoPreview) throw safeError("MANUAL_VIDEO_UNAVAILABLE");
      // Only the latest preview prepares bytes. Cancellation is scoped to this
      // read-only operation; ingest/transcription keep their own controllers.
      const previous = this.previewPreparationTail;
      if (this.previewOperationId) this.cancel(this.previewOperationId);
      const task = this.runOperation(stable.operationId!, async (signal) => {
        await previous?.catch(() => undefined);
        if (signal.aborted) throw safeError("OPERATION_CANCELLED");
        const journal = this.services.history.journalIdentity;
        const sequence = stable.sequence || stable.clipId !== undefined && this.services.history.current.timeline.clips.length > 1;
        if (sequence && !this.services.manualSequencePreview) throw safeError("MANUAL_VIDEO_UNAVAILABLE");
        const plan = sequence ? await this.services.manualSequencePreview!.prepare({ version: 1, expectedSnapshotId: stable.expectedSnapshotId }, signal) : undefined;
        const { source } = resolve();
        const preview = this.services.derivedVideoPreview && (stable.clipId !== undefined || stable.sequence || supportsOriginalProxy(source))
          ? await this.services.derivedVideoPreview.prepare(stable, signal)
          : await readLocalVideoPreview(source, stable.expectedSnapshotId, signal);
        if (signal.aborted) throw safeError("OPERATION_CANCELLED");
        if (this.activeMutationTask) throw safeError("PROJECT_MUTATION_BUSY");
        if (plan) await this.services.manualSequencePreview!.revalidate(plan, signal);
        if (journal !== this.services.history.journalIdentity) throw safeError("MANUAL_VIDEO_STALE");
        if (signal.aborted) throw safeError("OPERATION_CANCELLED");
        if (this.activeMutationTask) throw safeError("PROJECT_MUTATION_BUSY");
        resolve();
        return preview;
      });
      this.previewPreparationTail = task.catch(() => undefined);
      this.previewTask = task;
      this.previewOperationId = stable.operationId!;
      try { return await task; } finally {
        if (this.previewTask === task) { this.previewTask = null; this.previewOperationId = null; }
      }
    }
    const legacyId = `legacy-preview-${++this.legacyPreviewSequence}`;
    this.legacyPreviewOperationIds.add(legacyId);
    try {
      return await this.runOperation(legacyId, async (signal) => {
        const source = resolveManualVideo(this.services.history.current, stable);
        const preview = await readLocalVideoPreview(source, stable.expectedSnapshotId, signal);
        if (this.activeMutationTask) throw safeError("PROJECT_MUTATION_BUSY");
        resolveManualVideo(this.services.history.current, stable);
        return preview;
      });
    } finally { this.legacyPreviewOperationIds.delete(legacyId); }
  }

  async thumbnailLocalVideo(request: SourceThumbnailRequest): Promise<SourceThumbnail> {
    if (this.closing) throw safeError("OPERATION_CANCELLED");
    if (this.services.temporaryEditorialReview) throw safeError("EDITORIAL_REVIEW_READ_ONLY");
    if (this.activeMutationTask) throw safeError("PROJECT_MUTATION_BUSY");
    if (!this.services.sourceThumbnail) throw safeError("MANUAL_VIDEO_UNAVAILABLE");
    const stable = structuredClone(request);
    if (Object.keys(stable).some(key => !["sourceId", "expectedSnapshotId", "operationId"].includes(key))
      || !stable.operationId || typeof stable.operationId !== "string") throw safeError("MANUAL_VIDEO_INVALID_REQUEST");
    resolveManualVideo(this.services.history.current, stable);
    if (this.operations.has(stable.operationId)) throw safeError("OPERATION_DUPLICATE");
    const previous = this.previewPreparationTail;
    this.thumbnailOperationIds.add(stable.operationId);
    const task = this.runOperation(stable.operationId, async signal => {
      await previous.catch(() => undefined); signal.throwIfAborted();
      if (this.activeMutationTask) throw safeError("PROJECT_MUTATION_BUSY");
      const frame = await this.services.sourceThumbnail!.prepare(stable, signal);
      if (this.activeMutationTask) throw safeError("PROJECT_MUTATION_BUSY");
      signal.throwIfAborted(); return frame;
    });
    this.previewPreparationTail = task.catch(() => undefined);
    try { return await task; } finally { this.thumbnailOperationIds.delete(stable.operationId); }
  }

  async createManualVideoClip(request: CreateManualVideoClipRequest): Promise<{ state: DesktopHostState; clipId: string }> {
    return this.runMutation(async () => {
      if (!this.services.manualVideoClip) throw safeError("MANUAL_VIDEO_UNAVAILABLE");
      const outcome = await this.services.manualVideoClip.create(structuredClone(request));
      await this.persistMutation();
      return { state: this.state(), clipId: outcome.clipId };
    });
  }

  async editManualVideoSequence(request: ManualVideoSequenceEdit): Promise<{ state: DesktopHostState; changedClipIds: string[] }> {
    return this.runMutation(async () => {
      if (!this.services.manualVideoSequence) throw safeError("MANUAL_VIDEO_UNAVAILABLE");
      const before = this.services.history.journalIdentity;
      const result = await this.services.manualVideoSequence.edit(structuredClone(request));
      if (before !== this.services.history.journalIdentity) await this.persistMutation();
      return { state: this.state(), changedClipIds: result.changedClipIds };
    });
  }

  async trimManualVideoClip(request: TrimManualVideoClipRequest): Promise<{ state: DesktopHostState; clipId: string }> {
    return this.runMutation(async () => {
      if (!this.services.manualVideoClip) throw safeError("MANUAL_VIDEO_UNAVAILABLE");
      const snapshot = this.services.history.current.history.headSnapshotId;
      const outcome = await this.services.manualVideoClip.trim(structuredClone(request));
      if (snapshot !== this.services.history.current.history.headSnapshotId) await this.persistMutation();
      return { state: this.state(), clipId: outcome.clipId };
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
    this.closing = true;
    this.services.derivedVideoPreview?.close?.();
    this.services.sourceThumbnail?.close();
    for (const controller of this.operations.values()) controller.abort();
    await Promise.allSettled([
      ...this.activeTasks.values(),
      ...(this.activeMutationTask ? [this.activeMutationTask] : [])
    ]);
    try {
      await this.services.close?.();
    } finally {
      this.services.derivedVideoPreview?.close?.();
      this.services.sourceThumbnail?.close();
      await this.services.persistence?.close();
    }
  }

  private async runOperation<T>(operationId: string, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.closing) throw safeError("OPERATION_CANCELLED");
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
    if (this.closeAttempt) throw safeError("PROJECT_CLOSE_PENDING", { state: this.state() });
    if (this.closing) throw safeError("OPERATION_CANCELLED");
    if (this.services.temporaryEditorialReview) throw safeError("EDITORIAL_REVIEW_READ_ONLY");
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
  const pair = await readDesignatedFa02Pair(environment);
  if (pair) {
    const session = new DesktopSession({ history: pair.history, temporaryEditorialReview: true,
      mediaCapability: unavailable("review-session"), transcriptionCapability: unavailable("review-session") });
    session.acceptEditorialAnalysis(pair.request);
    return session;
  }
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
      manualVideoClip: new ManualVideoClipApplicationService({ history, identity: sourceIdentity }),
      manualVideoSequence: new ManualVideoSequenceApplicationService({ history, identity: sourceIdentity }),
      manualSequencePreview: new ManualSequencePreviewApplicationService({ history, identity: sourceIdentity }),
      manualExportPreparation: new ManualSequenceExportPreparationApplicationService({ history, identity: sourceIdentity }),
      ...(media?.manualExportCapability?.available && media.settle ? {
        manualExport: new ManualSequenceExportApplicationService({ history, identity: sourceIdentity, media: media.application }),
        manualExportCapability: media.manualExportCapability, manualExportSettle: media.settle
      } : {}),
      ...(media?.ingest ? { ingest: media.ingest } : {}),
      ...(media?.sourceTechnicalDescriptor ? { sourceTechnicalDescriptor: media.sourceTechnicalDescriptor } : {}),
      ...(transcription.service ? { transcription: transcription.service } : {}),
      mediaCapability: media?.capability ?? unavailable(mediaArchiveFailure ?? "archive-unavailable"),
      transcriptionCapability: transcription.capability,
      persistence: opened.persistence,
      ...(media?.resolvedAudioPlan ? { resolvedAudioPlan: media.resolvedAudioPlan } : {}),
      ...(media?.engine && media.settle ? { sourceThumbnail: new SourceThumbnailService({ history, engine: media.engine, settle: media.settle }), derivedVideoPreview: new DerivedVideoPreview({ history, engine: media.engine, settle: media.settle,
        runtimeIdentity: () => createHash("sha256").update(readFileSync(resolve(configuredMediaRuntime.paths!.root, "manifest.json"))).digest("hex") }) } : {}),
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
  manualExportCapability?: CapabilityState;
  engine?: MediaEngineAdapter;
  settle?: () => Promise<void>;
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
    const engine = guardManualExportEngine(new FfmpegMediaEngine(worker), transport);
    const health = await engine.healthcheck();
    if (health.status === "unavailable") {
      await worker.close();
      return { capability: unavailable("runtime-invalid"), runtimeRoot: root, ...composeMediaApplicationServices(history, executions, unavailableMediaEngine(), sourceIdentity) };
    }
    const services = composeMediaApplicationServices(history, executions, engine, sourceIdentity);
    return {
      capability: available(),
      manualExportCapability: (await engine.capabilities()).some(capability => capability.id === "media.cevra-render-manual-video-sequence" && capability.available)
        ? available() : unavailable("runtime-invalid"),
      engine,
      settle: () => transport.settle(),
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
  if (!await resolveLocalFasterWhisperModel({ modelCacheDir, allowModelDownload: false }, modelId)) {
    return { capability: unavailable("model-not-available") };
  }
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
        sourceIdentity,
        ...(cache ? { cache } : {})
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

function manualExportResourceCode(error: unknown): string | undefined {
  const cause = error instanceof MediaApplicationError ? error.cause : error;
  if (!(cause instanceof OwnedRenderResourceError)) return undefined;
  switch (cause.code) {
    case "MEDIA_RENDER_MEMORY_LIMIT": return "MANUAL_EXPORT_MEMORY_LIMIT";
    case "MEDIA_RENDER_DISK_LIMIT": return "MANUAL_EXPORT_DISK_LIMIT";
    case "MEDIA_RENDER_RESOURCE_OBSERVATION_FAILED":
    case "MEDIA_RENDER_RESOURCE_BUSY": return "MANUAL_EXPORT_RESOURCE_UNAVAILABLE";
  }
}
