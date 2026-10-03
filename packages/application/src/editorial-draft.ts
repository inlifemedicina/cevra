import { translate, type CevraLocale, type TranslationKey } from "@cevra/i18n";
import type { ProjectHistory, ProjectIR, TranscriptDigest, TranscriptWordTiming } from "@cevra/project-ir";
import { EDITORIAL_TRANSCRIPT_PROJECTION_PROFILE } from "./editorial-transcript-projection.js";
import { normalizeStandaloneText, renderTokenText } from "./editorial-transcript-text.js";
import {
  parseSemanticEditorialAnalyzerOutput, SEMANTIC_EDITORIAL_ANALYSIS_PROFILE,
  validateSemanticEditorialIdentifier,
  type SemanticEditorialAnalysisCandidateV1, type SemanticEditorialAnalysisBindingV1
} from "./semantic-editorial-analysis-contract.js";

export const EDITORIAL_DRAFT_PROFILE = "cevra.editorial-draft.v1" as const;
export type EditorialDraftErrorCode = "EDITORIAL_DRAFT_INVALID" | "EDITORIAL_DRAFT_STALE";
export class EditorialDraftError extends Error {
  constructor(readonly code: EditorialDraftErrorCode, readonly locale: CevraLocale) {
    super(translate(locale, code === "EDITORIAL_DRAFT_STALE" ? "editorialDraft.error.stale" : "editorialDraft.error.invalid"));
    this.name = "EditorialDraftError";
  }
}

/** A caller-supplied assessment, preserved verbatim; never inferred from valid JSON. */
export interface EditorialAnalysisReview {
  citationSupport: "PASS" | "PARTIAL" | "UNKNOWN";
  notes: readonly string[];
  priorChecks: ReadonlyArray<{ id: string; outcome: "PASS" | "PARTIAL" | "FAIL" | "UNKNOWN"; detail: string }>;
}
export interface EditorialDraftEvidence {
  reference: string;
  sourceId: string;
  transcriptDigest: TranscriptDigest;
  timingBasis: TranscriptWordTiming;
  basis: "words" | "segments";
  wordIds: readonly string[];
  segmentId?: string;
  text: string;
}
export interface EditorialDraftBlock {
  id: string;
  title: string;
  userNote: string;
  observationId: string;
  evidenceReferences: readonly string[];
}
export interface EditorialDraftV1 {
  version: 1;
  profile: typeof EDITORIAL_DRAFT_PROFILE;
  kind: "editorial-draft";
  id: string;
  revision: number;
  locale: CevraLocale;
  title: string;
  reviewState: "review-required";
  orderBasis: "analysis-observation-order" | "user-order";
  blocks: readonly EditorialDraftBlock[];
  evidence: readonly EditorialDraftEvidence[];
  /** Original assertions, relationships, uncertainties and limitations are not editable. */
  analysis: Omit<SemanticEditorialAnalysisCandidateV1, "evidence">;
  analysisReview: EditorialAnalysisReview;
  caveatObservationIds: readonly string[];
  limitations: readonly string[];
}
export interface CreateEditorialDraftRequest {
  id: string;
  analysis: SemanticEditorialAnalysisCandidateV1;
  analysisReview: EditorialAnalysisReview;
  locale?: CevraLocale;
  title?: string;
}
export interface ReviseEditorialDraftRequest {
  expectedRevision: number;
  title?: string;
  blockOrder?: readonly string[];
  blockEdits?: ReadonlyArray<{ blockId: string; title?: string; userNote?: string }>;
}

/** Presentation availability; the draft remains a service-owned derived proposal. */
export type EditorialDraftState =
  | { readonly status: "empty" | "stale" }
  | { readonly status: "current"; readonly draft: EditorialDraftV1 };

/** Offline, process-local proposal projection. No adapter, engine, command or persistence port. */
export class EditorialDraftService {
  private readonly records = new WeakMap<EditorialDraftV1, { latest: EditorialDraftV1; journal: string }>();
  private readonly analysisJournals = new Map<string, string>();
  constructor(private readonly history: ProjectHistory) {}

