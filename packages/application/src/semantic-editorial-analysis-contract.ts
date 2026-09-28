import type { ExecutionContext } from "@cevra/contracts";
import { translate, type CevraLocale, type TranslationKey } from "@cevra/i18n";
import type { TranscriptDigest, TranscriptWordTiming } from "@cevra/project-ir";

export const SEMANTIC_EDITORIAL_ANALYSIS_VERSION = 1 as const;
export const SEMANTIC_EDITORIAL_ANALYSIS_PROFILE = "cevra.semantic-editorial-analysis.v1" as const;
export const SEMANTIC_EDITORIAL_CONTEXT_PROFILE = "cevra.semantic-editorial-context.v1" as const;
export const DEFAULT_SEMANTIC_ANALYSIS_INITIAL_BYTES = 64 * 1024;
export const MAX_SEMANTIC_ANALYSIS_TOTAL_EVIDENCE_BYTES = 256 * 1024;
export const DEFAULT_SEMANTIC_ANALYSIS_RESPONSE_BYTES = 64 * 1024;
export const MAX_SEMANTIC_ANALYSIS_INVOCATIONS = 2 as const;

export type SemanticEditorialAnalysisErrorCode =
  | "SEMANTIC_ANALYSIS_INVALID_REQUEST"
  | "SEMANTIC_ANALYSIS_INVALID_OUTPUT"
  | "SEMANTIC_ANALYSIS_INVALID_EVIDENCE"
  | "SEMANTIC_ANALYSIS_STALE"
  | "SEMANTIC_ANALYSIS_CANCELLED"
  | "SEMANTIC_ANALYSIS_TIMEOUT"
  | "SEMANTIC_ANALYSIS_ANALYZER_UNAVAILABLE"
  | "SEMANTIC_ANALYSIS_CONTEXT_LIMIT"
  | "SEMANTIC_ANALYSIS_NO_PROGRESS";

const ERROR_KEYS: Readonly<Record<SemanticEditorialAnalysisErrorCode, TranslationKey>> = {
  SEMANTIC_ANALYSIS_INVALID_REQUEST: "semanticAnalysis.error.invalidRequest",
  SEMANTIC_ANALYSIS_INVALID_OUTPUT: "semanticAnalysis.error.invalidOutput",
  SEMANTIC_ANALYSIS_INVALID_EVIDENCE: "semanticAnalysis.error.invalidEvidence",
  SEMANTIC_ANALYSIS_STALE: "semanticAnalysis.error.stale",
  SEMANTIC_ANALYSIS_CANCELLED: "semanticAnalysis.error.cancelled",
  SEMANTIC_ANALYSIS_TIMEOUT: "semanticAnalysis.error.timeout",
  SEMANTIC_ANALYSIS_ANALYZER_UNAVAILABLE: "semanticAnalysis.error.analyzerUnavailable",
  SEMANTIC_ANALYSIS_CONTEXT_LIMIT: "semanticAnalysis.error.contextLimit",
  SEMANTIC_ANALYSIS_NO_PROGRESS: "semanticAnalysis.error.noProgress"
};

export class SemanticEditorialAnalysisError extends Error {
  readonly cause: unknown;

  constructor(
    readonly code: SemanticEditorialAnalysisErrorCode,
    readonly locale: CevraLocale,
    readonly executionId: string,
    cause?: unknown
  ) {
    super(translate(locale, ERROR_KEYS[code]));
    this.name = "SemanticEditorialAnalysisError";
    this.cause = cause;
  }
}

export type SemanticEditorialAnalysisFocus =
  | "themes"
  | "relationships"
  | "delivery-signals"
  | "caveats";

export interface SemanticEditorialAnalysisRequest {
  id?: string;
  sourceIds: readonly string[];
  locale?: CevraLocale;
  brief?: string;
  focus?: readonly SemanticEditorialAnalysisFocus[];
}

export interface SemanticEditorialAnalyzerIdentity {
  adapterId: string;
  adapterVersion: string;
  modelId?: string;
  modelRevision?: string;
}

export interface SemanticEditorialAnalyzerInvocation {
  version: typeof SEMANTIC_EDITORIAL_ANALYSIS_VERSION;
  contentType: "application/json";
  payload: string;
  payloadBytes: number;
}

