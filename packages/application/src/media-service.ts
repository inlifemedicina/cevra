import {
  AUDIO_SEQUENCE_SAMPLE_FORMAT,
  AUDIO_SEQUENCE_SAMPLE_RATE,
  MEDIA_DELIVERY_MATRIX,
  normalizeAudioCodec,
  normalizeVideoCodec,
  resolveAudioDelivery,
  resolveAudioMutationDelivery,
  resolveMediaContainer,
  resolveStandardAvDelivery,
  resolveTranscodeDelivery,
  validateMediaOperation,
  validateAudioMeasurementReport,
  type MediaEngineAdapter,
  type MediaOperation,
  type MediaOperationResult,
  type MediaPublicationEvidenceV1
} from "@cevra/contracts";
import { applyCommand, type EditCommand, type JournalActor, type ProjectHistory, type ProjectIR } from "@cevra/project-ir";
import { MediaApplicationError } from "./errors.js";
import { MediaExecutionAlreadyExistsError, type MediaExecutionRepository } from "./repository.js";
import { mediaOperationOutputUris } from "./media-operation.js";
import {
  provenanceFrom,
  type MediaApplicationErrorCode,
  type MediaExecutionAttempt,
  type MediaExecutionOutcome,
  type MediaOutputExpectation,
  type MediaProjectBinding,
  type MediaExecutionRecord,
  type MediaExecutionRequest,
  type MediaProjectMutation,
  type MediaRecoveryResult
} from "./types.js";

export interface MediaArtifactStore {
  kind(uri: string): Promise<"missing" | "file" | "symlink" | "other">;
  exists(uri: string): Promise<boolean>;
  remove(uri: string): Promise<void>;
  matchesPublication?(uri: string, evidence: MediaPublicationEvidenceV1): Promise<boolean>;
}

export interface MediaApplicationServiceOptions {
  engine: MediaEngineAdapter;
  history: ProjectHistory;
  executions: MediaExecutionRepository;
  artifacts: MediaArtifactStore;
  clock?: () => string;
  idGenerator?: () => string;
}

class AttemptFailure extends Error {
  constructor(readonly code: MediaApplicationErrorCode, message: string, readonly parameter?: string) {
    super(message);
  }
}

export class MediaApplicationService {
  private readonly engine: MediaEngineAdapter;
  private readonly history: ProjectHistory;
  private readonly executions: MediaExecutionRepository;
  private readonly artifacts: MediaArtifactStore;
  private readonly clock: () => string;
  private readonly idGenerator: () => string;

  constructor(options: MediaApplicationServiceOptions) {
    this.engine = options.engine;
    this.history = options.history;
    this.executions = options.executions;
    this.artifacts = options.artifacts;
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.idGenerator = options.idGenerator ?? defaultId;
  }

  async execute(request: MediaExecutionRequest, signal?: AbortSignal): Promise<MediaExecutionOutcome> {
    const defaultLocale = this.history.current.project.defaultLocale;
    let candidate: MediaExecutionRequest | undefined;
    let stableRequest: Required<Pick<MediaExecutionRequest, "id" | "locale" | "operation" | "mutation" | "actor">>
      & Pick<MediaExecutionRequest, "projectBinding" | "expectedOutput">;
    try {
      candidate = clone(request);
      stableRequest = snapshotExecutionRequest(candidate, defaultLocale, this.idGenerator);
    } catch (cause) {
      const locale = candidate?.locale === "en-US" ? "en-US" : defaultLocale;
      const executionId = typeof candidate?.id === "string" ? candidate.id : "invalid-media-execution";
      throw new MediaApplicationError("MEDIA_INVALID_REQUEST", locale, executionId, {}, cause);
    }
    const executionId = stableRequest.id;
    const locale = stableRequest.locale;
    const record: MediaExecutionRecord = {
      id: executionId,
      projectId: this.history.current.project.id,
      locale,
      operation: stableRequest.operation,
      mutation: stableRequest.mutation,
      actor: stableRequest.actor,
      ...(stableRequest.projectBinding ? { projectBinding: stableRequest.projectBinding } : {}),
      ...(stableRequest.expectedOutput ? { expectedOutput: stableRequest.expectedOutput } : {}),
      status: "requested",
      createdAt: this.clock(),
      attempts: []
    };
    try {
      await this.executions.create(record);
    } catch (cause) {
      if (cause instanceof MediaExecutionAlreadyExistsError) {
        throw new MediaApplicationError("MEDIA_INVALID_REQUEST", locale, executionId, {}, cause);
      }
      throw cause;
    }
    return this.runAttempt(record, signal);
  }

