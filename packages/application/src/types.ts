import type { EffectiveMediaProfile, EngineIdentity, MediaOperation, MediaOperationResult, MediaPublicationEvidenceV1 } from "@cevra/contracts";
import type { ExtensionMap, JournalActor, ProjectIR, SourceKind } from "@cevra/project-ir";

export type MediaExecutionStatus = "requested" | "running" | "committing" | "succeeded" | "failed" | "cancelled" | "interrupted";

export type MediaApplicationErrorCode =
  | "MEDIA_OPERATION_CANCELLED"
  | "MEDIA_OPERATION_INTERRUPTED"
  | "MEDIA_OPERATION_FAILED"
  | "MEDIA_OUTPUT_EXISTS"
  | "MEDIA_OUTPUT_MISSING"
  | "MEDIA_OPERATION_NOT_FOUND"
  | "MEDIA_OPERATION_NOT_RETRYABLE"
  | "MEDIA_PROJECT_CONFLICT"
  | "MEDIA_INVALID_REQUEST"
  | "MEDIA_PROJECT_COMMIT_FAILED"
  | "MEDIA_RECOVERY_FAILED"
  | "MEDIA_INPUT_ARTIFACT_CHANGED"
  | "SOURCE_CONTENT_CHANGED"
  | "SOURCE_OFFLINE"
  | "SOURCE_VERIFICATION_UNAVAILABLE";

export type MediaProjectMutation =
  | { type: "none" }
  | {
      type: "source.add";
      source: {
        id: string;
        kind: SourceKind;
        displayName: string;
        checksum?: string;
        extensions?: ExtensionMap;
      };
    }
  | { type: "export.add"; exportId: string; presetId: string };

export interface MediaExecutionProvenance {
  engineId: string;
  engineVersion: string;
  engineApiVersion: number;
  engineDisplayName: string;
}

export interface MediaProjectBinding {
  projectId: string;
  projectRevision: number;
  projectSnapshotId: string;
  projectJournalEntryCount: number;
}

export interface MediaOutputExpectation {
  durationMs: number;
  durationToleranceMs: number;
}

export interface MediaOwnedPublication {
  uri: string;
  evidence: MediaPublicationEvidenceV1;
}

export interface MediaExecutionAttempt {
  number: number;
  jobId: string;
  status: MediaExecutionStatus;
  requestedAt: string;
  startedAt?: string;
  completedAt?: string;
  outputUris: string[];
  preexistingOutputUris: string[];
  ownedOutputUris: string[];
  ownedOutputPublications?: MediaOwnedPublication[];
  removedPartialOutputUris: string[];
  cleanupFailedOutputUris: string[];
  projectRevisionBefore: number;
  projectSnapshotBefore?: string;
  projectRevisionAfter?: number;
  projectSnapshotAfter?: string;
  projectJournalEntryId?: string;
  result?: MediaOperationResult;
  provenance?: MediaExecutionProvenance;
  effectiveProfile?: EffectiveMediaProfile;
  errorCode?: MediaApplicationErrorCode;
  technicalError?: string;
}

export interface MediaExecutionRecord {
  id: string;
  projectId: string;
  locale: "pt-BR" | "en-US";
  operation: MediaOperation;
  mutation: MediaProjectMutation;
  actor: JournalActor;
  projectBinding?: MediaProjectBinding;
  expectedOutput?: MediaOutputExpectation;
  status: MediaExecutionStatus;
  createdAt: string;
  attempts: MediaExecutionAttempt[];
}

export type MediaExecutionIntentStatus =
  | "requested"
  | "audio-running"
  | "audio-succeeded"
  | "mux-running"
  | "application-committed"
  | "durable-succeeded"
  | "interrupted"
  | "recovery-incomplete";

export interface MediaExecutionIntentV1 {
  version: 1;
  id: string;
  kind: "resolved-audio-plan";
  projectId: string;
  projectBinding: MediaProjectBinding;
  status: MediaExecutionIntentStatus;
  childExecutionIds: {
    audio: string;
    mux: string;
  };
  exportIntent: {
    exportId: string;
    presetId: string;
    expectedOutputUri: string;
  };
  createdAt: string;
  updatedAt: string;
  reconciledAt?: string;
  cleanupUncertainUris?: string[];
}

export interface MediaExecutionRequest {
  id?: string;
  locale?: "pt-BR" | "en-US";
  operation: MediaOperation;
  mutation: MediaProjectMutation;
  actor?: JournalActor;
  projectBinding?: MediaProjectBinding;
  expectedOutput?: MediaOutputExpectation;
}

export interface MediaExecutionOutcome {
  record: MediaExecutionRecord;
  project: ProjectIR;
}

export interface MediaRecoveryResult {
  executionId: string;
  status: MediaExecutionStatus;
  errorCode?: MediaApplicationErrorCode;
}

export function provenanceFrom(identity: EngineIdentity): MediaExecutionProvenance {
  return {
    engineId: identity.id,
    engineVersion: identity.version,
    engineApiVersion: identity.apiVersion,
    engineDisplayName: identity.displayName
  };
}