export interface SemanticEditorialAnalyzerExecutionContext extends ExecutionContext {
  invocation: 1 | 2;
  contextId: string;
}

/**
 * Specialized provider-neutral analysis boundary. Implementations receive only
 * the serialized, bounded semantic envelope and execution lifecycle state.
 */
export interface SemanticEditorialAnalyzerPort {
  analyze(
    invocation: Readonly<SemanticEditorialAnalyzerInvocation>,
    context: Readonly<SemanticEditorialAnalyzerExecutionContext>
  ): Promise<string>;
}

export type SemanticEditorialSourceEvidenceStatus =
  | "available"
  | "transcript-unavailable"
  | "no-speech";

export interface SemanticEditorialContextSourceV1 {
  reference: string;
  evidenceStatus: SemanticEditorialSourceEvidenceStatus;
}

export interface SemanticEditorialContextEvidenceV1 {
  reference: string;
  sourceReference: string;
  startMs: number;
  endMs: number;
  timingBasis: TranscriptWordTiming;
  text: string;
  continuation: "complete" | "from-previous" | "to-next" | "middle";
}

export interface SemanticEditorialCoverageV1 {
  status: "complete" | "partial";
  requestedSourceReferences: readonly string[];
  providedEvidenceReferences: readonly string[];
  transcriptUnavailableSourceReferences: readonly string[];
  noSpeechSourceReferences: readonly string[];
  sourcesWithRemainingEvidence: readonly string[];
}

export interface AnalysisContextV1 {
  version: typeof SEMANTIC_EDITORIAL_ANALYSIS_VERSION;
  profile: typeof SEMANTIC_EDITORIAL_CONTEXT_PROFILE;
  contextId: string;
  sources: readonly SemanticEditorialContextSourceV1[];
  evidence: readonly SemanticEditorialContextEvidenceV1[];
  coverage: SemanticEditorialCoverageV1;
  limitations: readonly string[];
}

export interface SemanticEditorialAnalyzerEnvelopeV1 {
  version: typeof SEMANTIC_EDITORIAL_ANALYSIS_VERSION;
  profile: typeof SEMANTIC_EDITORIAL_ANALYSIS_PROFILE;
  execution: {
    executionId: string;
    contextId: string;
    invocation: 1 | 2;
  };
  task: {
    kind: "transcript-semantic-analysis";
    locale: CevraLocale;
    brief?: string;
    focus: readonly SemanticEditorialAnalysisFocus[];
    constraints: {
      evidenceOnly: true;
      noCommands: true;
      noRanking: true;
      textOnly: true;
    };
  };
  context: AnalysisContextV1;
}

export type SemanticEditorialObservationKind =
  | "theme"
  | "idea"
  | "caveat"
  | "possible-false-start"
  | "possible-repetition";

export type SemanticEditorialRelationKind =
  | "possible-equivalence"
  | "complement"
  | "possible-contradiction";

export type SemanticEditorialUncertainty = "low" | "material" | "high";

export interface AnalyzerObservationV1 {
  id: string;
  kind: SemanticEditorialObservationKind;
  statement: string;
  uncertainty: SemanticEditorialUncertainty;
  justification: string;
  evidenceReferences: readonly string[];
  quote?: string;
}

export interface AnalyzerRelationV1 {
  id: string;
  kind: SemanticEditorialRelationKind;
  statement: string;
  uncertainty: SemanticEditorialUncertainty;
  justification: string;
  leftEvidenceReferences: readonly string[];
  rightEvidenceReferences: readonly string[];
}

export interface AnalyzerUncertaintyV1 {
  statement: string;
  reason: string;
  evidenceReferences?: readonly string[];
}

export interface AnalyzerAnalysisCandidateV1 {
  version: typeof SEMANTIC_EDITORIAL_ANALYSIS_VERSION;
  kind: "analysis-candidate";
  contextId: string;
  observations: readonly AnalyzerObservationV1[];
  relations: readonly AnalyzerRelationV1[];
  uncertainties: readonly AnalyzerUncertaintyV1[];
  limitations: readonly string[];
}

export type AnalyzerEvidenceRequestV1 =
  | {
      type: "text-context";
      sourceReference: string;
      afterEvidenceReference?: string;
      maxAdditionalBytes: number;
      reason: string;
    }
  | {
      type: "visual" | "acoustic";
      sourceReference: string;
      reason: string;
    };