  /**
   * Desktop restart reconciliation. Unlike recoverPending(), this method never
   * invokes retry or the Media Engine.
   */
  async reconcilePendingWithoutReplay(): Promise<MediaRecoveryResult[]> {
    const projectId = this.history.current.project.id;
    const pending = await this.executions.listByStatus(projectId, ["requested", "running", "committing"]);
    const reconciled: MediaRecoveryResult[] = [];
    for (const record of pending) {
      const attempt = record.attempts.at(-1);
      if (record.status === "committing" && record.mutation.type !== "none"
        && attempt?.result && mediaExecutionMutationApplied(record, this.history.current)) {
        const project = this.history.current;
        const entry = committedEntry(record, this.history.entries);
        attempt.status = "succeeded";
        attempt.completedAt = this.clock();
        attempt.projectRevisionAfter = project.history.revision;
        if (project.history.headSnapshotId) attempt.projectSnapshotAfter = project.history.headSnapshotId;
        if (entry) attempt.projectJournalEntryId = entry.id;
        record.status = "succeeded";
        await this.executions.save(record);
        reconciled.push({ executionId: record.id, status: "succeeded" });
        continue;
      }
      if (!attempt) {
        record.status = "interrupted";
        await this.executions.save(record);
        reconciled.push({ executionId: record.id, status: "interrupted", errorCode: "MEDIA_OPERATION_INTERRUPTED" });
        continue;
      }
      const cleanup = await this.reconcileCleanupAfterRestart(record, attempt);
      attempt.removedPartialOutputUris.push(...cleanup.removed.filter((uri) => !attempt.removedPartialOutputUris.includes(uri)));
      attempt.cleanupFailedOutputUris.push(...cleanup.failed.filter((uri) => !attempt.cleanupFailedOutputUris.includes(uri)));
      attempt.status = "interrupted";
      attempt.completedAt = this.clock();
      attempt.errorCode = cleanup.failed.length ? "MEDIA_RECOVERY_FAILED" : "MEDIA_OPERATION_INTERRUPTED";
      attempt.technicalError = "Desktop restarted before the media operation completed; execution was not replayed.";
      record.status = cleanup.failed.length ? "failed" : "interrupted";
      await this.executions.save(record);
      reconciled.push({
        executionId: record.id,
        status: record.status,
        errorCode: attempt.errorCode
      });
    }
    return reconciled;
  }

  async retry(executionId: string, signal?: AbortSignal): Promise<MediaExecutionOutcome> {
    const record = await this.executions.get(executionId);
    const locale = record?.locale ?? this.history.current.project.defaultLocale;
    if (!record) throw new MediaApplicationError("MEDIA_OPERATION_NOT_FOUND", locale, executionId);
    if (record.projectId !== this.history.current.project.id || !["failed", "cancelled", "interrupted"].includes(record.status)) {
      throw new MediaApplicationError("MEDIA_OPERATION_NOT_RETRYABLE", locale, executionId);
    }
    try {
      record.operation = clone(validateMediaOperation(record.operation));
      validateMutation(record.operation, record.mutation);
      validateProjectMutation(record.mutation);
      validateJournalActor(record.actor);
      validateProjectBinding(record.projectBinding);
      validateOutputExpectation(record.expectedOutput, record.operation);
      if (record.locale !== "pt-BR" && record.locale !== "en-US") throw new Error("Media execution locale is invalid.");
    } catch (cause) {
      record.status = "failed";
      await this.executions.save(record);
      throw new MediaApplicationError("MEDIA_INVALID_REQUEST", locale, executionId, {}, cause);
    }
    return this.runAttempt(record, signal);
  }

  async recoverPending(): Promise<MediaRecoveryResult[]> {
    const projectId = this.history.current.project.id;
    const pending = await this.executions.listByStatus(projectId, ["requested", "running", "committing"]);
    const recovered: MediaRecoveryResult[] = [];
    for (const record of pending) {
      const attempt = record.attempts.at(-1);
      if (record.status === "committing" && attempt?.result && mediaExecutionMutationApplied(record, this.history.current)) {
        const project = this.history.current;
        const entry = committedEntry(record, this.history.entries);
        attempt.status = "succeeded";
        attempt.completedAt = this.clock();
        attempt.projectRevisionAfter = project.history.revision;
        if (project.history.headSnapshotId) attempt.projectSnapshotAfter = project.history.headSnapshotId;
        if (entry) attempt.projectJournalEntryId = entry.id;
        record.status = "succeeded";
        await this.executions.save(record);
        recovered.push({ executionId: record.id, status: "succeeded" });
        continue;
      }
      if (attempt) {
        const cleanup = hasExclusivePublication(record.operation)
          ? await this.cleanupPublished(record.operation, attempt.outputUris, attempt.ownedOutputPublications ?? [], attempt.preexistingOutputUris)
          : await this.cleanup(attempt.outputUris, attempt.preexistingOutputUris);
        attempt.removedPartialOutputUris.push(...cleanup.removed);
        attempt.cleanupFailedOutputUris.push(...cleanup.failed);
        attempt.status = "interrupted";
        attempt.completedAt = this.clock();
        attempt.errorCode = cleanup.failed.length ? "MEDIA_RECOVERY_FAILED" : "MEDIA_OPERATION_INTERRUPTED";
        attempt.technicalError = "Application process stopped before the media operation completed.";
        record.status = cleanup.failed.length ? "failed" : "interrupted";
        await this.executions.save(record);
        if (cleanup.failed.length) {
          recovered.push({ executionId: record.id, status: record.status, errorCode: "MEDIA_RECOVERY_FAILED" });
          continue;
        }
      } else {
        record.status = "interrupted";
        await this.executions.save(record);
      }
      try {
        const outcome = await this.retry(record.id);
        recovered.push({ executionId: record.id, status: outcome.record.status });
      } catch (error) {
        const latest = await this.executions.get(record.id);
        recovered.push({
          executionId: record.id,
          status: latest?.status ?? "failed",
          ...(error instanceof MediaApplicationError ? { errorCode: error.code } : {})
        });
      }
    }
    return recovered;
  }

