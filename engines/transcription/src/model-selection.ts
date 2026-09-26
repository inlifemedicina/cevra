import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { FasterWhisperProfile, SupportedTranscriptionModelId } from "./types.js";

const EXACT_REVISION = /^[0-9a-f]{40,64}$/u;

export const FASTER_WHISPER_DIRECT_REQUIRED_FILES = ["config.json", "model.bin", "tokenizer.json"] as const;
export const FASTER_WHISPER_DIRECT_VOCABULARY_FILES = ["vocabulary.txt", "vocabulary.json"] as const;

export const FASTER_WHISPER_MODEL_REPOSITORIES = {
  tiny: "Systran/faster-whisper-tiny",
  base: "Systran/faster-whisper-base",
  small: "Systran/faster-whisper-small",
  medium: "Systran/faster-whisper-medium",
  "large-v3": "Systran/faster-whisper-large-v3",
  turbo: "mobiuslabsgmbh/faster-whisper-large-v3-turbo"
} as const satisfies Record<SupportedTranscriptionModelId, string>;

export type LocalFasterWhisperModelSelection =
  | {
      kind: "direct";
      directory: string;
      artifactRoot: string;
      repositoryId: string;
    }
  | {
      kind: "hugging-face";
      directory: string;
      artifactRoot: string;
      repositoryId: string;
      repositoryDirectory: string;
      revision: string;
    };

export function fasterWhisperRepositoryId(modelId: SupportedTranscriptionModelId): string {
  return FASTER_WHISPER_MODEL_REPOSITORIES[modelId];
}

export function fasterWhisperRepositoryDirectory(modelId: SupportedTranscriptionModelId): string {
  return `models--${fasterWhisperRepositoryId(modelId).replaceAll("/", "--")}`;
}

export function isExactFasterWhisperRevision(value: string): boolean {
  return EXACT_REVISION.test(value);
}

/**
 * Resolve only a model source the current local-only worker can select.
 * This is a presence/selection proof, not the cryptographic artifact fingerprint.
 */
export async function resolveLocalFasterWhisperModel(
  profile: Pick<FasterWhisperProfile, "modelCacheDir" | "allowModelDownload">,
  modelId: SupportedTranscriptionModelId
): Promise<LocalFasterWhisperModelSelection | undefined> {
  if (profile.allowModelDownload) return undefined;
  try {
    const root = await realpath(profile.modelCacheDir);
    const repositoryId = fasterWhisperRepositoryId(modelId);
    if (await isPrepopulatedModelDirectory(root)) {
      return { kind: "direct", directory: root, artifactRoot: root, repositoryId };
    }

    const repositoryDirectory = await realpath(join(root, fasterWhisperRepositoryDirectory(modelId)));
    if (!isWithin(root, repositoryDirectory)) return undefined;
    const revision = (await readFile(join(repositoryDirectory, "refs", "main"), "utf8")).trim();
    if (!isExactFasterWhisperRevision(revision)) return undefined;

    const snapshotRoot = await realpath(join(repositoryDirectory, "snapshots"));
    if (!isWithin(repositoryDirectory, snapshotRoot)) return undefined;
    const directory = await realpath(resolve(snapshotRoot, revision));
    if (!isWithin(snapshotRoot, directory) || !await isPrepopulatedModelDirectory(directory)) return undefined;
    return {
      kind: "hugging-face",
      directory,
      artifactRoot: repositoryDirectory,
      repositoryId,
      repositoryDirectory,
      revision
    };
  } catch {
    return undefined;
  }
}

export async function isPrepopulatedModelDirectory(directory: string): Promise<boolean> {
  const isFile = async (name: string): Promise<boolean> => {
    try { return (await stat(join(directory, name))).isFile(); }
    catch { return false; }
  };
  const required = await Promise.all(FASTER_WHISPER_DIRECT_REQUIRED_FILES.map(isFile));
  if (!required.every(Boolean)) return false;
  const vocabulary = await Promise.all(FASTER_WHISPER_DIRECT_VOCABULARY_FILES.map(isFile));
  return vocabulary.some(Boolean);
}

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}
