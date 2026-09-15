import { JsonLineFramer } from "./framing.js";
import {
  DESKTOP_HOST_IDENTITY,
  DESKTOP_HOST_PROTOCOL_VERSION,
  DESKTOP_HOST_VERSION,
  MAX_JSONL_MESSAGE_BYTES,
  ProtocolValidationError,
  parseRequest,
  validateCancelParams,
  validateIngestParams,
  validateNoParams,
  validateTranscriptionParams,
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
      validateNoParams(request.params, request.id);
      return { result: { shuttingDown: true }, shutdown: true };
    case "media.ingestLocal":
      return { result: await requireSession(session).ingestLocal(validateIngestParams(request.params, request.id)) };
    case "transcription.transcribeSource":
      return { result: await requireSession(session).transcribeSource(validateTranscriptionParams(request.params, request.id)) };
    case "history.undo":
      validateNoParams(request.params, request.id);
      return { result: await requireSession(session).undo() };
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
    default: return "The desktop operation failed.";
  }
}

function safeDetails(cause: unknown, code: string): { details?: Record<string, unknown> } {
  if (code !== "PROJECT_PERSISTENCE_FAILED") return {};
  if (typeof cause !== "object" || cause === null || !("details" in cause)) return {};
  const details = cause.details;
  if (typeof details !== "object" || details === null || Array.isArray(details) || !("state" in details)) return {};
  const state = details.state;
  return typeof state === "object" && state !== null && !Array.isArray(state)
    ? { details: { state } }
    : {};
}