  async cleanupOwnedOutputs(executionId: string): Promise<{ removed: string[]; failed: string[] }> {
    const record = await this.executions.get(executionId);
    if (!record) throw new MediaApplicationError("MEDIA_OPERATION_NOT_FOUND", this.history.current.project.defaultLocale, executionId);
    const attempt = record.attempts.at(-1);
    if (!attempt) return { removed: [], failed: [] };
    const cleanup = await this.cleanupPublished(record.operation, attempt.outputUris, attempt.ownedOutputPublications ?? [], attempt.preexistingOutputUris);
    attempt.removedPartialOutputUris.push(...cleanup.removed.filter((uri) => !attempt.removedPartialOutputUris.includes(uri)));
    attempt.cleanupFailedOutputUris.push(...cleanup.failed.filter((uri) => !attempt.cleanupFailedOutputUris.includes(uri)));
    await this.executions.save(record);
    return cleanup;
  }

  async getExecutionRecord(executionId: string): Promise<MediaExecutionRecord | undefined> {
    return this.executions.get(executionId);
  }

  private async runAttempt(record: MediaExecutionRecord, signal?: AbortSignal): Promise<MediaExecutionOutcome> {
    const outputUris = mediaOperationOutputUris(record.operation);
    const current = this.history.current;
    const attempt: MediaExecutionAttempt = {
      number: record.attempts.length + 1,
      jobId: `${record.id}:${record.attempts.length + 1}`,
      status: "requested",
      requestedAt: this.clock(),
      outputUris,
      preexistingOutputUris: [],
      ownedOutputUris: [],
      ownedOutputPublications: [],
      removedPartialOutputUris: [],
      cleanupFailedOutputUris: [],
      projectRevisionBefore: current.history.revision,
      ...(current.history.headSnapshotId ? { projectSnapshotBefore: current.history.headSnapshotId } : {})
    };
    record.attempts.push(attempt);
    record.status = "requested";
    await this.executions.save(record);
    let projectStateFinalized = false;

    try {
      assertProjectBinding(this.history, current, record.projectBinding);
      prevalidateMutation(current, record, outputUris[0]);
      for (const uri of outputUris) {
        const kind = await this.artifacts.kind(uri);
        if (kind !== "missing") attempt.preexistingOutputUris.push(uri);
        if (kind === "symlink") throw new AttemptFailure("MEDIA_INVALID_REQUEST", "Output path must not be a symlink.", uri);
        if (kind === "other") throw new AttemptFailure("MEDIA_INVALID_REQUEST", "Output path must be absent or a regular file.", uri);
      }
      if (attempt.preexistingOutputUris.length) {
        throw new AttemptFailure("MEDIA_OUTPUT_EXISTS", "Output already exists.", attempt.preexistingOutputUris[0]);
      }
      if (signal?.aborted) throw abortMarker();

      const identity = await this.engine.identity();
      attempt.provenance = provenanceFrom(identity);
      attempt.status = "running";
      attempt.startedAt = this.clock();
      record.status = "running";
      await this.executions.save(record);

      const result = await this.engine.execute(record.operation, { jobId: attempt.jobId, locale: record.locale, ...(signal ? { signal } : {}) });
      if (hasExclusivePublication(record.operation) && result.type === "file" && result.outputUri === outputUris[0]) {
        attempt.ownedOutputUris.push(result.outputUri);
        if (result.publication) {
          attempt.ownedOutputPublications?.push({ uri: result.outputUri, evidence: clone(result.publication) });
        }
        await this.executions.save(record);
      }
      await this.validateResult(record.operation, result, outputUris, attempt.jobId, record.expectedOutput);
      if (record.operation.type === "measure-audio" && signal?.aborted) throw abortMarker();
      if (result.type === "file") attempt.effectiveProfile = clone(result.effectiveProfile);
      const latest = this.history.current;
      if ((record.projectBinding || record.mutation.type !== "none")
        && (latest.history.revision !== attempt.projectRevisionBefore || latest.history.headSnapshotId !== attempt.projectSnapshotBefore)) {
        throw new AttemptFailure("MEDIA_PROJECT_CONFLICT", "Project changed while media execution was active.");
      }
      assertProjectBinding(this.history, latest, record.projectBinding);

      const command = mutationCommand(record, result, attempt, this.clock);
      attempt.status = "committing";
      attempt.result = clone(result);
      record.status = "committing";
      await this.executions.save(record);
      if (signal?.aborted) throw abortMarker();
      const commitProject = this.history.current;
      if ((record.projectBinding || record.mutation.type !== "none")
        && (commitProject.history.revision !== attempt.projectRevisionBefore
          || commitProject.history.headSnapshotId !== attempt.projectSnapshotBefore)) {
        throw new AttemptFailure("MEDIA_PROJECT_CONFLICT", "Project changed before the canonical commit.");
      }
      assertProjectBinding(this.history, commitProject, record.projectBinding);
      if (command) {
        try {
          this.history.commit(command, record.actor);
        } catch (cause) {
          throw new AttemptFailure("MEDIA_PROJECT_COMMIT_FAILED", technicalMessage(cause));
        }
      }
      projectStateFinalized = true;

      const project = this.history.current;
      const entry = command ? this.history.entries.at(-1) : undefined;
      attempt.status = "succeeded";
      attempt.completedAt = this.clock();
      attempt.projectRevisionAfter = project.history.revision;
      if (project.history.headSnapshotId) attempt.projectSnapshotAfter = project.history.headSnapshotId;
      if (entry) attempt.projectJournalEntryId = entry.id;
      record.status = "succeeded";
      await this.executions.save(record);
      return { record: clone(record), project };
    } catch (cause) {
      if (projectStateFinalized) {
        throw new MediaApplicationError("MEDIA_RECOVERY_FAILED", record.locale, record.id, {}, cause);
      }
      const cancelled = isAbort(cause, signal);
      const failure = cause instanceof AttemptFailure ? cause : undefined;
      const code: MediaApplicationErrorCode = cancelled ? "MEDIA_OPERATION_CANCELLED" : failure?.code ?? "MEDIA_OPERATION_FAILED";
      const cleanup = hasExclusivePublication(record.operation)
        ? await this.cleanupPublished(record.operation, attempt.outputUris, attempt.ownedOutputPublications ?? [], attempt.preexistingOutputUris)
        : await this.cleanup(attempt.outputUris, attempt.preexistingOutputUris);
      attempt.removedPartialOutputUris.push(...cleanup.removed);
      attempt.cleanupFailedOutputUris.push(...cleanup.failed);
      attempt.status = cancelled ? "cancelled" : "failed";
      attempt.completedAt = this.clock();
      attempt.errorCode = code;
      attempt.technicalError = technicalMessage(cause);
      record.status = attempt.status;
      await this.executions.save(record);
      throw new MediaApplicationError(
        code,
        record.locale,
        record.id,
        failure?.parameter ? { outputUri: failure.parameter } : {},
        cause
      );
    }
  }

