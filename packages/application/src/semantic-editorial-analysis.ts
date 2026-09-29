import type { CevraLocale } from "@cevra/i18n";
import type {
  ProjectHistory,
  ProjectIR,
  SourceTranscript,
  TranscriptDigest,
  TranscriptWordTiming
} from "@cevra/project-ir";
import {
  EDITORIAL_TRANSCRIPT_PROJECTION_PROFILE,
  EditorialTranscriptProjectionError,
  EditorialTranscriptProjectionService,
  type EditorialTranscriptProjectionV1,
  type EditorialTranscriptProjectionSource,
  type EditorialTranscriptReasoningUnit
} from "./editorial-transcript-projection.js";
import {
  DEFAULT_SEMANTIC_ANALYSIS_INITIAL_BYTES,
  DEFAULT_SEMANTIC_ANALYSIS_RESPONSE_BYTES,
  MAX_SEMANTIC_ANALYSIS_INVOCATIONS,
  MAX_SEMANTIC_ANALYSIS_TOTAL_EVIDENCE_BYTES,
  SEMANTIC_EDITORIAL_ANALYSIS_PROFILE,
  SEMANTIC_EDITORIAL_ANALYSIS_VERSION,
  SEMANTIC_EDITORIAL_CONTEXT_PROFILE,
  SemanticEditorialAnalysisError,
  parseSemanticEditorialAnalyzerOutput,
  validateSemanticEditorialIdentifier,
  type AnalysisContextV1,
  type AnalyzerAnalysisCandidateV1,
  type AnalyzerEvidenceRequestV1,
  type SemanticEditorialAnalysisBindingV1,
  type SemanticEditorialAnalysisCandidateV1,
  type SemanticEditorialAnalysisFocus,
  type SemanticEditorialAnalysisRequest,
  type SemanticEditorialAnalysisResultV1,
  type SemanticEditorialAnalyzerEnvelopeV1,
  type SemanticEditorialAnalyzerIdentity,
  type SemanticEditorialAnalyzerPort,
  type SemanticEditorialCanonicalEvidenceV1,
  type SemanticEditorialContextEvidenceV1,
  type SemanticEditorialContextSourceV1,
  type SemanticEditorialCoverageV1,
  type SemanticEditorialNeedsEvidenceReason,
  type SemanticEditorialNeedsEvidenceResultV1,
  type SemanticEditorialOperationalProvenanceV1
} from "./semantic-editorial-analysis-contract.js";

const PROJECTION_PAGE_BYTES = 48 * 1024;
const MAX_PROJECTION_PAGES = 128;
const DEFAULT_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 5 * 60_000;
const MAX_BRIEF_CHARACTERS = 4_000;
const MAX_BRIEF_BYTES = 8 * 1024;
const MAX_SOURCE_COUNT = 128;
const ALL_FOCUS: readonly SemanticEditorialAnalysisFocus[] = ["themes", "relationships", "delivery-signals", "caveats"];

export interface SemanticEditorialAnalysisServiceOptions {
  history: ProjectHistory;
  analyzer?: SemanticEditorialAnalyzerPort;
  analyzerIdentity?: SemanticEditorialAnalyzerIdentity;
  initialContextMaxBytes?: number;
  totalEvidenceMaxBytes?: number;
  responseMaxBytes?: number;
  timeoutMs?: number;
  idGenerator?: () => string;
  monotonicClock?: () => number;
  projectionService?: Pick<EditorialTranscriptProjectionService, "project">;
}

interface CapturedRequest {
  id?: string;
  sourceIds: string[];
  locale: CevraLocale;
  brief?: string;
  focus: SemanticEditorialAnalysisFocus[];
}

interface CapturedRequestInput extends Omit<CapturedRequest, "locale"> {
  locale?: CevraLocale;
}

interface InternalBinding {
  public: SemanticEditorialAnalysisBindingV1;
  selectedSourceIds: readonly string[];
  brief?: string;
  focus: readonly SemanticEditorialAnalysisFocus[];
}

interface EvidenceFragment {
  public: SemanticEditorialContextEvidenceV1;
  canonical: SemanticEditorialCanonicalEvidenceV1;
}

interface SourcePlan {
  public: SemanticEditorialContextSourceV1;
  sourceId: string;
  transcriptDigest?: TranscriptDigest;
  timingBasis?: TranscriptWordTiming;
  fragments: EvidenceFragment[];
  cursor?: string;
  blockedAtPageBytes?: number;
  exhausted: boolean;
}

interface EvidencePlan {
  sources: SourcePlan[];
  orderedFragments: EvidenceFragment[];
  nextEvidenceNumber: number;
  projectionCalls: number;
}

interface InvocationEvidence {
  inputBytes: number[];
  responseBytes: number[];
}

interface ActiveAdapterCall {
  settled: boolean;
  completion: Promise<void>;
}

export class SemanticEditorialAnalysisService {
  private readonly history: ProjectHistory;
  private readonly analyzer: SemanticEditorialAnalyzerPort | undefined;
  private readonly analyzerIdentity: SemanticEditorialAnalyzerIdentity | undefined;
  private readonly initialContextMaxBytes: number;
  private readonly totalEvidenceMaxBytes: number;
  private readonly responseMaxBytes: number;
  private readonly timeoutMs: number;
  private readonly idGenerator: () => string;
  private readonly monotonicClock: () => number;
  private readonly projectionService: Pick<EditorialTranscriptProjectionService, "project">;
  private active = false;
  private activeAdapterCall: ActiveAdapterCall | undefined;

