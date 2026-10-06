import type { ProjectHistory } from "@cevra/project-ir";
import { resolveManualVideoSequence } from "./manual-video-sequence.js";
import { ManualSequencePreviewApplicationService, type ManualSequencePreviewPlan } from "./manual-sequence-preview.js";
import type { SourceContentIdentityPort } from "./source-technical-descriptor.js";
import type { MediaPublicationEvidenceV1 } from "@cevra/contracts";
import { MediaApplicationService } from "./media-service.js";
import type { MediaExecutionOutcome } from "./types.js";
import { localSourceProbeInput } from "./local-source-uri.js";

/** Initial approved validation budgets. RSS is sampled; these are not proved commercial ceilings. */
export const MANUAL_EXPORT_LIMITS = Object.freeze({
  rendererRssBytes: 512 * 1024 * 1024,
  ownedJobBytes: 2 * 1024 * 1024 * 1024,
  concurrentJobs: 1
});
export const MANUAL_EXPORT_PROFILE = Object.freeze({
  container: "mp4", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
  requestedFps: 30, dynamicRange: "sdr", targetVideoBitsPerSecond: 20_000_000
} as const);

export interface ManualExportPreparationRequest {
  version: 1; expectedSnapshotId: string; operationId: string; locale: "pt-BR" | "en-US";
}
/** Trusted native/Host port only. UI requests contain no filesystem path. */
export interface ExportDestinationPreparationPort {
  prepare(requiredBytes: number, signal?: AbortSignal): Promise<Readonly<{ label: string; availableBytes: number }>>;
  revalidate(destination: Readonly<{ label: string; availableBytes: number }>, requiredBytes: number, signal?: AbortSignal): Promise<void>;
  /** Trusted issued native path; never supplied through an editing/UI request. */
  resolveOutputUri?(destination: Readonly<{ label: string; availableBytes: number }>): string;
  revalidatePublication?(destination: Readonly<{ label: string; availableBytes: number }>, publication: MediaPublicationEvidenceV1, signal?: AbortSignal): Promise<void>;
}
export interface ManualExportPreparation {
  readonly version: 1;
  readonly operationId: string;
  readonly snapshotId: string;
  readonly destinationLabel: string;
  readonly durationMs: number;
  readonly clipCount: number;
  readonly originalCount: number;
  readonly originalCopyBytes: number;
  readonly estimatedOwnedBytes: number;
  readonly renderAvailable: boolean;
  readonly status: "prepared";
  readonly blockingReason?: "legacy-timing-requires-conform";
}
export class ManualExportPreparationError extends Error {
  constructor(readonly code: string) { super(code); this.name = "ManualExportPreparationError"; }
}
export function manualExportError(code: string): ManualExportPreparationError { return new ManualExportPreparationError(code); }

export function validateManualExportPreparationRequest(value: unknown): ManualExportPreparationRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw manualExportError("MANUAL_EXPORT_INVALID_REQUEST");
  const request = structuredClone(value) as ManualExportPreparationRequest;
  if (Object.keys(request).some(key => !["version", "expectedSnapshotId", "operationId", "locale"].includes(key))
    || request.version !== 1 || typeof request.expectedSnapshotId !== "string" || !request.expectedSnapshotId || request.expectedSnapshotId.length > 128
    || typeof request.operationId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(request.operationId)
    || !["pt-BR", "en-US"].includes(request.locale)) throw manualExportError("MANUAL_EXPORT_INVALID_REQUEST");
  return request;
}

/** Preflight estimate, not a VBR upper bound, disk reservation or render admission. */
export function estimateManualExportOwnedBytes(plan: Pick<ManualSequencePreviewPlan, "sources" | "durationMs" | "clips">) {
  let copies = 0n;
  const originals = new Set<string>();
  for (const source of plan.sources) {
    const content = source.technicalDescriptor?.content;
    if (!content || !Number.isSafeInteger(content.sizeBytes) || content.sizeBytes < 1) throw manualExportError("MANUAL_EXPORT_SOURCE_UNVERIFIED");
    const key = JSON.stringify([source.uri, content.sha256, content.sizeBytes]);
    if (!originals.has(key)) { originals.add(key); copies += BigInt(content.sizeBytes); }
  }
  if (!Number.isFinite(plan.durationMs) || plan.durationMs <= 0 || plan.durationMs > Number.MAX_SAFE_INTEGER) throw manualExportError("MANUAL_EXPORT_INVALID_REQUEST");
  // Allocation estimates round upward once. Canonical edit/render timing is unchanged.
  const duration = BigInt(Math.ceil(plan.durationMs));
  // Stereo float32 PCM is a conservative workspace allowance, not an audio mapping decision.
  const pcm = duration * 384n;
  // Two target-size video allocations allow intermediate plus final staging.
  // The encoder target is not a maximum; a live owned-file guard is still required.
  const targetVideo = (duration * BigInt(MANUAL_EXPORT_PROFILE.targetVideoBitsPerSecond) + 7999n) / 8000n;
  const metadataAllowance = BigInt(plan.clips.length) * 4096n + 1024n * 1024n;
  const estimate = copies + pcm + targetVideo * 2n + metadataAllowance;
  if (copies > BigInt(MANUAL_EXPORT_LIMITS.ownedJobBytes)) throw manualExportError("MANUAL_EXPORT_DISK_LIMIT");
  return Object.freeze({ originalCopyBytes: Number(copies),
    estimatedOwnedBytes: Number(estimate > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : estimate) });
}