  create(request: CreateEditorialDraftRequest): EditorialDraftV1 {
    const locale = request?.locale ?? this.history.current.project.defaultLocale;
    assertLocale(locale);
    try {
      const input = capture(request);
      closed(input, ["id", "analysis", "analysisReview", "locale", "title"]);
      id(input.id);
      if (input.locale !== undefined && input.locale !== locale) throw new Error();
      const analysis = validateAnalysis(input.analysis, this.history.current, (binding) => this.assertBinding(binding, locale));
      const journal = journalIdentity(this.history);
      const analysisKey = JSON.stringify([analysis.executionId, analysis.contextId]);
      const priorJournal = this.analysisJournals.get(analysisKey);
      if (priorJournal !== undefined && priorJournal !== journal) throw new EditorialDraftError("EDITORIAL_DRAFT_STALE", locale);
      const analysisReview = validateReview(input.analysisReview);
      const draft: EditorialDraftV1 = {
        version: 1, profile: EDITORIAL_DRAFT_PROFILE, kind: "editorial-draft",
        id: input.id, revision: 0, locale,
        title: input.title === undefined ? translate(locale, "editorialDraft.title") : text(input.title, 200),
        reviewState: "review-required", orderBasis: "analysis-observation-order",
        blocks: analysis.candidate.observations.map((observation) => ({
          id: observation.id, observationId: observation.id,
          title: translate(locale, `editorialDraft.block.${observation.kind}` as TranslationKey),
          userNote: "", evidenceReferences: [...observation.evidenceReferences]
        })),
        evidence: analysis.evidence.map(({ startMs: _start, endMs: _end, ...evidence }) => evidence),
        analysis: (({ evidence: _evidence, ...original }) => original)(analysis),
        analysisReview,
        caveatObservationIds: analysis.candidate.observations.filter((item) => item.kind === "caveat").map((item) => item.id),
        limitations: [
          ...analysis.candidate.limitations,
          translate(locale, "editorialDraft.limit.proposal"),
          translate(locale, "editorialDraft.limit.order"),
          translate(locale, "editorialDraft.limit.timing")
        ]
      };
      this.assertBinding(draft.analysis.binding, locale);
      freeze(draft);
      this.records.set(draft, { latest: draft, journal });
      this.analysisJournals.set(analysisKey, journal);
      return draft;
    } catch (error) { throw normalize(error, locale); }
  }

  /** Throws for project/transcript changes, commit→undo or a superseded draft revision. */
  assertCurrent(draft: EditorialDraftV1): void {
    const record = this.records.get(draft);
    if (!record) throw new EditorialDraftError("EDITORIAL_DRAFT_INVALID", "en-US");
    if (record.latest !== draft || record.journal !== journalIdentity(this.history)) throw new EditorialDraftError("EDITORIAL_DRAFT_STALE", draft.locale);
    this.assertBinding(draft.analysis.binding, draft.locale);
  }

