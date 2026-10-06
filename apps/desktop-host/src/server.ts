import { JsonLineFramer } from "./framing.js";
import {
  DESKTOP_HOST_IDENTITY,
  DESKTOP_HOST_PROTOCOL_VERSION,
  DESKTOP_HOST_VERSION,
  MAX_JSONL_MESSAGE_BYTES,
  ProtocolValidationError,
  parseRequest,
  validateCancelParams,
  validateCheckpointParams,
  validateCloseParams,
  validateEditorialRevisionParams,
  validateIngestParams,
  validateNoParams,
  validateTranscriptionParams,
  validateVideoPreviewParams,
  validateManualClipParams, validateManualTrimParams,
  validateManualSequenceParams,
  validateManualExportParams,
  validateConformPreviewParams,
  type HostErrorPayload,
  type HostRequest,
  type HostResponse
} from "./protocol.js";
import type { DesktopSession } from "./session.js";

export interface ProtocolOutput {
  writeProtocolLine(line: string): void;
  writeLog(line: string): void;
  requestShutdown(): void;
}

export class DesktopHostProtocolServer {
  private readonly framer = new JsonLineFramer();
  private accepting = true;

  constructor(
    private readonly session: DesktopSession | null,
    private readonly output: ProtocolOutput,
    private readonly startupError?: unknown
  ) {}

  accept(chunk: Buffer): void {
    if (!this.accepting) return;
    try {
      for (const line of this.framer.push(chunk)) void this.handleLine(line);
    } catch (cause) {
      this.accepting = false;
      this.respond(errorResponse("invalid", {
        code: "HOST_MESSAGE_TOO_LARGE",
        message: `The desktop host message exceeds ${MAX_JSONL_MESSAGE_BYTES} bytes.`
      }));
      this.output.writeLog(cause instanceof Error ? cause.message : "Desktop host framing failure.");
      this.output.requestShutdown();
    }
  }

  finish(): void {
    if (!this.accepting) return;
    try {
      this.framer.finish();
    } catch (cause) {
      this.output.writeLog(cause instanceof Error ? cause.message : "Incomplete desktop host request.");
    }
  }

  async handleLine(line: string): Promise<void> {
    let request: HostRequest;
    try {
      request = parseRequest(line);
    } catch (cause) {
      const error = cause instanceof ProtocolValidationError
        ? cause
        : new ProtocolValidationError("HOST_MALFORMED_REQUEST", "The desktop host request is malformed.");
      this.respond(errorResponse(error.requestId, { code: error.code, message: error.message }));
      return;
    }

    try {
      const dispatched = await dispatch(this.session, request, this.startupError);
      this.respond({ protocolVersion: DESKTOP_HOST_PROTOCOL_VERSION, id: request.id, result: dispatched.result });
      if (dispatched.shutdown) {
        this.accepting = false;
        this.output.requestShutdown();
      }
    } catch (cause) {
      const code = safeCode(cause);
      this.respond(errorResponse(request.id, { code, message: safeMessage(code), ...safeDetails(cause, code) }));
    }
  }

  private respond(response: HostResponse): void {
    let encoded = JSON.stringify(response);
    if (Buffer.byteLength(encoded, "utf8") > MAX_JSONL_MESSAGE_BYTES) {
      encoded = JSON.stringify(errorResponse(response.id, {
        code: "HOST_RESPONSE_TOO_LARGE",
        message: "The desktop host response exceeded the protocol limit."
      }));
    }
    this.output.writeProtocolLine(`${encoded}\n`);
  }
}