  constructor(options: SemanticEditorialAnalysisServiceOptions) {
    this.history = options.history;
    this.analyzer = options.analyzer;
    this.analyzerIdentity = options.analyzerIdentity === undefined
      ? undefined
      : validateAnalyzerIdentity(options.analyzerIdentity);
    this.initialContextMaxBytes = boundedInteger(
      options.initialContextMaxBytes ?? DEFAULT_SEMANTIC_ANALYSIS_INITIAL_BYTES,
      4 * 1024,
      DEFAULT_SEMANTIC_ANALYSIS_INITIAL_BYTES,
      "initialContextMaxBytes"
    );
    this.totalEvidenceMaxBytes = boundedInteger(
      options.totalEvidenceMaxBytes ?? MAX_SEMANTIC_ANALYSIS_TOTAL_EVIDENCE_BYTES,
      this.initialContextMaxBytes,
      MAX_SEMANTIC_ANALYSIS_TOTAL_EVIDENCE_BYTES,
      "totalEvidenceMaxBytes"
    );
    this.responseMaxBytes = boundedInteger(
      options.responseMaxBytes ?? DEFAULT_SEMANTIC_ANALYSIS_RESPONSE_BYTES,
      1024,
      MAX_SEMANTIC_ANALYSIS_TOTAL_EVIDENCE_BYTES,
      "responseMaxBytes"
    );
    this.timeoutMs = boundedInteger(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS, "timeoutMs");
    this.idGenerator = options.idGenerator ?? defaultId;
    this.monotonicClock = options.monotonicClock ?? (() => performance.now());
    this.projectionService = options.projectionService ?? new EditorialTranscriptProjectionService(options.history);
  }

  async analyze(
    request: SemanticEditorialAnalysisRequest,
    signal?: AbortSignal
  ): Promise<SemanticEditorialAnalysisResultV1> {
    const startedAt = this.monotonicClock();
    const deadline = startedAt + this.timeoutMs;
    let capturedInput: CapturedRequestInput;
    let executionId = "semantic-analysis-unassigned";
    let contextId = "semantic-context-unassigned";
    let errorLocale: CevraLocale = "en-US";
    try {
      capturedInput = captureRequest(request);
      errorLocale = capturedInput.locale ?? errorLocale;
      executionId = capturedInput.id ?? validateSemanticEditorialIdentifier(this.idGenerator(), "executionId");
      validateSemanticEditorialIdentifier(executionId, "executionId");
      contextId = validateSemanticEditorialIdentifier(this.idGenerator(), "contextId");
    } catch (cause) {
      throw semanticError("SEMANTIC_ANALYSIS_INVALID_REQUEST", errorLocale, executionId, cause);
    }
    if (this.active) throw semanticError("SEMANTIC_ANALYSIS_ANALYZER_UNAVAILABLE", errorLocale, executionId, new Error("Analyzer instance is busy."));
    assertOperationLive(signal, deadline, this.monotonicClock, errorLocale, executionId);
    const before = this.history.current;
    const captured: CapturedRequest = {
      ...capturedInput,
      locale: capturedInput.locale ?? before.project.defaultLocale
    };
    assertOperationLive(signal, deadline, this.monotonicClock, captured.locale, executionId);
    this.active = true;
    try {
      return await this.run(before, captured, executionId, contextId, deadline, signal);
    } finally {
      const pending = this.activeAdapterCall;
      if (pending !== undefined && !pending.settled) {
        void pending.completion.finally(() => {
          if (this.activeAdapterCall === pending) this.activeAdapterCall = undefined;
          this.active = false;
        });
      } else {
        this.activeAdapterCall = undefined;
        this.active = false;
      }
    }
  }

