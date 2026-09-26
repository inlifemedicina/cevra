import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, realpath } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { TranscriptionExecutionIdentity } from "@cevra/contracts";
import {
  FASTER_WHISPER_VERSION,
  TRANSCRIPTION_PROTOCOL_VERSION,
  type FasterWhisperProfile,
  type SupportedTranscriptionModelId
} from "./types.js";
import {
  isExactFasterWhisperRevision,
  resolveLocalFasterWhisperModel
} from "./model-selection.js";

export const TRANSCRIPTION_RESULT_NORMALIZATION_VERSION = "transcription-result-v1" as const;
export const TRANSCRIPTION_LANGUAGE_DETECTION_POLICY_VERSION = "faster-whisper-auto-v1" as const;
export const TRANSCRIPTION_RUNTIME_PIPELINE_VERSION =
  "faster-whisper-1.2.1+ctranslate2-4.8.2+pyav-18.1.0+cevra-normalization-v1" as const;
const MAX_MODEL_FILES = 512;

interface ModelFingerprint {
  revision: string;
  digest: `sha256:${string}`;
  detector: string | undefined;
}

export interface FasterWhisperModelIdentityResolverOptions {
  /** Test/diagnostic seam invoked only when an artifact's bytes are cryptographically rehashed. */
  onArtifactHashed?: (relativePath: string) => void;
}

export class FasterWhisperModelIdentityResolver {
  private memo: ModelFingerprint | undefined;

  constructor(
    private readonly profile: FasterWhisperProfile,
    private readonly modelId: SupportedTranscriptionModelId,
    private readonly options: FasterWhisperModelIdentityResolverOptions = {}
  ) {}

  async describe(signal?: AbortSignal): Promise<TranscriptionExecutionIdentity | undefined> {
    try {
      if (this.profile.allowModelDownload) return undefined;
      if (this.profile.device === "auto" || this.profile.computeType === "default") return undefined;
      const selected = await resolveLocalFasterWhisperModel(this.profile, this.modelId);
      if (!selected) return undefined;
      const revision = selected.kind === "direct"
        ? this.profile.trustedModelRevision
        : selected.revision;
      if (!revision || !isExactFasterWhisperRevision(revision)) return undefined;
      const files = selected.kind === "direct"
        ? await inventoryDirectFiles(selected.directory, signal)
        : await inventoryFiles(selected.directory, selected.artifactRoot, signal);
      const metadataSupportsMemo = files.every((file) => file.dev !== "0" && file.ino !== "0" && file.mtimeNs !== "0" && file.ctimeNs !== "0");
      const detector = metadataSupportsMemo ? files.map((file) => [
        file.path, file.resolvedIdentity, file.dev, file.ino, file.size, file.mtimeNs, file.ctimeNs
      ].join("\0")).join("\n") : undefined;
      let fingerprint = this.memo;
      if (!detector || !fingerprint || fingerprint.revision !== revision || fingerprint.detector !== detector) {
        const manifest: string[] = [];
        for (const file of files) {
          throwIfAborted(signal);
          manifest.push(`${file.path}\0${file.size}\0${await hashFile(file.absolute, signal)}`);
          this.options.onArtifactHashed?.(file.path);
        }
        fingerprint = {
          revision,
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
        modelId: selected.repositoryId,
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

interface ModelArtifactState {
  path: string;
  absolute: string;
  resolvedIdentity: string;
  dev: string;
  ino: string;
  size: string;
  mtimeNs: string;
  ctimeNs: string;
}

async function inventoryFiles(root: string, artifactRoot: string, signal?: AbortSignal): Promise<ModelArtifactState[]> {
  const output: ModelArtifactState[] = [];
  async function walk(directory: string): Promise<void> {
    throwIfAborted(signal);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) {
        const metadata = await lstat(absolute, { bigint: true });
        if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Model artifact changed during inventory.");
        const resolvedIdentity = await realpath(absolute);
        output.push(modelArtifactState(root, absolute, resolvedIdentity, metadata));
        if (output.length > MAX_MODEL_FILES) throw new Error("Model artifact inventory is too large.");
      } else if (entry.isSymbolicLink()) {
        const target = await realpath(absolute);
        if (target !== artifactRoot && !target.startsWith(`${artifactRoot}${sep}`)) throw new Error("Model artifact symlink escapes its trusted repository.");
        const metadata = await lstat(target, { bigint: true });
        if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Model artifact symlink target is invalid.");
        output.push(modelArtifactState(root, absolute, target, metadata));
        if (output.length > MAX_MODEL_FILES) throw new Error("Model artifact inventory is too large.");
      } else throw new Error("Model artifact is not a regular file.");
    }
  }
  await walk(root);
  if (output.length === 0) throw new Error("Model artifact inventory is empty.");
  return output.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

async function inventoryDirectFiles(root: string, signal?: AbortSignal): Promise<ModelArtifactState[]> {
  const output: ModelArtifactState[] = [];
  throwIfAborted(signal);
  for (const entry of await readdir(root, { withFileTypes: true })) {
    throwIfAborted(signal);
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) continue;
    if (entry.isFile()) {
      const metadata = await lstat(absolute, { bigint: true });
      if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Model artifact changed during inventory.");
      output.push(modelArtifactState(root, absolute, await realpath(absolute), metadata));
    } else if (entry.isSymbolicLink()) {
      const target = await realpath(absolute);
      if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error("Model artifact symlink escapes its trusted directory.");
      const metadata = await lstat(target, { bigint: true });
      if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Model artifact symlink target is invalid.");
      output.push(modelArtifactState(root, absolute, target, metadata));
    } else throw new Error("Model artifact is not a regular file.");
    if (output.length > MAX_MODEL_FILES) throw new Error("Model artifact inventory is too large.");
  }
  if (output.length === 0) throw new Error("Model artifact inventory is empty.");
  return output.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

function modelArtifactState(
  root: string,
  logicalPath: string,
  resolvedIdentity: string,
  metadata: { dev: bigint; ino: bigint; size: bigint; mtimeNs: bigint; ctimeNs: bigint }
): ModelArtifactState {
  return {
    path: relative(root, logicalPath).split(sep).join("/"),
    absolute: resolvedIdentity,
    resolvedIdentity,
    dev: metadata.dev.toString(),
    ino: metadata.ino.toString(),
    size: metadata.size.toString(),
    mtimeNs: metadata.mtimeNs.toString(),
    ctimeNs: metadata.ctimeNs.toString()
  };
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
