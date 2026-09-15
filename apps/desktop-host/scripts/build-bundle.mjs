import { build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "dist", "desktop-host.cjs");
await mkdir(dirname(output), { recursive: true });
await build({
  entryPoints: [resolve(root, "dist", "main.js")],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  sourcemap: false,
  legalComments: "none",
  define: { "import.meta.url": "cevraImportMetaUrl" },
  banner: { js: 'const cevraImportMetaUrl = require("node:url").pathToFileURL(__filename).href;' }
});
await mkdir(resolve(root, "dist", "python"), { recursive: true });
await cp(
  resolve(root, "..", "..", "engines", "transcription", "python", "cevra_transcription_worker.py"),
  resolve(root, "dist", "python", "cevra_transcription_worker.py")
);