/** Original-source final execution through the existing durable Media service. */
export class ManualSequenceExportApplicationService {
  private readonly sequence: ManualSequencePreviewApplicationService;
  constructor(private readonly options: {
    history: ProjectHistory; identity: SourceContentIdentityPort; media: MediaApplicationService;
  }) {
    this.sequence = new ManualSequencePreviewApplicationService(options);
  }

  async execute(request: ManualExportPreparationRequest, destination: ExportDestinationPreparationPort,
    ownedWorkspaceUri: string, signal?: AbortSignal): Promise<MediaExecutionOutcome> {
    const stable = validateManualExportPreparationRequest(request);
    signal?.throwIfAborted();
    const project = this.options.history.current;
    if (project.history.headSnapshotId !== stable.expectedSnapshotId) throw manualExportError("MANUAL_EXPORT_STALE");
    if (project.timeline.timingPolicy !== "cfr30") throw manualExportError("MANUAL_EXPORT_CONFORM_REQUIRED");
    if (!destination.resolveOutputUri || !destination.revalidatePublication) throw manualExportError("MANUAL_EXPORT_UNAVAILABLE");
    const plan = await this.sequence.prepare({ version: 1, expectedSnapshotId: stable.expectedSnapshotId }, signal);
    const estimate = estimateManualExportOwnedBytes(plan);
    const target = await destination.prepare(estimate.originalCopyBytes, signal);
    await this.sequence.revalidate(plan, signal);
    const outputUri = destination.resolveOutputUri(target);
    const sourceById = new Map(plan.sources.map(source => [source.id, source]));
    const items = plan.clips.map(clip => {
      const source = sourceById.get(clip.sourceId)!;
      if (!clip.frameTiming || !source.technicalDescriptor) throw manualExportError("MANUAL_EXPORT_CONFORM_REQUIRED");
      const inputUri = localSourceProbeInput(source.uri);
      if (!inputUri) throw manualExportError("MANUAL_EXPORT_SOURCE_UNVERIFIED");
      return { inputUri, sourceStartFrame: clip.frameTiming.sourceStartFrame,
        sourceEndFrame: clip.frameTiming.sourceEndFrame, sourceContent: { ...source.technicalDescriptor.content },
        audioSelection: "single-source-stream" as const };
    });
    const executionId = `manual-export-${stable.operationId}`;
    const verify = async (guardSignal?: AbortSignal) => {
      await this.sequence.revalidate(plan, guardSignal);
      guardSignal?.throwIfAborted();
    };
    return this.options.media.execute({
      id: executionId, locale: stable.locale,
      operation: { type: "render-manual-video-sequence", version: 1, items, outputUri, ownedWorkspaceUri },
      mutation: { type: "export.add", exportId: executionId, presetId: "cevra.manual.cfr30.sdr1080.h264-aac.v1" },
      actor: { type: "user" },
      projectBinding: { projectId: project.project.id, projectRevision: project.history.revision,
        projectSnapshotId: stable.expectedSnapshotId, projectJournalEntryCount: this.options.history.entries.length }
    }, signal, {
      beforeEngine: { verify: async guardSignal => {
        await destination.revalidate(target, estimate.originalCopyBytes, guardSignal);
        await verify(guardSignal);
      } },
      beforeCommit: { verify: async guardSignal => {
        const record = await this.options.media.getExecutionRecord(executionId);
        const result = record?.attempts.at(-1)?.result;
        if (result?.type !== "file" || result.outputUri !== outputUri || !result.publication || !result.manualSequence) throw manualExportError("MANUAL_EXPORT_PUBLICATION_UNVERIFIED");
        await destination.revalidatePublication!(target, result.publication, guardSignal);
        const stamp = await this.options.identity.captureSource(outputUri, guardSignal);
        if (stamp.device !== result.publication.device || stamp.inode !== result.publication.inode
          || stamp.sizeBytes < 1 || stamp.sizeBytes > MANUAL_EXPORT_LIMITS.ownedJobBytes) throw manualExportError("MANUAL_EXPORT_PUBLICATION_UNVERIFIED");
        const identified = await this.options.identity.identifySource(outputUri, stamp, guardSignal);
        if (identified.content.sha256 !== result.manualSequence.outputSha256 || identified.content.sizeBytes !== stamp.sizeBytes
          || identified.bytesRead !== stamp.sizeBytes || await this.options.identity.checkSource(outputUri, stamp, guardSignal) !== "match") {
          throw manualExportError("MANUAL_EXPORT_PUBLICATION_UNVERIFIED");
        }
        await destination.revalidatePublication!(target, result.publication, guardSignal);
        // Full retained journal identity is checked after all asynchronous guards.
        await verify(guardSignal);
      } },
      assertCurrent: () => { signal?.throwIfAborted(); this.sequence.assertCurrent(plan); }
    });
  }
}