async function dispatch(session: DesktopSession | null, request: HostRequest, startupError?: unknown): Promise<{ result: unknown; shutdown?: true }> {
  if (startupError && request.method !== "host.shutdown") throw startupError;
  switch (request.method) {
    case "host.hello":
      validateNoParams(request.params, request.id);
      return { result: { identity: DESKTOP_HOST_IDENTITY, version: DESKTOP_HOST_VERSION, protocolVersion: DESKTOP_HOST_PROTOCOL_VERSION } };
    case "host.status":
    case "project.snapshot":
      validateNoParams(request.params, request.id);
      return { result: requireSession(session).state() };
    case "host.shutdown":
      if (session) session.admitShutdown(validateCloseParams(request.params, request.id));
      else validateNoParams(request.params, request.id);
      return { result: { shuttingDown: true }, shutdown: true };
    case "host.prepareClose":
      return { result: requireSession(session).prepareClose(validateCloseParams(request.params, request.id)) };
    case "host.cancelClose":
      return { result: requireSession(session).cancelClose(validateCloseParams(request.params, request.id)) };
    case "project.checkpoint":
      return { result: await requireSession(session).retryCheckpoint(validateCheckpointParams(request.params, request.id)) };
    case "media.ingestLocal":
      return { result: await requireSession(session).ingestLocal(validateIngestParams(request.params, request.id)) };
    case "video.previewLocal":
      return { result: await requireSession(session).previewLocalVideo(validateVideoPreviewParams(request.params, request.id)) };
    case "video.prepareManualExport": {
      const params = validateManualExportParams(request.params, request.id);
      return { result: await requireSession(session).prepareManualExport(params.request, params.destinationUri) };
    }
    case "video.exportManualSequence": {
      const params = validateManualExportParams(request.params, request.id);
      return { result: await requireSession(session).exportManualSequence(params.request, params.destinationUri) };
    }
    case "video.previewManualSequenceConform":
      return { result: requireSession(session).previewManualSequenceConform(validateConformPreviewParams(request.params, request.id)) };
    case "video.editManualSequence":
      return { result: await requireSession(session).editManualVideoSequence(validateManualSequenceParams(request.params, request.id)) };
    case "video.createManualClip":
      return { result: await requireSession(session).createManualVideoClip(validateManualClipParams(request.params, request.id)) };
    case "video.trimManualClip":
      return { result: await requireSession(session).trimManualVideoClip(validateManualTrimParams(request.params, request.id)) };
    case "transcription.transcribeSource":
      return { result: await requireSession(session).transcribeSource(validateTranscriptionParams(request.params, request.id)) };
    case "history.undo":
      validateNoParams(request.params, request.id);
      return { result: await requireSession(session).undo() };
    case "editorial.snapshot":
      validateNoParams(request.params, request.id);
      return { result: requireSession(session).editorialState() };
    case "editorial.revise":
      return { result: requireSession(session).reviseEditorialDraft(validateEditorialRevisionParams(request.params, request.id)) };
    case "history.redo":
      validateNoParams(request.params, request.id);
      return { result: await requireSession(session).redo() };
    case "operation.cancel":
      return { result: requireSession(session).cancel(validateCancelParams(request.params, request.id).operationId) };
  }
}

function requireSession(session: DesktopSession | null): DesktopSession {
  if (!session) throw Object.assign(new Error("PROJECT_PERSISTENCE_UNAVAILABLE"), { code: "PROJECT_PERSISTENCE_UNAVAILABLE" });
  return session;
}

function errorResponse(id: string, error: HostErrorPayload): HostResponse {
  return { protocolVersion: DESKTOP_HOST_PROTOCOL_VERSION, id, error };
}

function safeCode(cause: unknown): string {
  if (typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string") {
    const code = cause.code;
    if (/^[A-Z][A-Z0-9_]{2,80}$/u.test(code)) return code;
  }
  if (cause instanceof Error && cause.name === "AbortError") return "OPERATION_CANCELLED";
  return "HOST_OPERATION_FAILED";
}