  private async validateResult(
    operation: MediaOperation,
    result: MediaOperationResult,
    outputUris: readonly string[],
    jobId: string,
    expectedOutput?: MediaOutputExpectation
  ): Promise<void> {
    if (operation.type === "measure-audio") {
      if (result.type !== "measure-audio" || Object.keys(result).length !== 2) throw new AttemptFailure("MEDIA_OPERATION_FAILED", "Media engine returned an incompatible measurement result.");
      validateAudioMeasurementReport(result.report, operation, jobId);
      return;
    }
    if (outputUris.length === 0) {
      const valid = (operation.type === "probe" && result.type === "probe")
        || (operation.type === "detect-silence" && result.type === "detect-silence");
      if (!valid) throw new AttemptFailure("MEDIA_OPERATION_FAILED", "Media engine returned an incompatible result.");
      return;
    }
    if (result.type !== "file" || result.outputUri !== outputUris[0]) {
      throw new AttemptFailure("MEDIA_OUTPUT_MISSING", "Media engine returned no matching file result.");
    }
    if (!await this.artifacts.exists(result.outputUri)) {
      throw new AttemptFailure("MEDIA_OUTPUT_MISSING", "Media engine output is absent from the artifact store.");
    }
    validateDeliveryPostcondition(operation, result);
    if (expectedOutput) {
      if (result.durationMs === undefined || Math.abs(result.durationMs - expectedOutput.durationMs) > expectedOutput.durationToleranceMs) {
        throw new AttemptFailure("MEDIA_OPERATION_FAILED", "Media output duration does not satisfy the application postcondition.");
      }
    }
  }

  private async cleanup(outputUris: readonly string[], preexisting: readonly string[]): Promise<{ removed: string[]; failed: string[] }> {
    const protectedUris = new Set(preexisting);
    for (const uri of this.history.retainedMediaUris()) protectedUris.add(uri);
    const removed: string[] = [];
    const failed: string[] = [];
    for (const uri of outputUris) {
      if (protectedUris.has(uri)) continue;
      try {
        if (await this.artifacts.kind(uri) === "missing") continue;
        await this.artifacts.remove(uri);
        if (await this.artifacts.exists(uri)) failed.push(uri);
        else removed.push(uri);
      } catch {
        failed.push(uri);
      }
    }
    return { removed, failed };
  }

