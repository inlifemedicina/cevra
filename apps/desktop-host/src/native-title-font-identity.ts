import { createHash } from "node:crypto";
import { readdirSync, lstatSync, realpathSync } from "node:fs";
import { release, version } from "node:os";
import { join } from "node:path";

/** Fresh file identities on the macOS sealed system font collection. No user font access.
 * The cache cannot survive a font replacement, collection change or OS build change.
 * Rasterizer reports additionally contain the exact SHA-256 of faces actually shaped.
 */
export function nativeTitleFontIdentity(): string {
  if (process.platform !== "darwin") return "native-coretext-unavailable";
  const root = "/System/Library/Fonts", hash = createHash("sha256").update(JSON.stringify([release(), version()]));
  function walk(directory: string) {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name), stamp = lstatSync(path, { bigint: true });
      if (stamp.isDirectory()) walk(path);
      else if (stamp.isFile() || stamp.isSymbolicLink()) {
        const resolved = realpathSync(path);
        if (!resolved.startsWith(root + "/")) throw new Error("MANUAL_TITLE_FONT_INVALID");
        const target = lstatSync(resolved, { bigint: true });
        hash.update(JSON.stringify([path, resolved, String(target.dev), String(target.ino), String(target.size), String(target.mtimeNs), String(target.ctimeNs)]));
      }
    }
  }
  walk(root); return hash.digest("hex");
}