function safeMessage(code: string): string {
  switch (code) {
    case "MEDIA_UNAVAILABLE": return "Media import is unavailable.";
    case "TRANSCRIPTION_UNAVAILABLE": return "Transcription is unavailable.";
    case "OPERATION_DUPLICATE": return "The operation identifier is already active.";
    case "OPERATION_CANCELLED":
    case "MEDIA_OPERATION_CANCELLED":
    case "TRANSCRIPTION_APP_CANCELLED":
    case "TRANSCRIPTION_CANCELLED": return "The operation was cancelled.";
    case "PROJECT_PERSISTENCE_FAILED": return "The project changed in memory but could not be saved.";
    case "PROJECT_PERSISTENCE_CORRUPT": return "The saved project failed integrity validation.";
    case "PROJECT_PERSISTENCE_UNAVAILABLE": return "Project persistence is unavailable.";
    case "PROJECT_MUTATION_BUSY": return "Another canonical project mutation is still active.";
    case "PROJECT_CHECKPOINT_STALE": return "The checkpoint request no longer matches the current history.";
    case "PROJECT_CLOSE_UNSAVED": return "The current history is not confirmed saved. Keep the session open and retry saving.";
    case "PROJECT_CLOSE_BUSY": return "An operation is still active. Keep the session open until it settles.";
    case "PROJECT_CLOSE_PENDING": return "The close request has not settled. Canonical mutations remain blocked.";
    case "MANUAL_EXPORT_COMMITTED_ERROR": return "The export was committed; inspect the current saved state before any further action.";
    case "MANUAL_EXPORT_MEMORY_LIMIT": return "The export exceeded its renderer memory allowance.";
    case "MANUAL_EXPORT_DISK_LIMIT": return "The export exceeded its owned job file allowance.";
    case "MANUAL_EXPORT_RESOURCE_UNAVAILABLE": return "The export resource guard could not prove completion.";
    case "MANUAL_EXPORT_PUBLICATION_UNVERIFIED": return "The export publication is uncertain; its private ownership evidence was retained.";
    default: return "The desktop operation failed.";
  }
}

function safeDetails(cause: unknown, code: string): { details?: Record<string, unknown> } {
  if (!["PROJECT_PERSISTENCE_FAILED", "PROJECT_CHECKPOINT_STALE", "PROJECT_CLOSE_UNSAVED", "PROJECT_CLOSE_BUSY", "PROJECT_CLOSE_PENDING", "MANUAL_EXPORT_CLEANUP_FAILED", "MANUAL_EXPORT_PUBLICATION_UNVERIFIED", "MANUAL_EXPORT_COMMITTED_ERROR", "MANUAL_EXPORT_MEMORY_LIMIT", "MANUAL_EXPORT_DISK_LIMIT", "MANUAL_EXPORT_RESOURCE_UNAVAILABLE"].includes(code)) return {};
  if (typeof cause !== "object" || cause === null || !("details" in cause)) return {};
  const details = cause.details;
  if (typeof details !== "object" || details === null || Array.isArray(details) || !("state" in details)) return {};
  const state = details.state;
  if (typeof state !== "object" || state === null || Array.isArray(state)) return {};
  const safe: Record<string, unknown> = { state };
  if (["MANUAL_EXPORT_PUBLICATION_UNVERIFIED", "MANUAL_EXPORT_CLEANUP_FAILED"].includes(code)
    && "causeCode" in details && ["MANUAL_EXPORT_MEMORY_LIMIT", "MANUAL_EXPORT_DISK_LIMIT", "MANUAL_EXPORT_RESOURCE_UNAVAILABLE"].includes(String(details.causeCode))) {
    safe.causeCode = details.causeCode;
  }
  if (code === "MANUAL_EXPORT_COMMITTED_ERROR") {
    const fields = details as Record<string, unknown>;
    for (const key of ["executionId", "exportId", "destinationLabel"] as const) {
      const value = fields[key];
      if (typeof value === "string" && value.length <= 512 && !value.includes("\0")) safe[key] = value;
    }
    if ("checkpointStatus" in details && ["local-saved", "local-unsaved", "checkpoint-pending", "persistence-error"].includes(String(details.checkpointStatus))) safe.checkpointStatus = details.checkpointStatus;
  }
  return { details: safe };
}
