import { existsSync, lstatSync, readdirSync, realpathSync, type BigIntStats } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import { LocalAlignmentError } from "./errors.js";
import { verifyPinnedModel } from "./process-runner.js";
import type { AlignmentModelPin } from "./types.js";

export interface PinnedAlignmentModelVerifierOptions {
  /** Deterministic strong-verification seam. Production retains full per-file SHA-256 verification. */
  strongVerifier?: (modelPath: string, pin: AlignmentModelPin) => Promise<void>;
  /** Test seam for the production fallback used when filesystem metadata is not strong enough to memoize. */
  disableMemoization?: boolean;
  onStateCheck?: () => void;
  onMemoHit?: () => void;
}

interface ModelState {
  signature: string;
  memoDetector: string | undefined;
}

interface InspectedEntry {
  logicalPath: string;
  resolvedIdentity: string;
  metadata: BigIntStats;
  expectedIdentity: string;
}

/**
 * Process-local attestation over an exact prepared model directory.
 * Metadata can reuse a prior cryptographic proof; it never replaces that proof.
 */
export class PinnedAlignmentModelVerifier {
  private readonly attestations = new Map<string, string>();
  private readonly strongVerifier;

  constructor(private readonly options: PinnedAlignmentModelVerifierOptions = {}) {
    this.strongVerifier = options.strongVerifier ?? ((modelPath, pin) => verifyPinnedModel(modelPath, pin.files));
  }

  async ensureVerified(modelPath: string, pin: AlignmentModelPin): Promise<void> {
    const key = `${resolve(modelPath)}\0${pinIdentity(pin)}`;
    let before: ModelState;
    try { before = inspectModelState(modelPath, pin, this.options.onStateCheck); }
    catch (cause) { this.attestations.delete(key); throw cause; }

    if (!this.options.disableMemoization && before.memoDetector && this.attestations.get(key) === before.memoDetector) {
      this.options.onMemoHit?.();
      return;
    }
    this.attestations.delete(key);

    await this.strongVerifier(modelPath, pin);

    let after: ModelState;
    try { after = inspectModelState(modelPath, pin, this.options.onStateCheck); }
    catch (cause) { this.attestations.delete(key); throw cause; }
    if (before.signature !== after.signature) {
      throw unavailable("The pinned alignment model changed during integrity verification.");
    }
    if (!this.options.disableMemoization && after.memoDetector) this.attestations.set(key, after.memoDetector);
  }
}

function inspectModelState(modelPath: string, pin: AlignmentModelPin, onStateCheck?: () => void): ModelState {
  onStateCheck?.();
  try {
    if (!isAbsolute(modelPath) || !existsSync(modelPath)) throw unavailable("The pinned local alignment model is unavailable.");
    const rootMetadata = lstatSync(modelPath, { bigint: true });
    if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) throw unavailable("The pinned local alignment model is unavailable.");
    const root = realpathSync(modelPath);

    const expectedNames = Object.keys(pin.files).sort(codeUnitOrder);
    if (expectedNames.some((name) => name !== basename(name) || name === "." || name === "..")) throw unavailable("The pinned model inventory is invalid.");
    const entries = readdirSync(root, { withFileTypes: true });
    const actualNames = entries.map((entry) => entry.name).sort(codeUnitOrder);
    if (actualNames.length !== expectedNames.length || actualNames.some((name, index) => name !== expectedNames[index])) {
      throw unavailable("The pinned local alignment model contains an unexpected runtime file.");
    }

    const inspected: InspectedEntry[] = [{ logicalPath: ".", resolvedIdentity: root, metadata: rootMetadata, expectedIdentity: pinIdentity(pin) }];
    for (const name of expectedNames) {
      const entry = entries.find((candidate) => candidate.name === name);
      const path = resolve(root, name);
      if (!entry?.isFile() || entry.isSymbolicLink()) throw unavailable("The pinned local alignment model contains an unsupported filesystem entry.");
      const metadata = lstatSync(path, { bigint: true });
      if (!metadata.isFile() || metadata.isSymbolicLink() || realpathSync(path) !== path) throw unavailable("The pinned local alignment model contains an unsupported filesystem entry.");
      inspected.push({ logicalPath: name, resolvedIdentity: path, metadata, expectedIdentity: pin.files[name]! });
    }
    const signature = inspected.map(({ logicalPath, resolvedIdentity, metadata, expectedIdentity }) =>
      fileState(logicalPath, resolvedIdentity, metadata, expectedIdentity)).join("\n");
    const memoSafe = inspected.every(({ metadata }) => metadataSupportsMemo(metadata));
    return { signature, memoDetector: memoSafe ? signature : undefined };
  } catch (cause) {
    if (cause instanceof LocalAlignmentError) throw cause;
    throw new LocalAlignmentError("ALIGNMENT_MODEL_UNAVAILABLE", "The pinned local alignment model state could not be verified.", { cause });
  }
}

function fileState(logicalPath: string, resolvedIdentity: string, metadata: BigIntStats, expectedIdentity: string): string {
  return [logicalPath, resolvedIdentity, metadata.dev, metadata.ino, metadata.size, metadata.mtimeNs, metadata.ctimeNs, expectedIdentity]
    .map(String).join("\0");
}

function metadataSupportsMemo(metadata: BigIntStats): boolean {
  return metadata.dev !== 0n && metadata.ino !== 0n && metadata.mtimeNs !== 0n && metadata.ctimeNs !== 0n;
}

function pinIdentity(pin: AlignmentModelPin): string {
  return JSON.stringify({
    language: pin.language,
    modelId: pin.modelId,
    revision: pin.revision,
    modelDigest: pin.modelDigest,
    requiredSampleRate: pin.requiredSampleRate,
    directoryName: pin.directoryName,
    files: Object.keys(pin.files).sort(codeUnitOrder).map((name) => [name, pin.files[name]])
  });
}

function codeUnitOrder(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function unavailable(message: string): LocalAlignmentError { return new LocalAlignmentError("ALIGNMENT_MODEL_UNAVAILABLE", message); }