  revise(draft: EditorialDraftV1, request: ReviseEditorialDraftRequest): EditorialDraftV1 {
    this.assertCurrent(draft);
    try {
      const input = capture(request);
      closed(input, ["expectedRevision", "title", "blockOrder", "blockEdits"]);
      if (!integer(input.expectedRevision) || input.expectedRevision !== draft.revision) {
        throw new EditorialDraftError("EDITORIAL_DRAFT_STALE", draft.locale);
      }
      const blocks = draft.blocks.map((block) => ({ ...block }));
      if (input.blockEdits !== undefined) {
        array(input.blockEdits, blocks.length);
        const edited = new Set<string>();
        for (const edit of input.blockEdits) {
          closed(edit, ["blockId", "title", "userNote"]);
          const block = blocks.find((item) => item.id === edit.blockId);
          if (!block || edited.has(edit.blockId)) throw new Error();
          edited.add(edit.blockId);
          if (edit.title !== undefined) block.title = text(edit.title, 200);
          if (edit.userNote !== undefined) block.userNote = text(edit.userNote, 2000, true);
        }
      }
      let ordered = blocks;
      if (input.blockOrder !== undefined) {
        array(input.blockOrder, blocks.length);
        if (input.blockOrder.length !== blocks.length || new Set(input.blockOrder).size !== blocks.length) throw new Error();
        ordered = input.blockOrder.map((blockId) => {
          const block = blocks.find((item) => item.id === blockId);
          if (!block) throw new Error();
          return block;
        });
      }
      const title = input.title === undefined ? draft.title : text(input.title, 200);
      if (title === draft.title && JSON.stringify(ordered) === JSON.stringify(draft.blocks)) return draft;
      const next: EditorialDraftV1 = {
        ...draft, title, blocks: ordered, revision: draft.revision + 1,
        orderBasis: input.blockOrder === undefined ? draft.orderBasis : "user-order"
      };
      this.assertBinding(draft.analysis.binding, draft.locale);
      freeze(next);
      const record = this.records.get(draft)!;
      record.latest = next;
      this.records.set(next, record);
      return next;
    } catch (error) { throw normalize(error, draft.locale); }
  }

  private assertBinding(binding: SemanticEditorialAnalysisBindingV1, locale: CevraLocale): void {
    const current = this.history.current;
    const transcripts = new Map(current.sourceTranscripts.map((item) => [item.sourceId, item.transcriptDigest]));
    const sources = new Set(current.sources.map((source) => source.id));
    if (current.project.id !== binding.projectId || current.history.revision !== binding.projectRevision
      || current.history.headSnapshotId !== binding.projectSnapshotId || this.history.entries.length !== binding.journalEntryCount
      || binding.sourceTranscripts.some((item) => !sources.has(item.sourceId) || transcripts.get(item.sourceId) !== item.transcriptDigest)) {
      throw new EditorialDraftError("EDITORIAL_DRAFT_STALE", locale);
    }
  }
}

