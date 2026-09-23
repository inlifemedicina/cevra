/** Read-only acoustic evidence, never a QA verdict or a canonical project asset. */
export const AUDIO_MEASUREMENT_METHOD = "cevra.audio-measurement.native-swr4.v1" as const;
/** Covers six-decimal dB serialization plus native float fixture quantization near 1.0. */
export const AUDIO_MEASUREMENT_LINEAR_TOLERANCE = 0.000002;
export const AUDIO_MEASUREMENT_RATES = [8000, 12000, 16000, 22050, 24000, 32000, 44100, 48000, 88200, 96000, 176400, 192000] as const;
export const AUDIO_MEASUREMENT_ERROR_CODES = ["INVALID_REQUEST", "INVALID_STREAM", "UNSUPPORTED_STREAM", "UNPROVEN_COVERAGE", "INCOMPLETE_COVERAGE", "INVALID_METADATA", "INCOMPLETE_COLLECTION", "NON_FINITE_SAMPLES", "NUMERICAL_RANGE", "INPUT_CHANGED", "TIMEOUT", "DECODE_OR_COLLECTION_FAILED"] as const;
export type AudioMeasurementErrorCode = typeof AUDIO_MEASUREMENT_ERROR_CODES[number];
export class AudioMeasurementError extends Error {
  constructor(readonly code: AudioMeasurementErrorCode) { super(`AUDIO_MEASUREMENT_${code}`); this.name = "AudioMeasurementError"; }
}

export interface MeasureAudioOperationV1 {
  type: "measure-audio";
  version: 1;
  inputUri: string;
  /** Absolute ffprobe stream index, not the ordinal amongst audio streams. */
  streamIndex: number;
  /** Original source PTS timeline in ms; a late stream is NOT shifted to zero. */
  startMs: number;
  endMs: number;
}

export type AudioLoudnessEvidence =
  | { status: "available"; value: number }
  | { status: "unavailable"; reason: "digital-silence" | "insufficient-duration" | "no-eligible-blocks" | "meter-range" };

export interface AudioChannelMeasurement {
  channelIndex: number;
  rmsLinear: number;
  samplePeakLinear: number;
  /** Computed from native unrounded sample predicates, not rounded dB values. */
  reachesFullScale: boolean;
  exceedsFullScale: boolean;
}

export interface AudioMeasurementReportV1 {
  version: 1;
  method: typeof AUDIO_MEASUREMENT_METHOD;
  executionId: string;
  inputUri: string;
  streamIndex: number;
  startMs: number;
  endMs: number;
  sampleRate: number;
  channelLayout: "mono" | "stereo";
  /** Measured contiguous decoded frames, checked against ceil(end*r)-ceil(start*r). */
  sampleFrames: number;
  coverageStartSample: number;
  coverageEndSample: number;
  complete: true;
  channels: AudioChannelMeasurement[];
  /**
   * Drained native SWR 4x estimate of the continuous reconstruction inside
   * the requested interval; real neighboring context may make this positive
   * even when every discrete core sample is digital zero. Not sample peak.
   */
  truePeakLinear: number;
  integratedLufs: AudioLoudnessEvidence;
  shortTermMaxLufs: AudioLoudnessEvidence;
  shortTermValidObservations: number;
}