  private async run(
    before: ProjectIR,
    request: CapturedRequest,
    executionId: string,
    contextId: string,
    deadline: number,
    signal?: AbortSignal
  ): Promise<SemanticEditorialAnalysisResultV1> {
    const guard = (): void => assertOperationLive(signal, deadline, this.monotonicClock, request.locale, executionId);
    guard();
    validateSelectedSources(before, request.sourceIds, request.locale, executionId);
    const binding = captureBinding(before, this.history.entries.length, request);
    const plan = createEvidencePlan(before, request.sourceIds);
    let provided = new Set<string>();
    const metrics: InvocationEvidence = { inputBytes: [], responseBytes: [] };
    guard();

    if (!plan.sources.some((source) => source.public.evidenceStatus === "available")) {
      assertBindingCurrent(this.history, binding, request.locale, executionId);
      const reason: SemanticEditorialNeedsEvidenceReason = plan.sources.some((source) => source.public.evidenceStatus === "transcript-unavailable")
        ? "transcript-unavailable"
        : "no-speech";
      const result = deepFreeze(needsEvidenceResult(
        executionId,
        contextId,
        reason,
        binding.public,
        buildCoverage(plan, provided),
        [],
        metrics,
        this.analyzerIdentity
      ));
      guard();
      return result;
    }
    if (this.analyzer === undefined) {
      throw semanticError("SEMANTIC_ANALYSIS_ANALYZER_UNAVAILABLE", request.locale, executionId);
    }

    const projectionPageBytes = Math.min(PROJECTION_PAGE_BYTES, Math.max(4 * 1024, Math.floor(this.initialContextMaxBytes * 0.65)));
    let pendingProvided = await prepareInitialEvidence(
      plan,
      this.projectionService,
      projectionPageBytes,
      guard,
      (candidate) => {
      const envelope = buildEnvelope(executionId, contextId, 1, request, buildContext(contextId, plan, candidate));
      return utf8Length(JSON.stringify(envelope)) <= this.initialContextMaxBytes;
      }
    );
    guard();
    if (pendingProvided.size === 0) {
      throw semanticError("SEMANTIC_ANALYSIS_CONTEXT_LIMIT", request.locale, executionId);
    }

    for (let invocationIndex = 1; invocationIndex <= MAX_SEMANTIC_ANALYSIS_INVOCATIONS; invocationIndex += 1) {
      const invocation = invocationIndex as 1 | 2;
      guard();
      assertBindingCurrent(this.history, binding, request.locale, executionId);
      const context = buildContext(contextId, plan, pendingProvided);
      const envelope = buildEnvelope(executionId, contextId, invocation, request, context);
      const payload = JSON.stringify(envelope);
      const payloadBytes = utf8Length(payload);
      const sentBytes = metrics.inputBytes.reduce((total, value) => total + value, 0);
      const remainingBytes = this.totalEvidenceMaxBytes - sentBytes;
      if ((invocation === 1 && payloadBytes > this.initialContextMaxBytes) || payloadBytes > remainingBytes) {
        const result = deepFreeze(needsEvidenceResult(
          executionId, contextId, "context-limit", binding.public,
          buildCoverage(plan, provided), canonicalEvidence(plan, provided), metrics,
          this.analyzerIdentity
        ));
        guard();
        return result;
      }
      guard();
      const raw = await this.invokeAnalyzer(
        payload, payloadBytes, executionId, contextId, invocation, request.locale, deadline, signal,
        () => {
          metrics.inputBytes.push(payloadBytes);
          provided = new Set(pendingProvided);
        }
      );
      guard();
      if (raw.length > this.responseMaxBytes) {
        throw semanticError("SEMANTIC_ANALYSIS_INVALID_OUTPUT", request.locale, executionId, new Error("Analyzer response exceeds the configured byte limit."));
      }
      const responseBytes = utf8Length(raw);
      metrics.responseBytes.push(responseBytes);
      if (responseBytes > this.responseMaxBytes) {
        throw semanticError("SEMANTIC_ANALYSIS_INVALID_OUTPUT", request.locale, executionId, new Error("Analyzer response exceeds the configured byte limit."));
      }
      assertBindingCurrent(this.history, binding, request.locale, executionId);
      guard();
      let output;
      try {
        output = parseSemanticEditorialAnalyzerOutput(raw);
      } catch (cause) {
        throw semanticError("SEMANTIC_ANALYSIS_INVALID_OUTPUT", request.locale, executionId, cause);
      }
      guard();
      if (output.contextId !== contextId) {
        throw semanticError("SEMANTIC_ANALYSIS_INVALID_EVIDENCE", request.locale, executionId, new Error("Analyzer output belongs to another context."));
      }
      if (output.kind === "analysis-candidate") {
        validateCandidateEvidence(output, provided, plan, request.locale, executionId);
        assertBindingCurrent(this.history, binding, request.locale, executionId);
        guard();
        const result = deepFreeze({
          version: SEMANTIC_EDITORIAL_ANALYSIS_VERSION,
          profile: SEMANTIC_EDITORIAL_ANALYSIS_PROFILE,
          kind: "analysis-candidate",
          executionId,
          contextId,
          binding: clone(binding.public),
          coverage: buildCoverage(plan, provided),
          evidence: canonicalEvidence(plan, provided),
          candidate: clone(output),
          provenance: provenance(metrics, this.analyzerIdentity)
        } satisfies SemanticEditorialAnalysisCandidateV1);
        guard();
        return result;
      }

      validateEvidenceRequest(output.request, plan, provided, request.locale, executionId);
      if (output.request.type === "visual" || output.request.type === "acoustic") {
        assertBindingCurrent(this.history, binding, request.locale, executionId);
        const result = deepFreeze(needsEvidenceResult(
          executionId,
          contextId,
          "unsupported-evidence",
          binding.public,
          buildCoverage(plan, provided),
          canonicalEvidence(plan, provided),
          metrics,
          this.analyzerIdentity,
          output.request
        ));
        guard();
        return result;
      }
      if (invocation === MAX_SEMANTIC_ANALYSIS_INVOCATIONS) {
        assertBindingCurrent(this.history, binding, request.locale, executionId);
        const result = deepFreeze(needsEvidenceResult(
          executionId,
          contextId,
          "invocation-limit",
          binding.public,
          buildCoverage(plan, provided),
          canonicalEvidence(plan, provided),
          metrics,
          this.analyzerIdentity,
          output.request
        ));
        guard();
        return result;
      }
      if (output.request.type !== "text-context") {
        throw semanticError("SEMANTIC_ANALYSIS_INVALID_EVIDENCE", request.locale, executionId);
      }
      guard();
      assertBindingCurrent(this.history, binding, request.locale, executionId);
      const continuationRemainingBytes = this.totalEvidenceMaxBytes - metrics.inputBytes.reduce((total, value) => total + value, 0);
      const addition = await addRequestedEvidence(
        output.request, plan, provided, executionId, contextId, request,
        this.projectionService, projectionPageBytes, continuationRemainingBytes, guard
      );
      guard();
      if (addition.added === 0) {
        const hasRemaining = buildCoverage(plan, provided).sourcesWithRemainingEvidence.length > 0;
        if (hasRemaining && addition.limitReached) {
          assertBindingCurrent(this.history, binding, request.locale, executionId);
          const result = deepFreeze(needsEvidenceResult(
            executionId,
            contextId,
            "context-limit",
            binding.public,
            buildCoverage(plan, provided),
            canonicalEvidence(plan, provided),
            metrics,
            this.analyzerIdentity,
            output.request
          ));
          guard();
          return result;
        }
        throw semanticError("SEMANTIC_ANALYSIS_NO_PROGRESS", request.locale, executionId);
      }
      pendingProvided = addition.provided;
      assertBindingCurrent(this.history, binding, request.locale, executionId);
      guard();
    }
    throw semanticError("SEMANTIC_ANALYSIS_NO_PROGRESS", request.locale, executionId);
  }