function validateAnalysis(value: SemanticEditorialAnalysisCandidateV1, project: ProjectIR, assertCurrent: (binding: SemanticEditorialAnalysisBindingV1) => void): SemanticEditorialAnalysisCandidateV1 {
  closed(value, ["version", "profile", "kind", "executionId", "contextId", "binding", "coverage", "evidence", "candidate", "provenance"]);
  if (value.version !== 1 || value.profile !== SEMANTIC_EDITORIAL_ANALYSIS_PROFILE || value.kind !== "analysis-candidate") throw new Error();
  id(value.executionId); id(value.contextId);
  const candidate = parseSemanticEditorialAnalyzerOutput(JSON.stringify(value.candidate));
  if (candidate.kind !== "analysis-candidate" || candidate.contextId !== value.contextId || candidate.observations.length === 0) throw new Error();
  const binding = value.binding;
  closed(binding, ["projectId", "projectRevision", "projectSnapshotId", "journalEntryCount", "sourceTranscripts", "projectionProfile", "analysisProfile"]);
  id(binding.projectId); if (binding.projectSnapshotId !== undefined) id(binding.projectSnapshotId);
  if (!integer(binding.projectRevision) || !integer(binding.journalEntryCount)
    || binding.projectionProfile !== EDITORIAL_TRANSCRIPT_PROJECTION_PROFILE || binding.analysisProfile !== SEMANTIC_EDITORIAL_ANALYSIS_PROFILE) throw new Error();
  array(binding.sourceTranscripts, 128);
  const sourceIds = new Set<string>();
  for (const source of binding.sourceTranscripts) {
    closed(source, ["sourceId", "transcriptDigest"]); id(source.sourceId);
    if (sourceIds.has(source.sourceId)) throw new Error();
    sourceIds.add(source.sourceId);
  }
  assertCurrent(binding);
  const coverage = value.coverage;
  closed(coverage, ["status", "requestedSourceReferences", "providedEvidenceReferences", "transcriptUnavailableSourceReferences", "noSpeechSourceReferences", "sourcesWithRemainingEvidence"]);
  if (coverage.status !== "complete" && coverage.status !== "partial") throw new Error();
  for (const refs of [coverage.requestedSourceReferences, coverage.providedEvidenceReferences, coverage.transcriptUnavailableSourceReferences, coverage.noSpeechSourceReferences, coverage.sourcesWithRemainingEvidence]) uniqueIds(refs, 8192);
  if (JSON.stringify(coverage.requestedSourceReferences) !== JSON.stringify(binding.sourceTranscripts.map((_, i) => `S${i + 1}`))) throw new Error();
  for (const refs of [coverage.transcriptUnavailableSourceReferences, coverage.noSpeechSourceReferences, coverage.sourcesWithRemainingEvidence]) {
    if (refs.some((ref) => !coverage.requestedSourceReferences.includes(ref))) throw new Error();
  }
  if (coverage.status === "complete" && (coverage.sourcesWithRemainingEvidence.length !== 0 || coverage.transcriptUnavailableSourceReferences.length !== 0)) throw new Error();
  array(value.evidence, 8192);
  const byReference = new Map<string, (typeof value.evidence)[number]>();
  for (const evidence of value.evidence) {
    closed(evidence, ["reference", "sourceId", "transcriptDigest", "startMs", "endMs", "timingBasis", "basis", "wordIds", "segmentId", "text"]);
    id(evidence.reference); id(evidence.sourceId); text(evidence.text, 256 * 1024);
    if (byReference.has(evidence.reference) || !sourceIds.has(evidence.sourceId)) throw new Error();
    const transcript = project.sourceTranscripts.find((item) => item.sourceId === evidence.sourceId);
    if (!transcript || transcript.transcriptDigest !== evidence.transcriptDigest || transcript.wordTiming !== evidence.timingBasis
      || binding.sourceTranscripts.find((item) => item.sourceId === evidence.sourceId)?.transcriptDigest !== evidence.transcriptDigest) throw new Error();
    uniqueIds(evidence.wordIds, 8192);
    if (evidence.basis === "segments") {
      const segment = transcript.transcript.segments.find((item) => item.id === evidence.segmentId);
      if (!segment || !normalizeStandaloneText(segment.text).includes(evidence.text) || evidence.startMs !== segment.startMs || evidence.endMs !== segment.endMs
        || evidence.wordIds.some((wordId) => !segment.wordIds.includes(wordId))) throw new Error();
    } else if (evidence.basis === "words") {
      const words = transcript.transcript.words;
      const start = words.findIndex((word) => word.id === evidence.wordIds[0]);
      const selected = words.slice(start, start + evidence.wordIds.length);
      if (start < 0 || selected.length === 0 || selected.some((word, i) => word.id !== evidence.wordIds[i])
        || renderTokenText(selected.map((word) => word.text)) !== evidence.text
        || evidence.startMs !== selected[0]!.startMs || evidence.endMs !== selected.at(-1)!.endMs || evidence.segmentId !== undefined) throw new Error();
    } else throw new Error();
    byReference.set(evidence.reference, evidence);
  }
  if (JSON.stringify([...byReference.keys()]) !== JSON.stringify(coverage.providedEvidenceReferences)) throw new Error();
  for (const [index, source] of binding.sourceTranscripts.entries()) {
    const reference = `S${index + 1}`;
    const transcript = project.sourceTranscripts.find((item) => item.sourceId === source.sourceId);
    // Match the projector's source status without repaginating its evidence.
    const available = transcript !== undefined && (transcript.transcript.words.length > 0 || transcript.transcript.segments.length > 0);
    if (coverage.transcriptUnavailableSourceReferences.includes(reference) !== (transcript === undefined)
      || coverage.noSpeechSourceReferences.includes(reference) !== (transcript !== undefined && !available)
      || (coverage.sourcesWithRemainingEvidence.includes(reference) && !available)
      || (available && !value.evidence.some((item) => item.sourceId === source.sourceId)
        && !coverage.sourcesWithRemainingEvidence.includes(reference))) throw new Error();
  }
  const references = (refs: readonly string[]) => refs.map((ref) => {
    const evidence = byReference.get(ref); if (!evidence) throw new Error(); return evidence;
  });
  for (const observation of candidate.observations) {
    const evidence = references(observation.evidenceReferences);
    if (observation.quote !== undefined && !evidence.some((item) => item.text.includes(observation.quote!))) throw new Error();
  }
  for (const relation of candidate.relations) { references(relation.leftEvidenceReferences); references(relation.rightEvidenceReferences); }
  for (const uncertainty of candidate.uncertainties) references(uncertainty.evidenceReferences ?? []);
  const provenance = value.provenance;
  closed(provenance, ["analyzer", "invocationCount", "requestBytes", "responseBytes"]);
  if (provenance.invocationCount !== 1 && provenance.invocationCount !== 2) throw new Error();
  for (const bytes of [provenance.requestBytes, provenance.responseBytes]) {
    array(bytes, 2); if (bytes.length !== provenance.invocationCount || bytes.some((size) => !integer(size))) throw new Error();
  }
  if (provenance.analyzer !== undefined) {
    closed(provenance.analyzer, ["adapterId", "adapterVersion", "modelId", "modelRevision"]);
    for (const field of Object.values(provenance.analyzer)) text(field, 256);
    text(provenance.analyzer.adapterId, 256); text(provenance.analyzer.adapterVersion, 256);
  }
  return { ...value, candidate };
}