  private async cleanupPublished(
    operation: MediaOperation,
    claimedUris: readonly string[],
    publications: readonly { uri: string; evidence: MediaPublicationEvidenceV1 }[],
    preexisting: readonly string[]
  ): Promise<{ removed: string[]; failed: string[] }> {
    const allowedUris = mediaOperationOutputUris(operation);
    const allowed = new Set(allowedUris);
    const evidenceIsBound = publications.every(({ uri }) => allowed.has(uri));
    const protectedUris = new Set(preexisting);
    for (const uri of this.history.retainedMediaUris()) protectedUris.add(uri);
    const removed: string[] = [];
    const failed: string[] = [];
    const evidencedUris = new Set(publications.filter(({ uri }) => allowed.has(uri)).map(({ uri }) => uri));
    for (const uri of allowedUris) {
      if (protectedUris.has(uri) || evidencedUris.has(uri)) continue;
      try {
        if (await this.artifacts.kind(uri) !== "missing") failed.push(uri);
      } catch {
        failed.push(uri);
      }
    }
    if (!evidenceIsBound || claimedUris.length !== allowedUris.length
      || claimedUris.some((uri, index) => uri !== allowedUris[index])) {
      for (const uri of allowedUris) {
        if (protectedUris.has(uri) || failed.includes(uri)) continue;
        try {
          if (await this.artifacts.kind(uri) !== "missing") failed.push(uri);
        } catch {
          failed.push(uri);
        }
      }
      return { removed, failed };
    }
    for (const publication of publications) {
      if (protectedUris.has(publication.uri)) continue;
      try {
        if (await this.artifacts.kind(publication.uri) === "missing") continue;
        if (!this.artifacts.matchesPublication
          || !await this.artifacts.matchesPublication(publication.uri, publication.evidence)) {
          failed.push(publication.uri);
          continue;
        }
        await this.artifacts.remove(publication.uri);
        if (await this.artifacts.exists(publication.uri)) failed.push(publication.uri);
        else removed.push(publication.uri);
      } catch {
        failed.push(publication.uri);
      }
    }
    return { removed, failed };
  }

  private async reconcileCleanupAfterRestart(
    record: MediaExecutionRecord,
    attempt: MediaExecutionAttempt
  ): Promise<{ removed: string[]; failed: string[] }> {
    if (hasExclusivePublication(record.operation)) {
      return this.cleanupPublished(
        record.operation,
        attempt.outputUris,
        attempt.ownedOutputPublications ?? [],
        attempt.preexistingOutputUris
      );
    }
    const protectedUris = new Set(attempt.preexistingOutputUris);
    for (const uri of this.history.retainedMediaUris()) protectedUris.add(uri);
    const failed: string[] = [];
    for (const uri of mediaOperationOutputUris(record.operation)) {
      if (protectedUris.has(uri)) continue;
      try {
        if (await this.artifacts.kind(uri) !== "missing") failed.push(uri);
      } catch {
        failed.push(uri);
      }
    }
    return { removed: [], failed };
  }
}

function snapshotExecutionRequest(
  request: MediaExecutionRequest,
  defaultLocale: "pt-BR" | "en-US",
  idGenerator: () => string
): Required<Pick<MediaExecutionRequest, "id" | "locale" | "operation" | "mutation" | "actor">>
  & Pick<MediaExecutionRequest, "projectBinding" | "expectedOutput"> {
  rejectUnexpectedKeys(request, ["id", "locale", "operation", "mutation", "actor", "projectBinding", "expectedOutput"], "media execution request");
  const id = request.id ?? idGenerator();
  if (typeof id !== "string" || id.trim().length === 0) throw new Error("Media execution id is invalid.");
  const locale = request.locale ?? defaultLocale;
  if (locale !== "pt-BR" && locale !== "en-US") throw new Error("Media execution locale is invalid.");
  const operation = clone(validateMediaOperation(request.operation));
  validateMutation(operation, request.mutation);
  validateProjectMutation(request.mutation);
  validateJournalActor(request.actor ?? { type: "user" });
  validateProjectBinding(request.projectBinding);
  validateOutputExpectation(request.expectedOutput, operation);
  return {
    id,
    locale,
    operation,
    mutation: clone(request.mutation),
    actor: clone(request.actor ?? { type: "user" }),
    ...(request.projectBinding ? { projectBinding: clone(request.projectBinding) } : {}),
    ...(request.expectedOutput ? { expectedOutput: clone(request.expectedOutput) } : {})
  };
}