  private async invokeAnalyzer(
    payload: string,
    payloadBytes: number,
    executionId: string,
    contextId: string,
    invocation: 1 | 2,
    locale: CevraLocale,
    deadline: number,
    signal: AbortSignal | undefined,
    onStarted: () => void
  ): Promise<string> {
    assertOperationLive(signal, deadline, this.monotonicClock, locale, executionId);
    const remaining = Math.max(0, deadline - this.monotonicClock());
    const controller = new AbortController();
    const onAbort = (): void => controller.abort(signal?.reason);
    signal?.addEventListener("abort", onAbort, { once: true });
    let rejectCancellation: ((reason?: unknown) => void) | undefined;
    const onCancellation = (): void => rejectCancellation?.(semanticError("SEMANTIC_ANALYSIS_CANCELLED", locale, executionId, signal?.reason));
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const raw = new Promise<string>((resolve, reject) => {
      setTimeout(() => {
        try {
          assertOperationLive(signal, deadline, this.monotonicClock, locale, executionId);
          onStarted();
          Promise.resolve(this.analyzer!.analyze(
            deepFreeze({ version: 1, contentType: "application/json", payload, payloadBytes }),
            Object.freeze({ jobId: executionId, locale, signal: controller.signal, invocation, contextId })
          )).then(resolve, reject);
        } catch (cause) {
          reject(cause);
        }
      }, 0);
    });
    const completion = raw.then(() => undefined, () => undefined).finally(() => { settled = true; });
    const activeCall: ActiveAdapterCall = { get settled() { return settled; }, completion };
    this.activeAdapterCall = activeCall;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort(new Error("Semantic analysis timeout."));
        reject(semanticError("SEMANTIC_ANALYSIS_TIMEOUT", locale, executionId));
      }, remaining);
    });
    const cancellation = new Promise<never>((_resolve, reject) => {
      rejectCancellation = reject;
      if (signal?.aborted) reject(semanticError("SEMANTIC_ANALYSIS_CANCELLED", locale, executionId, signal.reason));
      else signal?.addEventListener("abort", onCancellation, { once: true });
    });
    try {
      const result = await Promise.race([raw, timeout, cancellation]);
      assertOperationLive(signal, deadline, this.monotonicClock, locale, executionId);
      if (typeof result !== "string") throw semanticError("SEMANTIC_ANALYSIS_INVALID_OUTPUT", locale, executionId, new Error("Analyzer response must be a JSON string."));
      return result;
    } catch (cause) {
      if (signal?.aborted || (cause instanceof Error && cause.name === "AbortError")) {
        throw semanticError("SEMANTIC_ANALYSIS_CANCELLED", locale, executionId, cause);
      }
      if (cause instanceof SemanticEditorialAnalysisError) throw cause;
      throw semanticError("SEMANTIC_ANALYSIS_ANALYZER_UNAVAILABLE", locale, executionId, cause);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      signal?.removeEventListener("abort", onCancellation);
      if (settled && this.activeAdapterCall === activeCall) this.activeAdapterCall = undefined;
    }
  }
}

function createEvidencePlan(project: ProjectIR, requestedSourceIds: readonly string[]): EvidencePlan {
  const transcriptBySource = new Map(project.sourceTranscripts.map((item) => [item.sourceId, item]));
  const plans = requestedSourceIds.map((sourceId, index): SourcePlan => {
    const transcript = transcriptBySource.get(sourceId);
    return {
      public: {
        reference: `S${index + 1}`,
        evidenceStatus: transcript === undefined
          ? "transcript-unavailable"
          : transcript.transcript.words.length === 0 && transcript.transcript.segments.length === 0
            ? "no-speech"
            : "available"
      },
      sourceId,
      ...(transcript === undefined ? {} : { transcriptDigest: transcript.transcriptDigest, timingBasis: transcript.wordTiming }),
      fragments: [],
      exhausted: transcript === undefined || (transcript.transcript.words.length === 0 && transcript.transcript.segments.length === 0)
    };
  });
  return { sources: plans, orderedFragments: [], nextEvidenceNumber: 1, projectionCalls: 0 };
}

