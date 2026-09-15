import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import type { TranscriptionExecutionIdentity } from "@cevra/contracts";
import {
  FASTER_WHISPER_VERSION,
  TRANSCRIPTION_PROTOCOL_VERSION,
  type FasterWhisperProfile,
  type SupportedTranscriptionModelId
} from "./types.js";

export const TRANSCRIPTION_RESULT_NORMALIZATION_VERSION = "transcription-result-v1" as const;
export const TRANSCRIPTION_LANGUAGE_DETECTION_POLICY_VERSION = "faster-whisper-auto-v1" as const;
export const TRANSCRIPTION_RUNTIME_PIPELINE_VERSION =
  "faster-whisper-1.2.1+ctranslate2-4.8.2+pyav-18.1.0+cevra-normalization-v1" as const;
const REVISION = /^[0-9a-f]{40,64}$/u;
const MAX_MODEL_FILES = 512;

interface ModelFingerprint {
  revision: string;
  digest: `sha256:${string}`;
  detector: string;
}

interface ResolvedModelDirectory { directory: string; artifactRoot: string; revision: string }

export class FasterWhisperModelIdentityResolver {
  private memo: ModelFingerprint | undefined;

  constructor(private readonly profile: FasterWhisperProfile, private readonly modelId: SupportedTranscriptionModelId) {}

  async describe(signal?: AbortSignal): Promise<TranscriptionExecutionIdentity | undefined> {
    try {
      const resolved = await resolveModelDirectory(this.profile, this.modelId);
      if (!resolved) return undefined;
      const files = await inventoryFiles(resolved.directory, resolved.artifactRoot, signal);
      const detector = files.map((file) => `${file.path}\0${file.size}\0${file.mtimeMs}`).join("\n");
      let fingerprint = this.memo;
      if (!fingerprint || fingerprint.revision !== resolved.revision || fingerprint.detector !== detector) {
        const manifest: string[] = [];
        for (const file of files) {
          throwIfAborted(signal);
          manifest.push(`${file.path}\0${file.size}\0${await hashFile(file.absolute, signal)}`);
        }
        fingerprint = {
          revision: resolved.revision,
          detector,
          digest: `sha256:${createHash("sha256").update(manifest.join("\n"), "utf8").digest("hex")}`
        };
        this.memo = fingerprint;
      }
      return {
        engineId: "cevra.transcription.faster-whisper",
        engineVersion: FASTER_WHISPER_VERSION,
        engineApiVersion: 1,
        workerProtocolVersion: TRANSCRIPTION_PROTOCOL_VERSION,
        modelId: `Systran/faster-whisper-${this.modelId}`,
        resultModelId: this.modelId,
        modelRevision: fingerprint.revision,
        modelArtifactDigest: fingerprint.digest,
        languageDetectionPolicyVersion: TRANSCRIPTION_LANGUAGE_DETECTION_POLICY_VERSION,
        devicePolicy: this.profile.device ?? "cpu",
        effectiveDevice: this.profile.device ?? "cpu",
        computeType: this.profile.computeType ?? "int8",
        task: "transcribe",
        resultNormalizationVersion: TRANSCRIPTION_RESULT_NORMALIZATION_VERSION,
        runtimePipelineVersion: TRANSCRIPTION_RUNTIME_PIPELINE_VERSION
      };
    } catch (cause) {
      if (signal?.aborted || (cause instanceof Error && cause.name === "AbortError")) throw abortError(signal?.reason ?? cause);
      return undefined;
    }
  }
}

async function resolveModelDirectory(profile: FasterWhisperProfile, modelId: SupportedTranscriptionModelId): Promise<ResolvedModelDirectory | undefined> {
  const root = await realpath(profile.modelCacheDir);
  const repository = `models--Systran--faster-whisper-${modelId}`;
  for (const repositoryRoot of [join(root, "hub", repository), join(root, repository)]) {
    const snapshotRoot = join(repositoryRoot, "snapshots");
    let revision: string | undefined;
    try {
      const ref = (await readFile(join(repositoryRoot, "refs", "main"), "utf8")).trim();
      if (REVISION.test(ref)) revision = ref;
    } catch { /* a single exact snapshot is also provable */ }
    if (!revision) {
      try {
        const snapshots = (await readdir(snapshotRoot, { withFileTypes: true }))
          .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && REVISION.test(entry.name));
        if (snapshots.length === 1) revision = snapshots[0]!.name;
      } catch { /* not a snapshot layout */ }
    }
    if (revision) {
      const directory = resolve(snapshotRoot, revision);
      const actual = await realpath(directory);
      if (actual === directory || actual.startsWith(`${snapshotRoot}${sep}`)) return { directory: actual, artifactRoot: await realpath(repositoryRoot), revision };
    }
  }
  if (!profile.trustedModelRevision || !REVISION.test(profile.trustedModelRevision)) return undefined;
  return { directory: root, artifactRoot: root, revision: profile.trustedModelRevision };
}

async function inventoryFiles(root: string, artifactRoot: string, signal?: AbortSignal): Promise<Array<{ path: string; absolute: string; size: number; mtimeMs: number }>> {
  const output: Array<{ path: string; absolute: string; size: number; mtimeMs: number }> = [];
  async function walk(directory: string): Promise<void> {
    throwIfAborted(signal);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) {
        const metadata = await lstat(absolute);
        if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Model artifact changed during inventory.");
        output.push({ path: relative(root, absolute).split(sep).join("/"), absolute, size: metadata.size, mtimeMs: metadata.mtimeMs });
        if (output.length > MAX_MODEL_FILES) throw new Error("Model artifact inventory is too large.");
      } else if (entry.isSymbolicLink()) {
        const target = await realpath(absolute);
        if (target !== artifactRoot && !target.startsWith(`${artifactRoot}${sep}`)) throw new Error("Model artifact symlink escapes its trusted repository.");
        const metadata = await lstat(target);
        if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Model artifact symlink target is invalid.");
        output.push({ path: relative(root, absolute).split(sep).join("/"), absolute: target, size: metadata.size, mtimeMs: metadata.mtimeMs });
        if (output.length > MAX_MODEL_FILES) throw new Error("Model artifact inventory is too large.");
      } else throw new Error("Model artifact is not a regular file.");
    }
  }
  await walk(root);
  if (output.length === 0) throw new Error("Model artifact inventory is empty.");
  return output.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

async function hashFile(path: string, signal?: AbortSignal): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(path, { highWaterMark: 1024 * 1024, ...(signal ? { signal } : {}) });
  for await (const chunk of stream) {
    throwIfAborted(signal);
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

function throwIfAborted(signal?: AbortSignal): void { if (signal?.aborted) throw abortError(signal.reason); }
function abortError(cause?: unknown): Error { return Object.assign(new Error("Model fingerprinting was cancelled.", { cause }), { name: "AbortError" }); }