function validateProjectBinding(binding: MediaProjectBinding | undefined): void {
  if (!binding) return;
  rejectUnexpectedKeys(binding, ["projectId", "projectRevision", "projectSnapshotId", "projectJournalEntryCount"], "project binding");
  if (typeof binding.projectId !== "string" || binding.projectId.trim().length === 0
    || !Number.isSafeInteger(binding.projectRevision) || binding.projectRevision < 0
    || typeof binding.projectSnapshotId !== "string" || binding.projectSnapshotId.trim().length === 0
    || !Number.isSafeInteger(binding.projectJournalEntryCount) || binding.projectJournalEntryCount < 0) {
    throw new Error("Invalid project binding.");
  }
}

function validateOutputExpectation(expectation: MediaOutputExpectation | undefined, operation: MediaOperation): void {
  if (!expectation) return;
  rejectUnexpectedKeys(expectation, ["durationMs", "durationToleranceMs"], "media output expectation");
  if (mediaOperationOutputUris(operation).length !== 1
    || !Number.isSafeInteger(expectation.durationMs) || expectation.durationMs <= 0
    || !Number.isSafeInteger(expectation.durationToleranceMs) || expectation.durationToleranceMs < 0) {
    throw new Error("Invalid media output expectation.");
  }
}

function assertProjectBinding(history: ProjectHistory, project: ProjectIR, binding: MediaProjectBinding | undefined): void {
  if (!binding) return;
  if (project.project.id !== binding.projectId
    || project.history.revision !== binding.projectRevision
    || project.history.headSnapshotId !== binding.projectSnapshotId
    || history.entries.length !== binding.projectJournalEntryCount) {
    throw new AttemptFailure("MEDIA_PROJECT_CONFLICT", "Project binding is stale.");
  }
}

function hasExclusivePublication(operation: MediaOperation): boolean {
  return operation.type === "render-audio-sequence" || operation.type === "mux-audio";
}

function validateMutation(operation: MediaOperation, mutation: MediaProjectMutation): void {
  if (operation.type === "render-audio-sequence") {
    if (mutation.type !== "none") throw new Error("Audio sequence PCM is a derived intermediate and must not mutate Project IR.");
    return;
  }
  const producesFile = mediaOperationOutputUris(operation).length > 0;
  if (producesFile === (mutation.type === "none")) throw new Error("File-producing media operations require a typed Project IR mutation.");
}

function validateProjectMutation(mutation: MediaProjectMutation): void {
  if (!isRecord(mutation) || typeof mutation.type !== "string") throw new Error("Project mutation is invalid.");
  if (mutation.type === "none") {
    rejectUnexpectedKeys(mutation, ["type"], "project mutation");
    return;
  }
  if (mutation.type === "export.add") {
    rejectUnexpectedKeys(mutation, ["type", "exportId", "presetId"], "project mutation");
    if (typeof mutation.exportId !== "string" || mutation.exportId.trim().length === 0
      || typeof mutation.presetId !== "string" || mutation.presetId.trim().length === 0) {
      throw new Error("Export mutation is invalid.");
    }
    return;
  }
  if (mutation.type === "source.add") {
    rejectUnexpectedKeys(mutation, ["type", "source"], "project mutation");
    if (!isRecord(mutation.source)) throw new Error("Source mutation is invalid.");
    rejectUnexpectedKeys(mutation.source, ["id", "kind", "displayName", "checksum", "extensions"], "source mutation");
    if (typeof mutation.source.id !== "string" || mutation.source.id.trim().length === 0
      || !["video", "audio", "image"].includes(String(mutation.source.kind))
      || typeof mutation.source.displayName !== "string" || mutation.source.displayName.trim().length === 0
      || (mutation.source.checksum !== undefined && typeof mutation.source.checksum !== "string")
      || (mutation.source.extensions !== undefined && !isRecord(mutation.source.extensions))) {
      throw new Error("Source mutation is invalid.");
    }
    return;
  }
  throw new Error("Project mutation type is invalid.");
}

function validateJournalActor(actor: JournalActor): void {
  if (!isRecord(actor)) throw new Error("Journal actor is invalid.");
  rejectUnexpectedKeys(actor, ["type", "id"], "journal actor");
  if (!new Set(["user", "agent", "system"]).has(String(actor.type))
    || (actor.id !== undefined && (typeof actor.id !== "string" || actor.id.trim().length === 0))) {
    throw new Error("Journal actor is invalid.");
  }
}

function prevalidateMutation(project: ProjectIR, record: MediaExecutionRecord, outputUri: string | undefined): void {
  if (record.mutation.type === "none") return;
  if (!outputUri) throw new AttemptFailure("MEDIA_INVALID_REQUEST", "Project mutation has no media output.");
  const provisional = mutationCommand(record, { type: "file", outputUri }, undefined, () => record.createdAt);
  if (!provisional) throw new AttemptFailure("MEDIA_INVALID_REQUEST", "Project mutation could not be resolved.");
  try {
    applyCommand(project, provisional, record.createdAt);
  } catch (cause) {
    throw new AttemptFailure("MEDIA_INVALID_REQUEST", technicalMessage(cause));
  }
}