function updateSourceStatus(plan: SourcePlan | undefined, source: EditorialTranscriptProjectionSource): void {
  if (plan === undefined) return;
  plan.public = {
    reference: plan.public.reference,
    evidenceStatus: source.status === "projected" ? "available" : source.status
  };
}

function toEvidenceFragment(
  reference: string,
  sourceReference: string,
  timingBasis: TranscriptWordTiming,
  unit: EditorialTranscriptReasoningUnit
): EvidenceFragment {
  const continuation = unit.continuation === undefined
    ? "complete"
    : unit.continuation.continuedFromPrevious
      ? unit.continuation.continuesOnNextPage ? "middle" : "from-previous"
      : "to-next";
  return {
    public: {
      reference,
      sourceReference,
      startMs: unit.startMs,
      endMs: unit.endMs,
      timingBasis,
      text: unit.text,
      continuation
    },
    canonical: {
      reference,
      sourceId: unit.sourceId,
      transcriptDigest: unit.transcriptDigest,
      startMs: unit.startMs,
      endMs: unit.endMs,
      timingBasis,
      basis: unit.basis,
      wordIds: [...unit.wordIds],
      ...(unit.basis === "segments" ? { segmentId: unit.segmentId } : {}),
      text: unit.text
    }
  };
}

async function prepareInitialEvidence(
  plan: EvidencePlan,
  projection: Pick<EditorialTranscriptProjectionService, "project">,
  projectionPageBytes: number,
  guard: () => void,
  fits: (candidate: ReadonlySet<string>) => boolean
): Promise<Set<string>> {
  const selected = new Set<string>();

  // Deterministic breadth-first disclosure: offer one admissible fragment per
  // available source before filling the remaining initial budget.
  for (const source of plan.sources) {
    if (source.public.evidenceStatus !== "available") continue;
    guard();
    if (source.fragments.length === 0 && !source.exhausted) {
      await collectNextSourcePage(plan, source, projection, projectionPageBytes, guard);
    }
    const first = source.fragments.find((fragment) => !selected.has(fragment.public.reference));
    if (first === undefined) continue;
    const candidate = new Set(selected).add(first.public.reference);
    if (fits(candidate)) selected.add(first.public.reference);
  }

  for (const source of plan.sources) {
    if (source.public.evidenceStatus !== "available") continue;
    while (true) {
      guard();
      const next = source.fragments.find((fragment) => !selected.has(fragment.public.reference));
      if (next !== undefined) {
        const candidate = new Set(selected).add(next.public.reference);
        if (!fits(candidate)) break;
        selected.add(next.public.reference);
        continue;
      }
      if (source.exhausted || plan.projectionCalls >= MAX_PROJECTION_PAGES) break;
      const added = await collectNextSourcePage(plan, source, projection, projectionPageBytes, guard);
      if (added === 0) break;
    }
  }
  return selected;
}

async function addRequestedEvidence(
  request: Extract<AnalyzerEvidenceRequestV1, { type: "text-context" }>,
  plan: EvidencePlan,
  provided: Set<string>,
  executionId: string,
  contextId: string,
  captured: CapturedRequest,
  projection: Pick<EditorialTranscriptProjectionService, "project">,
  projectionPageBytes: number,
  remainingTransmissionBytes: number,
  guard: () => void
): Promise<{ added: number; limitReached: boolean; provided: Set<string> }> {
  const source = plan.sources.find((item) => item.public.reference === request.sourceReference)!;
  const candidateProvided = new Set(provided);
  const anchorIndex = request.afterEvidenceReference === undefined
    ? -1
    : source.fragments.findIndex((item) => item.public.reference === request.afterEvidenceReference);
  let added = 0;
  let addedBytes = 0;
  let limitReached = false;
  while (true) {
    guard();
    const fragment = source.fragments
      .slice(anchorIndex + 1)
      .find((item) => !candidateProvided.has(item.public.reference));
    if (fragment === undefined) {
      if (source.exhausted) break;
      if (plan.projectionCalls >= MAX_PROJECTION_PAGES) {
        limitReached = true;
        break;
      }
      const requestedPageBytes = Math.max(projectionPageBytes, Math.min(request.maxAdditionalBytes, 256 * 1024));
      const collected = await collectNextSourcePage(plan, source, projection, requestedPageBytes, guard);
      if (collected === 0) {
        if (!source.exhausted) limitReached = true;
        break;
      }
      continue;
    }
    const fragmentBytes = utf8Length(JSON.stringify(fragment.public));
    if (addedBytes + fragmentBytes > request.maxAdditionalBytes) {
      limitReached = true;
      break;
    }
    const candidate = new Set(candidateProvided).add(fragment.public.reference);
    const envelope = buildEnvelope(executionId, contextId, 2, captured, buildContext(contextId, plan, candidate));
    if (utf8Length(JSON.stringify(envelope)) > remainingTransmissionBytes) {
      limitReached = true;
      break;
    }
    candidateProvided.add(fragment.public.reference);
    added += 1;
    addedBytes += fragmentBytes;
  }
  return { added, limitReached, provided: candidateProvided };
}

