import type { ProjectHistory, ProjectIR } from "@cevra/project-ir";
import type { SourceContentIdentityPort } from "./source-technical-descriptor.js";
import { localSourceProbeInput } from "./local-source-uri.js";

export interface LocalSourceRelocationRequest {
  version: 1;
  sourceId: string;
  expectedSnapshotId: string;
  uri: string;
}
export type LocalSourceRelocationErrorCode = "SOURCE_RELOCATION_INVALID" | "SOURCE_RELOCATION_UNAVAILABLE"
  | "SOURCE_RELOCATION_STALE" | "SOURCE_RELOCATION_CONTENT_MISMATCH" | "SOURCE_RELOCATION_OFFLINE" | "SOURCE_RELOCATION_CANCELLED";
export class LocalSourceRelocationError extends Error {
  constructor(readonly code: LocalSourceRelocationErrorCode) { super(code); this.name = "LocalSourceRelocationError"; }
}
const fail = (code: LocalSourceRelocationErrorCode): never => { throw new LocalSourceRelocationError(code); };

export function validateLocalSourceRelocationRequest(value: unknown): LocalSourceRelocationRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("SOURCE_RELOCATION_INVALID");
  let request: LocalSourceRelocationRequest;
  try { request = structuredClone(value) as LocalSourceRelocationRequest; } catch { return fail("SOURCE_RELOCATION_INVALID"); }
  if (Object.keys(request).sort().join() !== "expectedSnapshotId,sourceId,uri,version" || request.version !== 1
    || ![request.sourceId, request.expectedSnapshotId].every(id => typeof id === "string" && id.length > 0 && id.length <= 1024 && !/[\u0000-\u001f\u007f]/u.test(id))
    || typeof request.uri !== "string" || request.uri.length > 8192 || !localSourceProbeInput(request.uri)) return fail("SOURCE_RELOCATION_INVALID");
  return request;
}

/** Changes only the locator of an already identified source; never probes or replaces its content. */
export class LocalSourceRelocationService {
  constructor(private readonly history: ProjectHistory, private readonly identity: SourceContentIdentityPort) {}

  async relocate(input: LocalSourceRelocationRequest, signal?: AbortSignal): Promise<{ project: ProjectIR; sourceId: string; changed: boolean }> {
    const request = validateLocalSourceRelocationRequest(input), before = this.history.current;
    const source = before.sources.find(item => item.id === request.sourceId), content = source?.technicalDescriptor?.content;
    const journal = this.history.journalIdentity;
    if (before.history.headSnapshotId !== request.expectedSnapshotId) return fail("SOURCE_RELOCATION_STALE");
    if (!source || !["video", "audio"].includes(source.kind) || !content || !localSourceProbeInput(source.uri)) return fail("SOURCE_RELOCATION_UNAVAILABLE");
    const assertCurrent = () => {
      if (signal?.aborted) fail("SOURCE_RELOCATION_CANCELLED");
      if (this.history.journalIdentity !== journal || this.history.current.history.headSnapshotId !== request.expectedSnapshotId) fail("SOURCE_RELOCATION_STALE");
    };
    assertCurrent();
    try {
      const captured = await this.identity.captureSource(request.uri, signal);
      if (captured.sizeBytes !== content.sizeBytes) return fail("SOURCE_RELOCATION_CONTENT_MISMATCH");
      const verified = await this.identity.identifySource(request.uri, captured, signal);
      if (verified.content.sha256 !== content.sha256 || verified.content.sizeBytes !== content.sizeBytes) return fail("SOURCE_RELOCATION_CONTENT_MISMATCH");
      if (await this.identity.checkSource(request.uri, verified.stamp, signal) !== "match") return fail("SOURCE_RELOCATION_CONTENT_MISMATCH");
    } catch (cause) {
      if (cause instanceof LocalSourceRelocationError) throw cause;
      const code = typeof cause === "object" && cause !== null && "code" in cause ? cause.code : undefined;
      if (signal?.aborted || code === "SOURCE_IDENTITY_CANCELLED" || cause instanceof Error && cause.name === "AbortError") return fail("SOURCE_RELOCATION_CANCELLED");
      if (code === "SOURCE_IDENTITY_CHANGED") return fail("SOURCE_RELOCATION_CONTENT_MISMATCH");
      return fail("SOURCE_RELOCATION_OFFLINE");
    }
    assertCurrent();
    if (localSourceProbeInput(source.uri) === localSourceProbeInput(request.uri)) return { project: this.history.current, sourceId: source.id, changed: false };
    // No suspension between final binding/cancellation checks and the typed History commit.
    const project = this.history.commit({ type: "source.relocate", version: 1, sourceId: source.id,
      expectedSourceUri: source.uri, uri: request.uri, expectedContent: { ...content } });
    return { project, sourceId: source.id, changed: true };
  }
}