function validateReview(review: EditorialAnalysisReview): EditorialAnalysisReview {
  closed(review, ["citationSupport", "notes", "priorChecks"]);
  if (!["PASS", "PARTIAL", "UNKNOWN"].includes(review.citationSupport)) throw new Error();
  array(review.notes, 32); for (const note of review.notes) text(note, 2000);
  array(review.priorChecks, 32); const checks = new Set<string>();
  for (const check of review.priorChecks) {
    closed(check, ["id", "outcome", "detail"]); id(check.id); text(check.detail, 2000);
    if (checks.has(check.id) || !["PASS", "PARTIAL", "FAIL", "UNKNOWN"].includes(check.outcome)) throw new Error();
    checks.add(check.id);
  }
  return review;
}
function capture<T>(value: T): T {
  const json = JSON.stringify(value);
  if (typeof json !== "string" || new TextEncoder().encode(json).length > 512 * 1024) throw new Error();
  return JSON.parse(json) as T;
}
function closed(value: unknown, keys: readonly string[]): void {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key))) throw new Error();
}
function array(value: unknown, max: number): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error();
}
function id(value: string): void { validateSemanticEditorialIdentifier(value, "editorial draft identifier"); }
function uniqueIds(value: readonly string[], max: number): void {
  array(value, max); value.forEach(id); if (new Set(value).size !== value.length) throw new Error();
}
function text(value: unknown, max: number, empty = false): string {
  if (typeof value !== "string" || value.length > max || (!empty && value.trim().length === 0)) throw new Error();
  return value;
}
function integer(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0 && !Object.is(value, -0); }
function assertLocale(locale: string): asserts locale is CevraLocale {
  if (locale !== "pt-BR" && locale !== "en-US") throw new EditorialDraftError("EDITORIAL_DRAFT_INVALID", "en-US");
}
function normalize(error: unknown, locale: CevraLocale): EditorialDraftError {
  return error instanceof EditorialDraftError ? error : new EditorialDraftError("EDITORIAL_DRAFT_INVALID", locale);
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
function journalIdentity(history: ProjectHistory): string {
  // Replacing a redo branch can keep entry count and visible snapshot unchanged.
  return JSON.stringify(history.entries.map((entry) => [entry.id, entry.snapshotId, entry.parentEntryId, entry.revision]));
}