async function collectNextSourcePage(
  plan: EvidencePlan,
  source: SourcePlan,
  projection: Pick<EditorialTranscriptProjectionService, "project">,
  projectionPageBytes: number,
  guard: () => void
): Promise<number> {
  guard();
  if (source.exhausted || plan.projectionCalls >= MAX_PROJECTION_PAGES) return 0;
  if (source.blockedAtPageBytes !== undefined && projectionPageBytes <= source.blockedAtPageBytes) return 0;
  plan.projectionCalls += 1;
  let page: EditorialTranscriptProjectionV1;
  try {
    page = projection.project({
      sourceIds: [source.sourceId],
      maxBytes: projectionPageBytes,
      ...(source.cursor === undefined ? {} : { cursor: source.cursor })
    });
  } catch (cause) {
    if (cause instanceof EditorialTranscriptProjectionError && cause.code === "EDITORIAL_TRANSCRIPT_UNIT_TOO_LARGE") {
      source.blockedAtPageBytes = projectionPageBytes;
      await yieldToEventLoop();
      guard();
      return 0;
    }
    throw cause;
  }
  delete source.blockedAtPageBytes;
  guard();
  const before = source.fragments.length;
  for (const projectedSource of page.sources) updateSourceStatus(source, projectedSource);
  for (const unit of page.reasoningUnits) {
    const reference = `E${plan.nextEvidenceNumber++}`;
    const fragment = toEvidenceFragment(reference, source.public.reference, source.timingBasis!, unit);
    source.fragments.push(fragment);
    plan.orderedFragments.push(fragment);
  }
  if (page.page.nextCursor === undefined) {
    delete source.cursor;
    source.exhausted = true;
  } else {
    source.cursor = page.page.nextCursor;
  }
  await yieldToEventLoop();
  guard();
  return source.fragments.length - before;
}

function buildContext(contextId: string, plan: EvidencePlan, provided: ReadonlySet<string>): AnalysisContextV1 {
  return {
    version: SEMANTIC_EDITORIAL_ANALYSIS_VERSION,
    profile: SEMANTIC_EDITORIAL_CONTEXT_PROFILE,
    contextId,
    sources: plan.sources.map((source) => ({ ...source.public })),
    evidence: plan.orderedFragments.filter((item) => provided.has(item.public.reference)).map((item) => clone(item.public)),
    coverage: buildCoverage(plan, provided),
    limitations: [
      "transcript-based-text-only",
      "no-visual-or-acoustic-evidence",
      "interpretations-are-not-proven-facts",
      "citations-do-not-imply-cut-precision"
    ]
  };
}

function buildCoverage(plan: EvidencePlan, provided: ReadonlySet<string>): SemanticEditorialCoverageV1 {
  const remaining = plan.sources.filter((source) => source.public.evidenceStatus === "available"
    && (!source.exhausted || source.fragments.some((fragment) => !provided.has(fragment.public.reference))));
  const unavailable = plan.sources.filter((source) => source.public.evidenceStatus === "transcript-unavailable");
  const noSpeech = plan.sources.filter((source) => source.public.evidenceStatus === "no-speech");
  return {
    status: remaining.length > 0 || unavailable.length > 0 ? "partial" : "complete",
    requestedSourceReferences: plan.sources.map((source) => source.public.reference),
    providedEvidenceReferences: plan.orderedFragments.filter((item) => provided.has(item.public.reference)).map((item) => item.public.reference),
    transcriptUnavailableSourceReferences: unavailable.map((source) => source.public.reference),
    noSpeechSourceReferences: noSpeech.map((source) => source.public.reference),
    sourcesWithRemainingEvidence: remaining.map((source) => source.public.reference)
  };
}

function buildEnvelope(
  executionId: string,
  contextId: string,
  invocation: 1 | 2,
  request: CapturedRequest,
  context: AnalysisContextV1
): SemanticEditorialAnalyzerEnvelopeV1 {
  return {
    version: SEMANTIC_EDITORIAL_ANALYSIS_VERSION,
    profile: SEMANTIC_EDITORIAL_ANALYSIS_PROFILE,
    execution: { executionId, contextId, invocation },
    task: {
      kind: "transcript-semantic-analysis",
      locale: request.locale,
      ...(request.brief === undefined ? {} : { brief: request.brief }),
      focus: [...request.focus],
      constraints: { evidenceOnly: true, noCommands: true, noRanking: true, textOnly: true }
    },
    context
  };
}

