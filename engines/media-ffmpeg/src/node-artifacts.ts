import { lstat, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export class NodeMediaArtifactStore {
  async kind(uri: string): Promise<"missing" | "file" | "symlink" | "other"> {
    const path = localPath(uri);
    try {
      const metadata = await lstat(path);
      if (metadata.isSymbolicLink()) return "symlink";
      return metadata.isFile() ? "file" : "other";
    } catch (error) {
      if (errorCode(error) === "ENOENT") return "missing";
      throw error;
    }
  }

  async exists(uri: string): Promise<boolean> {
    return (await this.kind(uri)) !== "missing";
  }

  async remove(uri: string): Promise<void> {
    await unlink(localPath(uri));
  }
}

function localPath(uri: string): string {
  if (!uri.startsWith("file:")) return uri;
  const parsed = new URL(uri);
  if (parsed.protocol !== "file:") throw new Error("Media artifact URI is not a local file.");
  return fileURLToPath(parsed);
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}
