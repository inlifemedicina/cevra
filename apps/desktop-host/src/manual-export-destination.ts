import { constants } from "node:fs";
import { access, lstat, realpath, statfs } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { manualExportError, type ExportDestinationPreparationPort } from "@cevra/application";

type Destination = Readonly<{ label: string; availableBytes: number }>;
type DirectoryStamp = { path: string; device: bigint; inode: bigint };

/** Native-picked path only. Read-only checks neither reserve bytes nor prove future publication. */
export class NativeManualExportDestination implements ExportDestinationPreparationPort {
  private readonly issued = new WeakMap<Destination, { destination: DirectoryStamp; temporary: DirectoryStamp; path: string }>();
  constructor(private readonly uri: string, private readonly options: { temporaryRoot?: string } = {}) {}

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