function validateCandidateEvidence(
  candidate: AnalyzerAnalysisCandidateV1,
  provided: ReadonlySet<string>,
  plan: EvidencePlan,
  locale: CevraLocale,
  executionId: string
): void {
  const evidenceByReference = new Map(plan.orderedFragments.map((item) => [item.public.reference, item]));
  const validateReferences = (references: readonly string[]): EvidenceFragment[] => references.map((reference) => {
    const evidence = evidenceByReference.get(reference);
    if (evidence === undefined || !provided.has(reference)) {
      throw semanticError("SEMANTIC_ANALYSIS_INVALID_EVIDENCE", locale, executionId, new Error(`Evidence ${reference} was not supplied in this context.`));
    }
    return evidence;
  });
  for (const observation of candidate.observations) {
    const evidence = validateReferences(observation.evidenceReferences);
    if (observation.quote !== undefined && !evidence.some((item) => item.public.text.includes(observation.quote!))) {
      throw semanticError("SEMANTIC_ANALYSIS_INVALID_EVIDENCE", locale, executionId, new Error("Observation quote is not present in cited evidence."));
    }
  }
  for (const relation of candidate.relations) {
    validateReferences(relation.leftEvidenceReferences);
    validateReferences(relation.rightEvidenceReferences);
  }
  for (const uncertainty of candidate.uncertainties) {
    if (uncertainty.evidenceReferences !== undefined) validateReferences(uncertainty.evidenceReferences);
  }
}

function validateEvidenceRequest(
  request: AnalyzerEvidenceRequestV1,
  plan: EvidencePlan,
  provided: ReadonlySet<string>,
  locale: CevraLocale,
  executionId: string
): void {
  const source = plan.sources.find((item) => item.public.reference === request.sourceReference);
  if (source === undefined) throw semanticError("SEMANTIC_ANALYSIS_INVALID_EVIDENCE", locale, executionId, new Error("Evidence request source is outside the authorized scope."));
  if (request.type === "text-context" && request.afterEvidenceReference !== undefined) {
    const evidence = source.fragments.find((item) => item.public.reference === request.afterEvidenceReference);
    if (evidence === undefined || !provided.has(request.afterEvidenceReference)) {
      throw semanticError("SEMANTIC_ANALYSIS_INVALID_EVIDENCE", locale, executionId, new Error("Evidence request anchor was not supplied for this source."));
    }
  }
}

function captureRequest(value: unknown): CapturedRequestInput {
  if (!isRecord(value)) throw new Error("request must be an object.");
  const allowed = new Set(["id", "sourceIds", "locale", "brief", "focus"]);
  const optional = new Set(["id", "locale", "brief", "focus"]);
  const captured: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`request contains unsupported field ${key}.`);
    const field = value[key];
    if (field === undefined && optional.has(key)) continue;
    captured[key] = clone(field);
  }
  if (!Array.isArray(captured.sourceIds) || captured.sourceIds.length === 0 || captured.sourceIds.length > MAX_SOURCE_COUNT) {
    throw new Error("sourceIds must be a bounded non-empty array.");
  }
  const sourceIds = captured.sourceIds.map((item) => {
    if (!isId(item)) throw new Error("sourceIds contains an invalid ID.");
    return item;
  });
  if (new Set(sourceIds).size !== sourceIds.length) throw new Error("sourceIds contains duplicates.");
  const locale = captured.locale;
  if (locale !== undefined && locale !== "pt-BR" && locale !== "en-US") throw new Error("locale is unsupported.");
  const brief = captured.brief === undefined ? undefined : validateBrief(captured.brief);
  const focus = captured.focus === undefined ? [...ALL_FOCUS] : validateFocus(captured.focus);
  const id = captured.id === undefined ? undefined : validateSemanticEditorialIdentifier(captured.id, "request.id");
  return {
    ...(id === undefined ? {} : { id }),
    sourceIds,
    ...(locale === undefined ? {} : { locale }),
    ...(brief === undefined ? {} : { brief }),
    focus
  };
}

function validateBrief(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_BRIEF_CHARACTERS || utf8Length(value) > MAX_BRIEF_BYTES || hasInvalidControls(value)) {
    throw new Error("brief is invalid or exceeds its bound.");
  }
  return value;
}

function validateFocus(value: unknown): SemanticEditorialAnalysisFocus[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > ALL_FOCUS.length) throw new Error("focus is invalid.");
  const output = value.map((item) => {
    if (!ALL_FOCUS.includes(item as SemanticEditorialAnalysisFocus)) throw new Error("focus contains an unsupported value.");
    return item as SemanticEditorialAnalysisFocus;
  });
  if (new Set(output).size !== output.length) throw new Error("focus contains duplicates.");
  return output;
}

function validateSelectedSources(project: ProjectIR, sourceIds: readonly string[], locale: CevraLocale, executionId: string): void {
  const existing = new Set(project.sources.map((source) => source.id));
  if (sourceIds.some((sourceId) => !existing.has(sourceId))) {
    throw semanticError("SEMANTIC_ANALYSIS_INVALID_REQUEST", locale, executionId, new Error("A selected source does not exist."));
  }
}

function captureBinding(project: ProjectIR, journalEntryCount: number, request: CapturedRequest): InternalBinding {
  const transcriptBySource = new Map(project.sourceTranscripts.map((item) => [item.sourceId, item.transcriptDigest]));
  return {
    public: {
      projectId: project.project.id,
      projectRevision: project.history.revision,
      ...(project.history.headSnapshotId === undefined ? {} : { projectSnapshotId: project.history.headSnapshotId }),
      journalEntryCount,
      sourceTranscripts: request.sourceIds.map((sourceId) => {
        const transcriptDigest = transcriptBySource.get(sourceId);
        return { sourceId, ...(transcriptDigest === undefined ? {} : { transcriptDigest }) };
      }),
      projectionProfile: EDITORIAL_TRANSCRIPT_PROJECTION_PROFILE,
      analysisProfile: SEMANTIC_EDITORIAL_ANALYSIS_PROFILE
    },
    selectedSourceIds: [...request.sourceIds],
    ...(request.brief === undefined ? {} : { brief: request.brief }),
    focus: [...request.focus]
  };
}