export function validateAudioMeasurementReport(value: unknown, operation: MeasureAudioOperationV1, executionId: string): AudioMeasurementReportV1 {
  const report = object(value, ["version", "method", "executionId", "inputUri", "streamIndex", "startMs", "endMs", "sampleRate", "channelLayout", "sampleFrames", "coverageStartSample", "coverageEndSample", "complete", "channels", "truePeakLinear", "integratedLufs", "shortTermMaxLufs", "shortTermValidObservations"]);
  for (const key of ["version", "inputUri", "streamIndex", "startMs", "endMs"] as const) {
    if (report[key] !== operation[key]) invalid();
  }
  if (report.method !== AUDIO_MEASUREMENT_METHOD || report.executionId !== executionId || report.complete !== true) invalid();
  const rate = number(report.sampleRate);
  if (!(AUDIO_MEASUREMENT_RATES as readonly number[]).includes(rate)) invalid();
  const start = Math.ceil(operation.startMs * rate / 1000);
  const end = Math.ceil(operation.endMs * rate / 1000);
  const frames = end - start;
  if (frames <= 0 || report.sampleFrames !== frames || report.coverageStartSample !== start || report.coverageEndSample !== end) invalid();
  if (report.channelLayout !== "mono" && report.channelLayout !== "stereo") invalid();
  const count = report.channelLayout === "mono" ? 1 : 2;
  if (!Array.isArray(report.channels) || report.channels.length !== count) invalid();
  let silent = true;
  let maximumSamplePeak = 0;
  for (const [index, value] of report.channels.entries()) {
    const channel = object(value, ["channelIndex", "rmsLinear", "samplePeakLinear", "reachesFullScale", "exceedsFullScale"]);
    if (channel.channelIndex !== index) invalid();
    const rms = nonnegative(channel.rmsLinear);
    const peak = nonnegative(channel.samplePeakLinear);
    if (rms > peak * 1.000001 || (peak === 0) !== (rms === 0)) invalid();
    if (typeof channel.reachesFullScale !== "boolean" || typeof channel.exceedsFullScale !== "boolean" || (channel.exceedsFullScale && !channel.reachesFullScale)) invalid();
    if (peak === 0 && (channel.reachesFullScale || channel.exceedsFullScale)) invalid();
    if (channel.reachesFullScale && peak < 1 - AUDIO_MEASUREMENT_LINEAR_TOLERANCE) invalid();
    if (!channel.reachesFullScale && peak > 1 + AUDIO_MEASUREMENT_LINEAR_TOLERANCE) invalid();
    if (channel.exceedsFullScale && peak < 1 - AUDIO_MEASUREMENT_LINEAR_TOLERANCE) invalid();
    if (!channel.exceedsFullScale && peak > 1 + AUDIO_MEASUREMENT_LINEAR_TOLERANCE) invalid();
    maximumSamplePeak = Math.max(maximumSamplePeak, peak);
    silent &&= peak === 0;
  }
  const truePeak = nonnegative(report.truePeakLinear);
  if (!silent && truePeak + AUDIO_MEASUREMENT_LINEAR_TOLERANCE * Math.max(1, maximumSamplePeak) < maximumSamplePeak) invalid();
  const integrated = loudness(report.integratedLufs, true);
  const short = loudness(report.shortTermMaxLufs, false);
  const observations = nonnegative(report.shortTermValidObservations);
  if (!Number.isSafeInteger(observations) || observations > Math.max(0, Math.floor(frames / (rate / 10)) - 29)) invalid();
  if ((short.status === "available") !== (observations > 0)) invalid();
  for (const [metric, minimum] of [[integrated, rate * 0.4], [short, rate * 3]] as const) {
    if (silent) {
      if (metric.status !== "unavailable" || metric.reason !== "digital-silence") invalid();
    } else if (frames < minimum) {
      if (metric.status !== "unavailable" || metric.reason !== "insufficient-duration") invalid();
    } else if (metric.status === "unavailable" && ["digital-silence", "insufficient-duration"].includes(metric.reason)) invalid();
  }
  return structuredClone(value) as AudioMeasurementReportV1;
}

function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== fields.length || fields.some(key => !Object.hasOwn(record, key))) invalid();
  return record;
}
function invalid(): never { throw new Error("Invalid or mismatched audio measurement evidence."); }
function number(value: unknown): number { if (typeof value !== "number" || !Number.isFinite(value)) invalid(); return value; }
function nonnegative(value: unknown): number { const n = number(value); if (n < 0) invalid(); return n; }
function loudness(value: unknown, integrated: boolean): AudioLoudnessEvidence {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  if ((value as { status?: string }).status === "available") {
    const metric = object(value, ["status", "value"]);
    const n = number(metric.value);
    if (n < -200 || n > 400 || (integrated && (n <= -70 || n > 10))) invalid();
  } else {
    const metric = object(value, ["status", "reason"]);
    if (metric.status !== "unavailable" || !["digital-silence", "insufficient-duration", "no-eligible-blocks", "meter-range"].includes(String(metric.reason))) invalid();
    if (!integrated && metric.reason === "no-eligible-blocks") invalid();
  }
  return value as AudioLoudnessEvidence;
}
