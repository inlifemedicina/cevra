/** Closed original-master CFR30 operations. Filesystem authority remains in the trusted Host. */
export const MANUAL_SEQUENCE_SAMPLING_POLICY = "source-pts-fps30-near-v1" as const;
export const MANUAL_SEQUENCE_FPS = 30 as const;
export const MANUAL_SEQUENCE_SAMPLE_RATE = 48_000 as const;
export const MANUAL_SEQUENCE_SAMPLES_PER_FRAME = 1_600 as const;
export const MAX_MANUAL_SEQUENCE_ITEMS = 2_048;
export const MAX_MANUAL_SEQUENCE_FRAMES = 7 * 24 * 60 * 60 * 30;
export interface ManualVideoSequenceItem {
  inputUri: string;
  sourceStartFrame: number;
  sourceEndFrame: number;
  sourceContent: { sha256: string; sizeBytes: number };
  audioSelection: "single-source-stream";
}
export interface RenderManualVideoSequenceOperationV1 {
  type: "render-manual-video-sequence";
  version: 1;
  items: ManualVideoSequenceItem[];
  outputUri: string;
  ownedWorkspaceUri: string;
}
export interface RenderManualVideoPreviewOperationV1 {
  type: "render-manual-video-preview";
  version: 1;
  item: ManualVideoSequenceItem;
  outputUri: string;
  ownedWorkspaceUri: string;
}
/** Whole canonical montage, prepared ephemerally with the existing preview profile. */
export interface RenderManualVideoPreviewOperationV2 {
  type: "render-manual-video-preview";
  version: 2;
  items: ManualVideoSequenceItem[];
  outputUri: string;
  ownedWorkspaceUri: string;
}
export interface ManualSequenceSourceEvidenceV1 {
  inputUri: string;
  sha256: string;
  sizeBytes: number;
  videoStreamIndex: number;
  audioStreamIndex: number;
  audioStreamCount: 1;
  sampleRate: 44_100 | 48_000;
  channelLayout: "mono" | "stereo";
  sourceVideoFrameCount: number;
  sourceVideoEndMs: number;
  sourceAudioFirstSample: number;
  sourceAudioSampleCount: number;
}
export interface ManualSequenceExecutionEvidenceV1 {
  version: 1;
  outputSha256: string;
  profile: "manual-cfr30-export-v1" | "manual-cfr30-preview-v1";
  samplingPolicy: typeof MANUAL_SEQUENCE_SAMPLING_POLICY;
  frameRate: { numerator: 30; denominator: 1 };
  container: "mp4";
  videoCodec: "h264";
  audioCodec: "aac";
  dynamicRange: "sdr";
  width: 1920 | 720;
  height: 1080 | 404;
  targetVideoBitsPerSecond: number;
  totalFrames: number;
  outputFrameCount: number;
  totalPcmSamples: number;
  outputAudioSampleCount: number;
  audioSampleRate: 48_000;
  audioChannelLayout: "mono" | "stereo";
  durationMs: number;
  muxVideoDurationMs: number;
  muxAudioDurationMs: number;
  itemCount: number;
  uniqueSegmentCount: number;
  sources: ManualSequenceSourceEvidenceV1[];
  /** Optional operational evidence; historical results remain valid without it. */
  logicalBudget?: {
    version: 1; enforcement: "reserved-logical-space"; budgetBytes: number;
    peakReservedBytes: number; producerCount: number;
    accountingOverlapReserved: true; allocatedBlockQuota: false;
  };
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function closed(value: unknown, fields: string[], label: string): asserts value is Record<string, unknown> {
  if (!record(value) || Object.keys(value).length !== fields.length || Object.keys(value).some(key => !fields.includes(key))) throw Error(`${label} must contain exactly its closed fields.`);
}
function integer(value: unknown, minimum: number, maximum: number, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) throw Error(`${label} is outside its integer bound.`);
}
function path(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value || value.length > 32_768 || /[\0\r\n]/u.test(value) || (!value.startsWith("/") && !/^[A-Za-z]:[\\/][^\\/]/u.test(value)) || value.startsWith("//")) throw Error("Manual sequence requires an absolute local path.");
}
export function validateManualVideoSequenceItem(value: unknown): ManualVideoSequenceItem {
  closed(value, ["inputUri", "sourceStartFrame", "sourceEndFrame", "sourceContent", "audioSelection"], "Manual sequence item");
  path(value.inputUri);
  integer(value.sourceStartFrame, 0, MAX_MANUAL_SEQUENCE_FRAMES, "sourceStartFrame");
  integer(value.sourceEndFrame, 1, MAX_MANUAL_SEQUENCE_FRAMES, "sourceEndFrame");
  if (value.sourceEndFrame <= value.sourceStartFrame) throw Error("Manual source frame range must be positive.");
  closed(value.sourceContent, ["sha256", "sizeBytes"], "Source content");
  if (typeof value.sourceContent.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(value.sourceContent.sha256)) throw Error("Source SHA-256 is invalid.");
  integer(value.sourceContent.sizeBytes, 1, Number.MAX_SAFE_INTEGER, "Source size");
  if (value.audioSelection !== "single-source-stream") throw Error("Manual sequence audio requires explicit single-source-stream admission.");
  return value as unknown as ManualVideoSequenceItem;
}
export function validateManualVideoOperation(value: unknown): RenderManualVideoSequenceOperationV1 | RenderManualVideoPreviewOperationV1 | RenderManualVideoPreviewOperationV2 {
  if (!record(value)) throw Error("Manual video operation is invalid.");
  const preview = value.type === "render-manual-video-preview";
  const single = preview && value.version === 1;
  closed(value, ["type", "version", single ? "item" : "items", "outputUri", "ownedWorkspaceUri"], "Manual video operation");
  if ((!preview && value.type !== "render-manual-video-sequence") || (preview ? ![1, 2].includes(value.version as number) : value.version !== 1)) throw Error("Manual video operation version/type is invalid.");
  path(value.outputUri); path(value.ownedWorkspaceUri);
  if (!value.outputUri.toLowerCase().endsWith(".mp4") || value.outputUri === value.ownedWorkspaceUri) throw Error("Manual output must be a distinct MP4 path.");
  const items = single ? [value.item] : value.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_MANUAL_SEQUENCE_ITEMS) throw Error("Manual sequence item count exceeds its bound.");
  const identities = new Map<string, string>(); let frames = 0;
  for (const raw of items) {
    const item = validateManualVideoSequenceItem(raw);
    if (item.inputUri === value.outputUri || item.inputUri === value.ownedWorkspaceUri) throw Error("Manual output/workspace aliases an original.");
    const identity = `${item.sourceContent.sha256}:${item.sourceContent.sizeBytes}`;
    if (identities.has(item.inputUri) && identities.get(item.inputUri) !== identity) throw Error("Repeated original identity is inconsistent.");
    identities.set(item.inputUri, identity); frames += item.sourceEndFrame - item.sourceStartFrame;
  }
  integer(frames, 1, MAX_MANUAL_SEQUENCE_FRAMES, "Program frames");
  if (identities.size > 128) throw Error("Manual sequence has too many originals.");
  return value as unknown as RenderManualVideoSequenceOperationV1 | RenderManualVideoPreviewOperationV1 | RenderManualVideoPreviewOperationV2;
}
export function validateManualSequenceExecutionEvidence(value: unknown): ManualSequenceExecutionEvidenceV1 {
  const hasBudget = record(value) && Object.hasOwn(value, "logicalBudget");
  closed(value, ["version", "outputSha256", "profile", "samplingPolicy", "frameRate", "container", "videoCodec", "audioCodec", "dynamicRange", "width", "height", "targetVideoBitsPerSecond", "totalFrames", "outputFrameCount", "totalPcmSamples", "outputAudioSampleCount", "audioSampleRate", "audioChannelLayout", "durationMs", "muxVideoDurationMs", "muxAudioDurationMs", "itemCount", "uniqueSegmentCount", "sources", ...(hasBudget ? ["logicalBudget"] : [])], "Manual sequence evidence");
  if (hasBudget) {
    const budget = value.logicalBudget;
    closed(budget, ["version", "enforcement", "budgetBytes", "peakReservedBytes", "producerCount", "accountingOverlapReserved", "allocatedBlockQuota"], "Manual logical budget evidence");
    if (budget.version !== 1 || budget.enforcement !== "reserved-logical-space" || budget.accountingOverlapReserved !== true || budget.allocatedBlockQuota !== false) throw Error("Manual logical budget guarantee is invalid.");
    integer(budget.budgetBytes, 1, Number.MAX_SAFE_INTEGER, "logical budgetBytes");
    integer(budget.peakReservedBytes, 1, budget.budgetBytes, "peakReservedBytes");
    integer(budget.producerCount, 1, 4096, "producerCount");
  }
  if (typeof value.outputSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(value.outputSha256)) throw Error("Manual output SHA-256 is invalid.");
  const preview = value.profile === "manual-cfr30-preview-v1";
  if (value.version !== 1 || (!preview && value.profile !== "manual-cfr30-export-v1") || value.samplingPolicy !== MANUAL_SEQUENCE_SAMPLING_POLICY
    || value.container !== "mp4" || value.videoCodec !== "h264" || value.audioCodec !== "aac" || value.dynamicRange !== "sdr"
    || value.width !== (preview ? 720 : 1920) || value.height !== (preview ? 404 : 1080) || value.targetVideoBitsPerSecond !== (preview ? 700_000 : 20_000_000)
    || value.audioSampleRate !== 48_000 || !["mono", "stereo"].includes(value.audioChannelLayout as string)) throw Error("Manual sequence profile evidence is invalid.");
  closed(value.frameRate, ["numerator", "denominator"], "Manual frame rate");
  if (value.frameRate.numerator !== 30 || value.frameRate.denominator !== 1) throw Error("Manual frame rate must be 30/1.");
  integer(value.totalFrames, 1, MAX_MANUAL_SEQUENCE_FRAMES, "totalFrames");
  if (value.outputFrameCount !== value.totalFrames || value.totalPcmSamples !== value.totalFrames * 1600 || value.outputAudioSampleCount !== value.totalPcmSamples) throw Error("Manual frame/sample accounting is inconsistent.");
  const duration = value.totalFrames * 1000 / 30;
  for (const key of ["durationMs", "muxVideoDurationMs", "muxAudioDurationMs"]) {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key]) || Math.abs((value[key] as number) - duration) > (key === "durationMs" ? 1e-7 : 1)) throw Error(`Manual ${key} disagrees with exact frame duration.`);
  }
  integer(value.itemCount, 1, MAX_MANUAL_SEQUENCE_ITEMS, "itemCount"); integer(value.uniqueSegmentCount, 1, value.itemCount, "uniqueSegmentCount");
  if (!Array.isArray(value.sources) || !value.sources.length || value.sources.length > Math.min(128, value.itemCount)) throw Error("Manual source evidence is invalid.");
  const seen = new Set<string>();
  for (const source of value.sources) {
    closed(source, ["inputUri", "sha256", "sizeBytes", "videoStreamIndex", "audioStreamIndex", "audioStreamCount", "sampleRate", "channelLayout", "sourceVideoFrameCount", "sourceVideoEndMs", "sourceAudioFirstSample", "sourceAudioSampleCount"], "Manual source evidence");
    path(source.inputUri); if (seen.has(source.inputUri)) throw Error("Duplicate source evidence."); seen.add(source.inputUri);
    if (typeof source.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(source.sha256) || source.audioStreamCount !== 1 || ![44100, 48000].includes(source.sampleRate as number) || !["mono", "stereo"].includes(source.channelLayout as string)) throw Error("Manual audio/source evidence is invalid.");
    integer(source.sizeBytes, 1, 256 * 1024 * 1024, "source sizeBytes");
    integer(source.sourceVideoFrameCount, 1, 3600, "sourceVideoFrameCount");
    integer(source.sourceAudioSampleCount, 1, 61 * (source.sampleRate as number), "sourceAudioSampleCount");
    integer(source.sourceAudioFirstSample, 0, (source.sampleRate as number) / 10, "sourceAudioFirstSample");
    for (const key of ["videoStreamIndex", "audioStreamIndex"]) integer(source[key], 0, 2147483647, key);
    if (source.videoStreamIndex === source.audioStreamIndex || typeof source.sourceVideoEndMs !== "number" || !Number.isFinite(source.sourceVideoEndMs) || source.sourceVideoEndMs <= 0 || source.sourceVideoEndMs > 60001) throw Error("Manual source clock evidence is invalid.");
  }
  if (value.audioChannelLayout !== (value.sources.some(source => source.channelLayout === "stereo") ? "stereo" : "mono")) throw Error("Manual output channel mapping disagrees with the measured sources.");
  return value as unknown as ManualSequenceExecutionEvidenceV1;
}