function assertBindingCurrent(history: ProjectHistory, expected: InternalBinding, locale: CevraLocale, executionId: string): void {
  const current = history.current;
  const transcriptBySource = new Map(current.sourceTranscripts.map((item) => [item.sourceId, item.transcriptDigest]));
  const sources = new Set(current.sources.map((source) => source.id));
  const actualBindings = expected.selectedSourceIds.map((sourceId) => ({
    sourceId,
    transcriptDigest: transcriptBySource.get(sourceId)
  }));
  const expectedBindings = expected.public.sourceTranscripts.map((item) => ({
    sourceId: item.sourceId,
    transcriptDigest: item.transcriptDigest
  }));
  if (current.project.id !== expected.public.projectId
    || current.history.revision !== expected.public.projectRevision
    || current.history.headSnapshotId !== expected.public.projectSnapshotId
    || history.entries.length !== expected.public.journalEntryCount
    || expected.selectedSourceIds.some((sourceId) => !sources.has(sourceId))
    || JSON.stringify(actualBindings) !== JSON.stringify(expectedBindings)) {
    throw semanticError("SEMANTIC_ANALYSIS_STALE", locale, executionId);
  }
}

function canonicalEvidence(plan: EvidencePlan, provided: ReadonlySet<string>): SemanticEditorialCanonicalEvidenceV1[] {
  return plan.orderedFragments.filter((item) => provided.has(item.public.reference)).map((item) => clone(item.canonical));
}

function needsEvidenceResult(
  executionId: string,
  contextId: string,
  reason: SemanticEditorialNeedsEvidenceReason,
  binding: SemanticEditorialAnalysisBindingV1,
  coverage: SemanticEditorialCoverageV1,
  evidence: readonly SemanticEditorialCanonicalEvidenceV1[],
  metrics: InvocationEvidence,
  analyzerIdentity?: SemanticEditorialAnalyzerIdentity,
  requestedEvidence?: AnalyzerEvidenceRequestV1
): SemanticEditorialNeedsEvidenceResultV1 {
  return {
    version: SEMANTIC_EDITORIAL_ANALYSIS_VERSION,
    profile: SEMANTIC_EDITORIAL_ANALYSIS_PROFILE,
    kind: "needs-evidence",
    executionId,
    contextId,
    reason,
    binding: clone(binding),
    coverage: clone(coverage),
    evidence: clone(evidence),
    ...(requestedEvidence === undefined ? {} : { requestedEvidence: clone(requestedEvidence) }),
    provenance: provenance(metrics, analyzerIdentity)
  };
}

function provenance(metrics: InvocationEvidence, analyzerIdentity?: SemanticEditorialAnalyzerIdentity): SemanticEditorialOperationalProvenanceV1 {
  return {
    ...(analyzerIdentity === undefined ? {} : { analyzer: clone(analyzerIdentity) }),
    invocationCount: metrics.inputBytes.length as 0 | 1 | 2,
    requestBytes: [...metrics.inputBytes],
    responseBytes: [...metrics.responseBytes]
  };
}

function validateAnalyzerIdentity(value: SemanticEditorialAnalyzerIdentity): SemanticEditorialAnalyzerIdentity {
  if (!isRecord(value)) throw new Error("analyzerIdentity must be an object.");
  const keys = Object.keys(value);
  if (keys.some((key) => !["adapterId", "adapterVersion", "modelId", "modelRevision"].includes(key))) throw new Error("analyzerIdentity contains unsupported fields.");
  for (const key of ["adapterId", "adapterVersion"] as const) if (!isBoundedIdentity(value[key])) throw new Error(`analyzerIdentity.${key} is invalid.`);
  for (const key of ["modelId", "modelRevision"] as const) if (value[key] !== undefined && !isBoundedIdentity(value[key])) throw new Error(`analyzerIdentity.${key} is invalid.`);
  return clone(value);
}

function boundedInteger(value: unknown, min: number, max: number, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw new Error(`${field} is invalid.`);
  return value as number;
}

function isBoundedIdentity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && !hasInvalidControls(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && value === value.trim() && !hasInvalidControls(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasInvalidControls(value: string): boolean {
  return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function assertOperationLive(
  signal: AbortSignal | undefined,
  deadline: number,
  monotonicClock: () => number,
  locale: CevraLocale,
  executionId: string
): void {
  // Cancellation has stable precedence when both conditions are observable.
  if (signal?.aborted) throw semanticError("SEMANTIC_ANALYSIS_CANCELLED", locale, executionId, signal.reason);
  if (monotonicClock() >= deadline) throw semanticError("SEMANTIC_ANALYSIS_TIMEOUT", locale, executionId);
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function semanticError(
  code: ConstructorParameters<typeof SemanticEditorialAnalysisError>[0],
  locale: CevraLocale,
  executionId: string,
  cause?: unknown
): SemanticEditorialAnalysisError {
  return new SemanticEditorialAnalysisError(code, locale, executionId, cause);
}

function defaultId(): string {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `semantic_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