export interface AnalyzerNeedsEvidenceV1 {
  version: typeof SEMANTIC_EDITORIAL_ANALYSIS_VERSION;
  kind: "needs-evidence";
  contextId: string;
  request: AnalyzerEvidenceRequestV1;
}

export type SemanticEditorialAnalyzerOutputV1 = AnalyzerAnalysisCandidateV1 | AnalyzerNeedsEvidenceV1;

export interface SemanticEditorialCanonicalEvidenceV1 {
  reference: string;
  sourceId: string;
  transcriptDigest: TranscriptDigest;
  startMs: number;
  endMs: number;
  timingBasis: TranscriptWordTiming;
  basis: "words" | "segments";
  wordIds: readonly string[];
  segmentId?: string;
  text: string;
}

export interface SemanticEditorialAnalysisBindingV1 {
  projectId: string;
  projectRevision: number;
  projectSnapshotId?: string;
  journalEntryCount: number;
  sourceTranscripts: ReadonlyArray<{
    sourceId: string;
    transcriptDigest?: TranscriptDigest;
  }>;
  projectionProfile: string;
  analysisProfile: typeof SEMANTIC_EDITORIAL_ANALYSIS_PROFILE;
}

export interface SemanticEditorialOperationalProvenanceV1 {
  analyzer?: SemanticEditorialAnalyzerIdentity;
  invocationCount: 0 | 1 | 2;
  requestBytes: readonly number[];
  responseBytes: readonly number[];
}

export interface SemanticEditorialAnalysisCandidateV1 {
  version: typeof SEMANTIC_EDITORIAL_ANALYSIS_VERSION;
  profile: typeof SEMANTIC_EDITORIAL_ANALYSIS_PROFILE;
  kind: "analysis-candidate";
  executionId: string;
  contextId: string;
  binding: SemanticEditorialAnalysisBindingV1;
  coverage: SemanticEditorialCoverageV1;
  evidence: readonly SemanticEditorialCanonicalEvidenceV1[];
  candidate: AnalyzerAnalysisCandidateV1;
  provenance: SemanticEditorialOperationalProvenanceV1;
}

export type SemanticEditorialNeedsEvidenceReason =
  | "transcript-unavailable"
  | "no-speech"
  | "unsupported-evidence"
  | "context-limit"
  | "invocation-limit";

export interface SemanticEditorialNeedsEvidenceResultV1 {
  version: typeof SEMANTIC_EDITORIAL_ANALYSIS_VERSION;
  profile: typeof SEMANTIC_EDITORIAL_ANALYSIS_PROFILE;
  kind: "needs-evidence";
  executionId: string;
  contextId: string;
  reason: SemanticEditorialNeedsEvidenceReason;
  binding: SemanticEditorialAnalysisBindingV1;
  coverage: SemanticEditorialCoverageV1;
  evidence: readonly SemanticEditorialCanonicalEvidenceV1[];
  requestedEvidence?: AnalyzerEvidenceRequestV1;
  provenance: SemanticEditorialOperationalProvenanceV1;
}

export type SemanticEditorialAnalysisResultV1 =
  | SemanticEditorialAnalysisCandidateV1
  | SemanticEditorialNeedsEvidenceResultV1;

export interface SemanticEditorialResponseValidationLimits {
  maxObservations: number;
  maxRelations: number;
  maxUncertainties: number;
  maxLimitations: number;
  maxReferencesPerItem: number;
}

export const DEFAULT_SEMANTIC_RESPONSE_LIMITS: SemanticEditorialResponseValidationLimits = {
  maxObservations: 64,
  maxRelations: 32,
  maxUncertainties: 32,
  maxLimitations: 32,
  maxReferencesPerItem: 8
};

export function parseSemanticEditorialAnalyzerOutput(
  payload: string,
  limits: SemanticEditorialResponseValidationLimits = DEFAULT_SEMANTIC_RESPONSE_LIMITS
): SemanticEditorialAnalyzerOutputV1 {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch (cause) {
    throw new Error("Analyzer output is not valid JSON.", { cause });
  }
  if (!isRecord(value)) throw new Error("Analyzer output must be an object.");
  if (value.version !== SEMANTIC_EDITORIAL_ANALYSIS_VERSION) throw new Error("Analyzer output version is unsupported.");
  if (value.kind === "analysis-candidate") return validateCandidate(value, limits);
  if (value.kind === "needs-evidence") return validateNeedsEvidence(value);
  throw new Error("Analyzer output kind is unsupported.");
}

