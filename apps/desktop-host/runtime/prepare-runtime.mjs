import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { chmod, copyFile, cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { get } from "node:https";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const runtimeRoot = resolve(dirname(fileURLToPath(import.meta.url)));
const hostRoot = resolve(runtimeRoot, "..");
const repositoryRoot = resolve(hostRoot, "..", "..");
const inventory = JSON.parse(await readFile(resolve(runtimeRoot, "versions.json"), "utf8"));
const targetName = argument("--target") ?? platformTarget();
const target = inventory.targets[targetName];
if (!target) throw new Error(`Unsupported desktop Node runtime target: ${targetName}.`);
const binaryOutput = resolve(repositoryRoot, "apps", "desktop", "src-tauri", "binaries", `cevra-node-${target.rustTarget}`);
const requestedOutput = argument("--output-binary");
if (requestedOutput && resolve(requestedOutput) !== binaryOutput) {
  throw new Error("The private Node output path must be the fixed Tauri external-binary path.");
}

const temporaryRoot = await mkdtemp(resolve(tmpdir(), "cevra-node-runtime-"));
try {
  const archivePath = resolve(temporaryRoot, basename(target.archive));
  await download(target.url, archivePath);
  const archiveDigest = await sha256(archivePath);
  if (archiveDigest !== target.sha256) throw new Error(`Node archive SHA-256 mismatch for ${targetName}.`);
  const extractionRoot = resolve(temporaryRoot, "extract");
  await mkdir(extractionRoot);
  const extraction = spawnSync("tar", ["-xzf", archivePath, "-C", extractionRoot], { stdio: "inherit" });
  if (extraction.status !== 0) throw new Error("Official Node archive extraction failed.");
  const distributionRoot = resolve(extractionRoot, target.archive.replace(/\.tar\.gz$/u, ""));
  const nodeInput = resolve(distributionRoot, "bin", "node");
  const metadata = await stat(nodeInput);
  if (!metadata.isFile()) throw new Error("Prepared Node executable is not a regular file.");
  await mkdir(dirname(binaryOutput), { recursive: true });
  const stagedBinary = `${binaryOutput}.tmp`;
  await copyFile(nodeInput, stagedBinary);
  await chmod(stagedBinary, 0o755);
  const executableDigest = await sha256(stagedBinary);
  if (executableDigest !== target.executableSha256) {
    throw new Error(`Node executable SHA-256 mismatch for ${targetName}.`);
  }
  await rename(stagedBinary, binaryOutput);
  await mkdir(resolve(hostRoot, "dist"), { recursive: true });
  await cp(resolve(distributionRoot, "LICENSE"), resolve(hostRoot, "dist", "node-runtime-LICENSE.txt"));
  const manifest = {
    format: inventory.format,
    formatVersion: inventory.formatVersion,
    nodeVersion: inventory.nodeVersion,
    target: targetName,
    archiveUrl: target.url,
    archiveSha256: archiveDigest,
    executableSha256: executableDigest,
    preparedBinaryName: `cevra-node-${target.rustTarget}`
  };
  await writeFile(resolve(hostRoot, "dist", "node-runtime-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(manifest)}\n`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function platformTarget() {
  if (process.platform === "darwin" && process.arch === "arm64") return "darwin-arm64";
  if (process.platform === "linux" && process.arch === "x64") return "linux-x64";
  throw new Error(`No private Node runtime is pinned for ${process.platform}-${process.arch}.`);
}

async function download(url, destination) {
  await new Promise((resolvePromise, reject) => {
    const request = get(url, { headers: { "User-Agent": "CEVRA-runtime-preparer/1" } }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        download(new URL(response.headers.location, url).toString(), destination).then(resolvePromise, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Node runtime download failed with HTTP ${response.statusCode ?? "unknown"}.`));
        return;
      }
      const output = createWriteStream(destination, { flags: "wx" });
      response.pipe(output);
      output.on("finish", () => output.close(resolvePromise));
      output.on("error", reject);
      response.on("error", reject);
    });
    request.on("error", reject);
  });
}

async function sha256(file) {
  const digest = createHash("sha256");
  digest.update(await readFile(file));
  return digest.digest("hex");
}
