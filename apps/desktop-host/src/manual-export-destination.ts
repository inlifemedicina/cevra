import { constants } from "node:fs";
import { access, chmod, lstat, mkdtemp, realpath, rm, statfs } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { manualExportError, type ExportDestinationPreparationPort } from "@cevra/application";
import type { MediaPublicationEvidenceV1 } from "@cevra/contracts";
import { NodeMediaArtifactStore } from "@cevra/media-ffmpeg";

type Destination = Readonly<{ label: string; availableBytes: number }>;
type DirectoryStamp = { path: string; device: bigint; inode: bigint };

/** Native-picked path only. Read-only checks neither reserve bytes nor prove future publication. */
export class NativeManualExportDestination implements ExportDestinationPreparationPort {
  private readonly issued = new WeakMap<Destination, { destination: DirectoryStamp; temporary: DirectoryStamp; path: string }>();
  private readonly issuedOutputUris = new Set<string>();
  constructor(private readonly uri: string, private readonly options: { temporaryRoot?: string } = {}) {}

  /** Trusted Host only. A workspace is never accepted from the WebView. */
  async createOwnedWorkspace(signal?: AbortSignal): Promise<NativeManualExportWorkspace> {
    signal?.throwIfAborted();
    const parent = await directoryStamp(dirname(localPath(this.uri)));
    await absent(join(parent.path, basename(localPath(this.uri))));
    return NativeManualExportWorkspace.create(parent, signal);
  }

  resolveOutputUri(destination: Destination): string {
    const issued = this.issued.get(destination);
    if (!issued) throw manualExportError("MANUAL_EXPORT_DESTINATION_INVALID");
    return issued.path;
  }

  /** Trusted recovery binding, never an IPC path lookup. */
  ownsOutputUri(uri: string): boolean { return this.issuedOutputUris.has(uri); }

  /** Publication replaces the absent-file guard only after the trusted worker returns ownership evidence. */
  async revalidatePublication(destination: Destination, publication: MediaPublicationEvidenceV1, signal?: AbortSignal): Promise<void> {
    const issued = this.issued.get(destination);
    if (!issued) throw manualExportError("MANUAL_EXPORT_DESTINATION_INVALID");
    signal?.throwIfAborted();
    await assertDirectory(issued.destination);
    if (!await new NodeMediaArtifactStore().matchesPublication(issued.path, publication)) {
      throw manualExportError("MANUAL_EXPORT_DESTINATION_CHANGED");
    }
    signal?.throwIfAborted();
  }

  async prepare(requiredBytes: number, signal?: AbortSignal): Promise<Destination> {
    signal?.throwIfAborted();
    if (!Number.isSafeInteger(requiredBytes) || requiredBytes < 0) throw manualExportError("MANUAL_EXPORT_DESTINATION_INVALID");
    const picked = localPath(this.uri), name = basename(picked);
    if (!isAbsolute(picked) || !name.toLowerCase().endsWith(".mp4") || name.length > 255 || name.includes("\0")) {
      throw manualExportError("MANUAL_EXPORT_DESTINATION_INVALID");
    }
    const destination = await directoryStamp(dirname(picked));
    const temporary = await directoryStamp(this.options.temporaryRoot ?? tmpdir());
    const path = join(destination.path, name);
    await absent(path);
    const destinationBytes = await available(destination.path);
    const temporaryBytes = await available(temporary.path);
    if (temporaryBytes < requiredBytes || destinationBytes < 1) throw manualExportError("MANUAL_EXPORT_NO_SPACE");
    signal?.throwIfAborted();
    const result = Object.freeze({ label: name, availableBytes: Math.min(destinationBytes, temporaryBytes) });
    this.issued.set(result, { destination, temporary, path });
    this.issuedOutputUris.add(path);
    await this.revalidate(result, requiredBytes, signal);
    return result;
  }

  async revalidate(destination: Destination, requiredBytes: number, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    const issued = this.issued.get(destination);
    if (!issued || !Number.isSafeInteger(requiredBytes) || requiredBytes < 0) throw manualExportError("MANUAL_EXPORT_DESTINATION_INVALID");
    for (const stamp of [issued.destination, issued.temporary]) {
      const current = await directoryStamp(stamp.path);
      if (current.path !== stamp.path || current.device !== stamp.device || current.inode !== stamp.inode) throw manualExportError("MANUAL_EXPORT_DESTINATION_CHANGED");
    }
    await absent(issued.path);
    if (await available(issued.temporary.path) < requiredBytes || await available(issued.destination.path) < 1) throw manualExportError("MANUAL_EXPORT_NO_SPACE");
    signal?.throwIfAborted();
  }
}