function mutationCommand(
  record: MediaExecutionRecord,
  result: MediaOperationResult | { type: "file"; outputUri: string },
  attempt: MediaExecutionAttempt | undefined,
  clock: () => string
): EditCommand | undefined {
  if (record.mutation.type === "none") return undefined;
  if (result.type !== "file") throw new AttemptFailure("MEDIA_OUTPUT_MISSING", "Project mutation requires a file result.");
  if (record.mutation.type === "export.add") {
    const completedAt = clock();
    return {
      type: "export.add",
      export: {
        id: record.mutation.exportId,
        presetId: record.mutation.presetId,
        status: "completed",
        outputUri: result.outputUri,
        createdAt: record.createdAt,
        completedAt
      }
    };
  }
  const provenance = attempt?.provenance;
  return {
    type: "source.add",
    source: {
      id: record.mutation.source.id,
      kind: record.mutation.source.kind,
      uri: result.outputUri,
      displayName: record.mutation.source.displayName,
      ...("durationMs" in result && result.durationMs !== undefined ? { durationMs: result.durationMs } : {}),
      ...(record.mutation.source.checksum ? { checksum: record.mutation.source.checksum } : {}),
      extensions: {
        ...(record.mutation.source.extensions ?? {}),
        "cevra.media": {
          executionId: record.id,
          attempt: attempt?.number ?? 0,
          ...(provenance ? {
            engineId: provenance.engineId,
            engineVersion: provenance.engineVersion,
            engineApiVersion: provenance.engineApiVersion
          } : {}),
          ...(attempt?.effectiveProfile ? { effectiveProfile: attempt.effectiveProfile } : {})
        }
      }
    }
  };
}

export function mediaExecutionMutationApplied(record: MediaExecutionRecord, project: ProjectIR): boolean {
  const result = record.attempts.at(-1)?.result;
  const mutation = record.mutation;
  if (!result) return false;
  if (mutation.type === "none") return true;
  if (result.type !== "file") return false;
  if (mutation.type === "export.add") {
    return project.exports.some((item) => item.id === mutation.exportId && item.outputUri === result.outputUri && item.status === "completed");
  }
  return project.sources.some((source) => {
    const media = source.extensions?.["cevra.media"];
    return source.id === mutation.source.id
      && source.uri === result.outputUri
      && typeof media === "object"
      && media !== null
      && !Array.isArray(media)
      && (media as Record<string, unknown>).executionId === record.id;
  });
}

function committedEntry(record: MediaExecutionRecord, entries: ProjectHistory["entries"]): ProjectHistory["entries"][number] | undefined {
  return [...entries].reverse().find((entry) => {
    if (record.mutation.type === "none") return false;
    if (record.mutation.type === "export.add") {
      return entry.command.type === "export.add" && entry.command.export.id === record.mutation.exportId;
    }
    return entry.command.type === "source.add" && entry.command.source.id === record.mutation.source.id;
  });
}

function abortMarker(): Error {
  const error = new Error("Media operation aborted.");
  error.name = "AbortError";
  return error;
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof Error && error.name === "AbortError");
}

function technicalMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validateDeliveryPostcondition(operation: MediaOperation, result: Extract<MediaOperationResult, { type: "file" }>): void {
  if (!result.probe.hasVideo && !result.probe.hasAudio) throw new AttemptFailure("MEDIA_OUTPUT_MISSING", "Output contains no audio or video stream.");
  if (operation.type === "extract-frame") {
    if (!result.probe.hasVideo || result.probe.videoCodec?.toLowerCase() !== "png" || result.probe.hasAudio) {
      throw new AttemptFailure("MEDIA_OPERATION_FAILED", "Extracted frame does not satisfy the PNG output contract.");
    }
    return;
  }
  if (operation.type === "render-audio-sequence") {
    const expectedChannels = operation.outputChannelLayout === "mono" ? 1 : 2;
    const expectedSamples = operation.outputDurationMs * (AUDIO_SEQUENCE_SAMPLE_RATE / 1000);
    const expectedDataBytes = expectedSamples * expectedChannels * 4;
    if (result.probe.hasVideo || !result.probe.hasAudio
      || result.probe.audioCodec !== AUDIO_SEQUENCE_SAMPLE_FORMAT
      || result.probe.sampleRate !== AUDIO_SEQUENCE_SAMPLE_RATE
      || result.probe.channels !== expectedChannels
      || result.durationMs !== operation.outputDurationMs
      || result.effectiveProfile.container !== "wav"
      || result.effectiveProfile.audioCodec !== "pcm"
      || result.effectiveProfile.audioEncoder !== AUDIO_SEQUENCE_SAMPLE_FORMAT
      || result.audioSequence?.outputSampleCount !== expectedSamples
      || result.audioSequence.estimatedDataBytes !== expectedDataBytes
      || result.audioSequence.measuredDataBytes !== expectedDataBytes
      || result.audioSequence.distinctSourceCount !== operation.sources.length
      || result.audioSequence.itemCount !== operation.items.length
      || result.audioSequence.maximumSimultaneousItemCount !== maximumSimultaneousAudioItems(operation)
      || result.audioSequence.channelLayout !== operation.outputChannelLayout) {
      throw new AttemptFailure("MEDIA_OPERATION_FAILED", "Audio sequence output does not satisfy its float32/48 kHz/timing contract.");
    }
    return;
  }
  if (operation.type === "mux-audio" && operation.durationValidation) {
    const evidence = result.muxDuration;
    const expected = operation.durationValidation;
    if (!evidence
      || Math.abs(evidence.inputVideoDurationMs - expected.videoDurationMs) > expected.inputToleranceMs
      || Math.abs(evidence.inputAudioDurationMs - expected.audioDurationMs) > expected.inputToleranceMs
      || Math.abs(evidence.outputVideoDurationMs - expected.videoDurationMs) > expected.inputToleranceMs
      || Math.abs(evidence.outputAudioDurationMs - expected.audioDurationMs) > expected.outputAudioToleranceMs) {
      throw new AttemptFailure("MEDIA_OPERATION_FAILED", "Mux output does not satisfy its per-stream duration contract.");
    }
  }
  const delivery = resolvedDelivery(operation);
  if (!delivery) return;
  const actualVideo = normalizeVideoCodec(result.probe.videoCodec);
  const actualAudio = normalizeAudioCodec(result.probe.audioCodec);
  if (delivery.audioOnly && result.probe.hasVideo) throw new AttemptFailure("MEDIA_OPERATION_FAILED", "Audio-only output contains a video stream.");
  if (!delivery.audioOnly && !result.probe.hasVideo) throw new AttemptFailure("MEDIA_OPERATION_FAILED", "Output is missing its required video stream.");
  if (delivery.audioOnly && !result.probe.hasAudio) throw new AttemptFailure("MEDIA_OPERATION_FAILED", "Audio-only output is missing its audio stream.");
  if (delivery.videoCodec && delivery.videoCodec !== "copy" && actualVideo !== delivery.videoCodec) throw new AttemptFailure("MEDIA_OPERATION_FAILED", "Output video codec does not match resolved delivery.");
  if (result.probe.hasAudio && delivery.audioCodec !== "copy" && actualAudio !== delivery.audioCodec) throw new AttemptFailure("MEDIA_OPERATION_FAILED", "Output audio codec does not match resolved delivery.");
  if (result.effectiveProfile.container !== delivery.container || result.effectiveProfile.videoCodec !== actualVideo || result.effectiveProfile.audioCodec !== actualAudio) {
    throw new AttemptFailure("MEDIA_OPERATION_FAILED", "Effective encoder profile does not match verified output streams.");
  }
}

function maximumSimultaneousAudioItems(operation: Extract<MediaOperation, { type: "render-audio-sequence" }>): number {
  const events = operation.items.flatMap((item) => {
    const duration = item.sourceEndMs - item.sourceStartMs;
    return [{ at: item.timelineStartMs, delta: 1 }, { at: item.timelineStartMs + duration, delta: -1 }];
  }).sort((left, right) => left.at - right.at || left.delta - right.delta);
  let active = 0;
  let maximum = 0;
  for (const event of events) {
    active += event.delta;
    maximum = Math.max(maximum, active);
  }
  return maximum;
}

function resolvedDelivery(operation: MediaOperation) {
  switch (operation.type) {
    case "probe": case "detect-silence": case "extract-frame": case "render-audio-sequence": case "measure-audio": return undefined;
    case "transcode": return resolveTranscodeDelivery({ outputUri: operation.outputUri, ...(operation.container ? { container: operation.container } : {}), ...(operation.videoCodec ? { videoCodec: operation.videoCodec } : {}), ...(operation.audioCodec ? { audioCodec: operation.audioCodec } : {}), transformsVideo: operation.width !== undefined || operation.height !== undefined || operation.fps !== undefined });
    case "extract-audio": return resolveAudioDelivery(operation.outputUri, operation.audioCodec);
    case "volume": case "loudness-normalize": case "audio-fade": return resolveAudioMutationDelivery(operation.outputUri);
    case "mux-audio": { const container = resolveMediaContainer(operation.outputUri); const rule = MEDIA_DELIVERY_MATRIX[container]; return { container, audioOnly: false, videoCodec: "copy" as const, audioCodec: rule.defaultAudioCodec }; }
    default: return resolveStandardAvDelivery(operation.outputUri, operation.type === "trim" || operation.type === "concat");
  }
}

function defaultId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `media_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function rejectUnexpectedKeys(value: unknown, allowed: readonly string[], label: string): void {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  const accepted = new Set(allowed);
  const extras = Object.keys(value).filter((key) => !accepted.has(key));
  if (extras.length) throw new Error(`${label} contains unexpected fields: ${extras.sort().join(", ")}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