function validateCandidate(
  value: Record<string, unknown>,
  limits: SemanticEditorialResponseValidationLimits
): AnalyzerAnalysisCandidateV1 {
  rejectUnexpected(value, ["version", "kind", "contextId", "observations", "relations", "uncertainties", "limitations"], "analysis candidate");
  const observations = boundedArray(value.observations, limits.maxObservations, "observations").map((item) => validateObservation(item, limits));
  const relations = boundedArray(value.relations, limits.maxRelations, "relations").map((item) => validateRelation(item, limits));
  const uncertainties = boundedArray(value.uncertainties, limits.maxUncertainties, "uncertainties").map((item) => validateUncertainty(item, limits));
  const limitations = boundedArray(value.limitations, limits.maxLimitations, "limitations").map((item) => boundedText(item, 1, 2_000, "limitation"));
  assertUniqueIds([...observations, ...relations]);
  return {
    version: SEMANTIC_EDITORIAL_ANALYSIS_VERSION,
    kind: "analysis-candidate",
    contextId: boundedId(value.contextId, "contextId"),
    observations,
    relations,
    uncertainties,
    limitations
  };
}

function validateObservation(value: unknown, limits: SemanticEditorialResponseValidationLimits): AnalyzerObservationV1 {
  if (!isRecord(value)) throw new Error("Observation must be an object.");
  rejectUnexpected(value, ["id", "kind", "statement", "uncertainty", "justification", "evidenceReferences", "quote"], "observation");
  if (!["theme", "idea", "caveat", "possible-false-start", "possible-repetition"].includes(String(value.kind))) {
    throw new Error("Observation kind is unsupported.");
  }
  const evidenceReferences = referenceArray(value.evidenceReferences, limits.maxReferencesPerItem, "observation evidenceReferences");
  if (evidenceReferences.length === 0) throw new Error("Every observation requires evidence.");
  const quote = value.quote === undefined ? undefined : boundedText(value.quote, 1, 2_000, "observation quote");
  return {
    id: boundedId(value.id, "observation id"),
    kind: value.kind as SemanticEditorialObservationKind,
    statement: boundedText(value.statement, 1, 4_000, "observation statement"),
    uncertainty: uncertainty(value.uncertainty),
    justification: boundedText(value.justification, 1, 4_000, "observation justification"),
    evidenceReferences,
    ...(quote === undefined ? {} : { quote })
  };
}

function validateRelation(value: unknown, limits: SemanticEditorialResponseValidationLimits): AnalyzerRelationV1 {
  if (!isRecord(value)) throw new Error("Relation must be an object.");
  rejectUnexpected(value, ["id", "kind", "statement", "uncertainty", "justification", "leftEvidenceReferences", "rightEvidenceReferences"], "relation");
  if (!["possible-equivalence", "complement", "possible-contradiction"].includes(String(value.kind))) {
    throw new Error("Relation kind is unsupported.");
  }
  const leftEvidenceReferences = referenceArray(value.leftEvidenceReferences, limits.maxReferencesPerItem, "relation leftEvidenceReferences");
  const rightEvidenceReferences = referenceArray(value.rightEvidenceReferences, limits.maxReferencesPerItem, "relation rightEvidenceReferences");
  if (leftEvidenceReferences.length === 0 || rightEvidenceReferences.length === 0) {
    throw new Error("Every relation requires evidence on both sides.");
  }
  if (new Set([...leftEvidenceReferences, ...rightEvidenceReferences]).size < 2) {
    throw new Error("A relation must connect distinct evidence fragments.");
  }
  return {
    id: boundedId(value.id, "relation id"),
    kind: value.kind as SemanticEditorialRelationKind,
    statement: boundedText(value.statement, 1, 4_000, "relation statement"),
    uncertainty: uncertainty(value.uncertainty),
    justification: boundedText(value.justification, 1, 4_000, "relation justification"),
    leftEvidenceReferences,
    rightEvidenceReferences
  };
}