/** Private, same-filesystem job tree. Removal requires its captured directory identities; the caller first proves worker settlement. */
export class NativeManualExportWorkspace {
  private removed = false;
  private constructor(readonly uri: string, private readonly root: DirectoryStamp, private readonly parent: DirectoryStamp) {}

  static async create(parent: DirectoryStamp, signal?: AbortSignal): Promise<NativeManualExportWorkspace> {
    await assertDirectory(parent);
    signal?.throwIfAborted();
    const path = await mkdtemp(join(parent.path, ".cevra-export-"));
    const metadata = await lstat(path, { bigint: true });
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw manualExportError("MANUAL_EXPORT_DESTINATION_CHANGED");
    const root = { path, device: metadata.dev, inode: metadata.ino };
    const workspace = new NativeManualExportWorkspace(path, root, parent);
    try {
      // mkdtemp creates a private directory; keep its mode explicit before any worker sees it.
      await chmod(path, 0o700);
      if (root.device !== parent.device) throw manualExportError("MANUAL_EXPORT_DESTINATION_CHANGED");
      await workspace.revalidate(signal);
    }
    catch (primary) {
      try { await workspace.remove(); } catch (cleanupError) { attachCleanupError(primary, cleanupError); }
      throw primary;
    }
    return workspace;
  }

  async revalidate(signal?: AbortSignal): Promise<void> {
    if (this.removed) throw manualExportError("MANUAL_EXPORT_DESTINATION_CHANGED");
    signal?.throwIfAborted();
    await assertDirectory(this.parent);
    await assertDirectory(this.root);
    signal?.throwIfAborted();
  }

  async remove(): Promise<void> {
    if (this.removed) return;
    await this.revalidate();
    await rm(this.uri, { recursive: true });
    this.removed = true;
  }

  /** An account link plus a surviving destination needs publication proof
   * before the only retained ownership evidence may be removed. */
  async hasUnsettledPublication(outputUri: string): Promise<boolean> {
    await this.revalidate();
    try { await lstat(join(this.uri, "published-account.mp4")); }
    catch (cause) { if (missing(cause)) return false; throw cause; }
    try { await lstat(outputUri); return true; }
    catch (cause) { if (missing(cause)) return false; throw cause; }
  }
}

function missing(cause: unknown): boolean { return !!cause && typeof cause === "object" && "code" in cause && cause.code === "ENOENT"; }

async function assertDirectory(expected: DirectoryStamp): Promise<void> {
  const actual = await directoryStamp(expected.path);
  if (actual.path !== expected.path || actual.device !== expected.device || actual.inode !== expected.inode) {
    throw manualExportError("MANUAL_EXPORT_DESTINATION_CHANGED");
  }
}
function attachCleanupError(primary: unknown, cleanupError: unknown): void {
  if (primary && typeof primary === "object") Object.defineProperty(primary, "cleanupError", { value: cleanupError, configurable: true });
}

function localPath(uri: string): string {
  try {
    if (typeof uri !== "string" || !uri || uri.includes("\0")) throw Error();
    const path = uri.startsWith("file:") ? fileURLToPath(uri) : uri;
    if (!isAbsolute(path)) throw Error();
    return path;
  } catch { throw manualExportError("MANUAL_EXPORT_DESTINATION_INVALID"); }
}
async function directoryStamp(path: string): Promise<DirectoryStamp> {
  try {
    const canonical = await realpath(path), metadata = await lstat(canonical, { bigint: true });
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw Error();
    await access(canonical, constants.W_OK);
    return { path: canonical, device: metadata.dev, inode: metadata.ino };
  } catch { throw manualExportError("MANUAL_EXPORT_DESTINATION_UNAVAILABLE"); }
}
async function absent(path: string): Promise<void> {
  try { await lstat(path); }
  catch (cause) {
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "ENOENT") return;
    throw manualExportError("MANUAL_EXPORT_DESTINATION_UNAVAILABLE");
  }
  // Includes regular old outputs, directories, dangling symlinks and aliases to originals.
  throw manualExportError("MANUAL_EXPORT_DESTINATION_EXISTS");
}
async function available(path: string): Promise<number> {
  try {
    const info = await statfs(path, { bigint: true }), bytes = info.bavail * info.bsize;
    if (bytes < 0n) throw Error();
    return Number(bytes > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : bytes);
  } catch { throw manualExportError("MANUAL_EXPORT_DESTINATION_UNAVAILABLE"); }
}
