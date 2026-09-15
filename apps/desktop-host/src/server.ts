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

  constructor(private readonly session: DesktopSession, private readonly output: ProtocolOutput) {}

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
      const dispatched = await dispatch(this.session, request);
      this.respond({ protocolVersion: DESKTOP_HOST_PROTOCOL_VERSION, id: request.id, result: dispatched.result });
      if (dispatched.shutdown) {
        this.accepting = false;
        this.output.requestShutdown();
      }
    } catch (cause) {
      const code = safeCode(cause);
      this.respond(errorResponse(request.id, { code, message: safeMessage(code) }));
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

async function dispatch(session: DesktopSession, request: HostRequest): Promise<{ result: unknown; shutdown?: true }> {
  switch (request.method) {
    case "host.hello":
      validateNoParams(request.params, request.id);
      return { result: { identity: DESKTOP_HOST_IDENTITY, version: DESKTOP_HOST_VERSION, protocolVersion: DESKTOP_HOST_PROTOCOL_VERSION } };
    case "host.status":
    case "project.snapshot":
      validateNoParams(request.params, request.id);
      return { result: session.state() };
    case "host.shutdown":
      validateNoParams(request.params, request.id);
      return { result: { shuttingDown: true }, shutdown: true };
    case "media.ingestLocal":
      return { result: await session.ingestLocal(validateIngestParams(request.params, request.id)) };
    case "transcription.transcribeSource":
      return { result: await session.transcribeSource(validateTranscriptionParams(request.params, request.id)) };
    case "history.undo":
      validateNoParams(request.params, request.id);
      return { result: session.undo() };
    case "history.redo":
      validateNoParams(request.params, request.id);
      return { result: session.redo() };
    case "operation.cancel":
      return { result: session.cancel(validateCancelParams(request.params, request.id).operationId) };
  }
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
    default: return "The desktop operation failed.";
  }
}