/** Read-only preparation. No engine, export.add, execution archive or checkpoint is invoked. */
export class ManualSequenceExportPreparationApplicationService {
  private readonly sequence: ManualSequencePreviewApplicationService;
  private readonly issued = new WeakMap<ManualExportPreparation, {
    plan: ManualSequencePreviewPlan; destination: Awaited<ReturnType<ExportDestinationPreparationPort["prepare"]>>;
    port: ExportDestinationPreparationPort;
  }>();
  constructor(private readonly options: { history: ProjectHistory; identity: SourceContentIdentityPort }) {
    this.sequence = new ManualSequencePreviewApplicationService(options);
  }

  async prepare(request: ManualExportPreparationRequest, destination: ExportDestinationPreparationPort, signal?: AbortSignal): Promise<ManualExportPreparation> {
    const stable = validateManualExportPreparationRequest(request);
    signal?.throwIfAborted();
    const journal = this.options.history.journalIdentity;
    const project = this.options.history.current;
    const clips = resolveManualVideoSequence(project, stable.expectedSnapshotId);
    if (!clips.length) throw manualExportError("MANUAL_EXPORT_UNSUPPORTED");
    const ids = new Set(clips.map(clip => clip.sourceId));
    const sources = project.sources.filter(source => ids.has(source.id));
    const estimate = estimateManualExportOwnedBytes({ sources, clips, durationMs: project.timeline.durationMs });
    // Reject only a known impossibility here. The bitrate estimate is not a
    // maximum, minimum, duration cap or proof that the future pipeline fits.
    const target = await destination.prepare(estimate.originalCopyBytes, signal);
    signal?.throwIfAborted();
    if (journal !== this.options.history.journalIdentity) throw manualExportError("MANUAL_EXPORT_STALE");
    const plan = await this.sequence.prepare({ version: 1, expectedSnapshotId: stable.expectedSnapshotId }, signal);
    await destination.revalidate(target, estimate.originalCopyBytes, signal);
    await this.sequence.revalidate(plan, signal);
    signal?.throwIfAborted();
    if (journal !== this.options.history.journalIdentity) throw manualExportError("MANUAL_EXPORT_STALE");
    const result: ManualExportPreparation = Object.freeze({
      version: 1, operationId: stable.operationId, snapshotId: plan.snapshotId, destinationLabel: target.label,
      durationMs: plan.durationMs, clipCount: plan.clips.length, originalCount: plan.sources.length, ...estimate,
      renderAvailable: project.timeline.timingPolicy === "cfr30", status: "prepared",
      ...(project.timeline.timingPolicy !== "cfr30" ? { blockingReason: "legacy-timing-requires-conform" as const } : {})
    });
    this.issued.set(result, { plan, destination: target, port: destination });
    return result;
  }

  async revalidate(preparation: ManualExportPreparation, signal?: AbortSignal): Promise<void> {
    const issued = this.issued.get(preparation);
    if (!issued) throw manualExportError("MANUAL_EXPORT_STALE");
    await issued.port.revalidate(issued.destination, preparation.originalCopyBytes, signal);
    await this.sequence.revalidate(issued.plan, signal);
    signal?.throwIfAborted();
  }
}
