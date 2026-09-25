import type {
  AlignmentExecutionIdentity,
  AlignmentExecutionIdentityProvider,
  AlignmentResult,
  EngineIdentity,
  TranscriptionExecutionIdentity,
  TranscriptionExecutionIdentityProvider,
  TranscriptionResult
} from "@cevra/contracts";
import type { TranscriptDigest } from "@cevra/project-ir";
import type {
  SourceContentIdentityPort,
  VerifiedSourceContentIdentityV1
} from "./source-technical-descriptor.js";

export const TRANSCRIPT_CACHE_KEY_VERSION = 1 as const;
export const TRANSCRIPTION_CACHE_NORMALIZATION_VERSION = "transcription-result-v1" as const;
export const ALIGNMENT_CACHE_VALIDATION_VERSION = "alignment-result-v1" as const;

export type TranscriptCachePolicy = "prefer" | "refresh" | "bypass";
export type TranscriptCacheStatus = "hit" | "miss" | "bypass" | "refresh";

export interface TranscriptSourceContentIdentityV1 {
  sha256: string;
  sizeBytes: number;
}

export interface TranscriptionCacheKey {
  schemaVersion: typeof TRANSCRIPT_CACHE_KEY_VERSION;
  kind: "transcription";
  source: TranscriptSourceContentIdentityV1;
  execution: TranscriptionExecutionIdentity;
  requestedLanguage: "auto" | "pt" | "en";
  wordTimestamps: boolean;
}

export interface AlignmentMediaPreparationIdentity {
  engineId: string;
  engineVersion: string;
  engineApiVersion: number;
  operation: "extract-audio";
  audioCodec: "pcm";
  profileVersion: "alignment-pcm-v1";
}

export interface AlignmentCacheKey {
  schemaVersion: typeof TRANSCRIPT_CACHE_KEY_VERSION;
  kind: "alignment";
  source: TranscriptSourceContentIdentityV1;
  inputTranscriptDigest: TranscriptDigest;
  language: "pt" | "en";
  execution: AlignmentExecutionIdentity;
  mediaPreparation: AlignmentMediaPreparationIdentity;
}

export type TranscriptCacheKey = TranscriptionCacheKey | AlignmentCacheKey;

export interface CachedProducerResult {
  producerExecutionId: string;
  producedAt: string;
  payload: unknown;
}

export interface TranscriptResultCache {
  read(key: TranscriptCacheKey, signal?: AbortSignal): Promise<CachedProducerResult | undefined>;
  write(
    key: TranscriptCacheKey,
    value: { producerExecutionId: string; producedAt: string; payload: TranscriptionResult | AlignmentResult },
    signal?: AbortSignal
  ): Promise<boolean>;
  invalidate(key: TranscriptCacheKey): Promise<void>;
}

export interface TranscriptSourceVerificationV1 {
  cacheIdentity: TranscriptSourceContentIdentityV1;
  verified: VerifiedSourceContentIdentityV1;
}

export async function verifyTranscriptSource(
  port: SourceContentIdentityPort,
  uri: string,
  signal?: AbortSignal
): Promise<TranscriptSourceVerificationV1> {
  const captured = await port.captureSource(uri, signal);
  const verified = await port.identifySource(uri, captured, signal);
  return {
    cacheIdentity: {
      sha256: verified.content.sha256,
      sizeBytes: verified.content.sizeBytes
    },
    verified
  };
}

export function isTranscriptionIdentityProvider(
  engine: unknown
): engine is TranscriptionExecutionIdentityProvider {
  return typeof (engine as { describeTranscriptionExecution?: unknown })?.describeTranscriptionExecution === "function";
}

export function isAlignmentIdentityProvider(
  engine: unknown
): engine is AlignmentExecutionIdentityProvider {
  return typeof (engine as { describeAlignmentExecution?: unknown })?.describeAlignmentExecution === "function";
}

export function mediaPreparationIdentity(identity: EngineIdentity): AlignmentMediaPreparationIdentity {
  return {
    engineId: identity.id,
    engineVersion: identity.version,
    engineApiVersion: identity.apiVersion,
    operation: "extract-audio",
    audioCodec: "pcm",
    profileVersion: "alignment-pcm-v1"
  };
}