function validateUncertainty(value: unknown, limits: SemanticEditorialResponseValidationLimits): AnalyzerUncertaintyV1 {
  if (!isRecord(value)) throw new Error("Uncertainty must be an object.");
  rejectUnexpected(value, ["statement", "reason", "evidenceReferences"], "uncertainty");
  const evidenceReferences = value.evidenceReferences === undefined
    ? undefined
    : referenceArray(value.evidenceReferences, limits.maxReferencesPerItem, "uncertainty evidenceReferences");
  return {
    statement: boundedText(value.statement, 1, 4_000, "uncertainty statement"),
    reason: boundedText(value.reason, 1, 4_000, "uncertainty reason"),
    ...(evidenceReferences === undefined ? {} : { evidenceReferences })
  };
}

function validateNeedsEvidence(value: Record<string, unknown>): AnalyzerNeedsEvidenceV1 {
  rejectUnexpected(value, ["version", "kind", "contextId", "request"], "needs-evidence result");
  if (!isRecord(value.request)) throw new Error("Evidence request must be an object.");
  const request = value.request;
  if (request.type === "text-context") {
    rejectUnexpected(request, ["type", "sourceReference", "afterEvidenceReference", "maxAdditionalBytes", "reason"], "text evidence request");
    if (!Number.isSafeInteger(request.maxAdditionalBytes) || (request.maxAdditionalBytes as number) < 1 || (request.maxAdditionalBytes as number) > DEFAULT_SEMANTIC_ANALYSIS_INITIAL_BYTES) {
      throw new Error("Evidence request maxAdditionalBytes is invalid.");
    }
    return {
      version: SEMANTIC_EDITORIAL_ANALYSIS_VERSION,
      kind: "needs-evidence",
      contextId: boundedId(value.contextId, "contextId"),
      request: {
        type: "text-context",
        sourceReference: boundedReference(request.sourceReference, "sourceReference"),
        ...(request.afterEvidenceReference === undefined ? {} : { afterEvidenceReference: boundedReference(request.afterEvidenceReference, "afterEvidenceReference") }),
        maxAdditionalBytes: request.maxAdditionalBytes as number,
        reason: boundedText(request.reason, 1, 2_000, "evidence reason")
      }
    };
  }
  if (request.type === "visual" || request.type === "acoustic") {
    rejectUnexpected(request, ["type", "sourceReference", "reason"], "unsupported evidence request");
    return {
      version: SEMANTIC_EDITORIAL_ANALYSIS_VERSION,
      kind: "needs-evidence",
      contextId: boundedId(value.contextId, "contextId"),
      request: {
        type: request.type,
        sourceReference: boundedReference(request.sourceReference, "sourceReference"),
        reason: boundedText(request.reason, 1, 2_000, "evidence reason")
      }
    };
  }
  throw new Error("Evidence request type is unsupported.");
}

function boundedArray(value: unknown, max: number, field: string): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${field} must be an array with at most ${max} entries.`);
  return value;
}

function referenceArray(value: unknown, max: number, field: string): string[] {
  const references = boundedArray(value, max, field).map((item) => boundedReference(item, field));
  if (new Set(references).size !== references.length) throw new Error(`${field} contains duplicate references.`);
  return references;
}

function boundedReference(value: unknown, field: string): string {
  const reference = boundedText(value, 1, 64, field);
  if (!/^[A-Z][1-9][0-9]*$/u.test(reference)) throw new Error(`${field} is not a context-local reference.`);
  return reference;
}

function boundedId(value: unknown, field: string): string {
  const id = boundedText(value, 1, 128, field);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(id)) throw new Error(`${field} is invalid.`);
  return id;
}

function boundedText(value: unknown, min: number, max: number, field: string): string {
  if (typeof value !== "string" || value.length < min || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    throw new Error(`${field} is invalid.`);
  }
  return value;
}

function uncertainty(value: unknown): SemanticEditorialUncertainty {
  if (value !== "low" && value !== "material" && value !== "high") throw new Error("Uncertainty category is invalid.");
  return value;
}

function assertUniqueIds(items: ReadonlyArray<{ id: string }>): void {
  const ids = items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error("Analyzer item IDs must be unique.");
}

function rejectUnexpected(value: Record<string, unknown>, allowed: readonly string[], field: string): void {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length > 0) throw new Error(`${field} contains unexpected fields: ${extras.join(", ")}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
