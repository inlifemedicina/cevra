import type { ProjectHistory } from "@cevra/project-ir";
import { resolveManualVideoSequence } from "./manual-video-sequence.js";
import { ManualSequencePreviewApplicationService, type ManualSequencePreviewPlan } from "./manual-sequence-preview.js";
import type { SourceContentIdentityPort } from "./source-technical-descriptor.js";

/** Approved requirements. This does not select the pending boundary-cadence policy. */
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
  readonly renderAvailable: false;
  readonly status: "prepared";
  readonly blockingReason: "delivery-timing-unresolved";
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
  if (!Number.isSafeInteger(plan.durationMs) || plan.durationMs < 1) throw manualExportError("MANUAL_EXPORT_INVALID_REQUEST");
  const duration = BigInt(plan.durationMs);
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
      renderAvailable: false, status: "prepared", blockingReason: "delivery-timing-unresolved"
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
