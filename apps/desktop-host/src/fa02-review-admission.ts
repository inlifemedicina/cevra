import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isAbsolute, join, resolve } from "node:path";
import { ProjectHistory } from "@cevra/project-ir";
import type { CreateEditorialDraftRequest } from "@cevra/application";

export const FA02_REVIEW_ROOT = "CEVRA_FA02_REVIEW_ROOT";
export const FA02_RESULT_SHA256 = "CEVRA_FA02_RESULT_SHA256";
export const FA02_HISTORY_SHA256 = "CEVRA_FA02_HISTORY_SHA256";
const PAIR_KEYS = [FA02_REVIEW_ROOT, FA02_RESULT_SHA256, FA02_HISTORY_SHA256];

/** Only the explicitly designated F-A02 pair, supplied by native startup. */
export async function readDesignatedFa02Pair(environment: NodeJS.ProcessEnv): Promise<{
  history: ProjectHistory; request: CreateEditorialDraftRequest;
} | null> {
  if (!PAIR_KEYS.some(key => environment[key] !== undefined)) return null;
  try {
    const root = environment[FA02_REVIEW_ROOT];
    if (!root || !isAbsolute(root) || root.length > 2048 || /[\u0000-\u001f\u007f]/u.test(root) || environment.CEVRA_HOST_RECOVERY === "1") throw new Error();
    if (await realpath(root) !== resolve(root)) throw new Error();
    const result = await readPinnedJson(join(root, "first-fa-result.private.json"), environment[FA02_RESULT_SHA256], 256 * 1024);
    const archive = await readPinnedJson(join(root, "history-archive.json"), environment[FA02_HISTORY_SHA256], 2 * 1024 * 1024);
    if (!record(result) || Object.keys(result).some(key => !["state", "result", "invocations", "reservation", "transportMetrics", "liveAuthorized", "providerContact", "deadlineMs"].includes(key)) ||
      result.state !== "FIRST_FA_VALIDATED" || result.invocations !== 1 || result.liveAuthorized !== true || ![true, "UNKNOWN"].includes(result.providerContact as boolean | string) ||
      !record(result.result) || result.result.kind !== "analysis-candidate") throw new Error();
    const history = ProjectHistory.fromArchive(archive as Parameters<typeof ProjectHistory.fromArchive>[0]);
    // This is the preserved F-A02 assessment, not a new interpretation of the
    // provider result or a claim that its file authenticates transport history.
    const request: CreateEditorialDraftRequest = {
      id: "fa02-session-review",
      analysis: result.result as unknown as CreateEditorialDraftRequest["analysis"],
      analysisReview: {
        citationSupport: "PARTIAL",
        notes: ["The label observation compares E1 but cites only E2; the relation cites both."],
        priorChecks: [{ id: "prior-literal-helper", outcome: "PARTIAL", detail: "condition:false, complement:true, repetition:false, uncertainty:false" }]
      }
    };
    return { history, request };
  } catch {
    throw Object.assign(new Error("The designated offline review pair is unavailable or invalid."), { code: "EDITORIAL_REVIEW_UNAVAILABLE" });
  }
}

async function readPinnedJson(path: string, expected: string | undefined, maximum: number): Promise<unknown> {
  if (!expected || !/^[a-f0-9]{64}$/u.test(expected) || await realpath(path) !== path) throw new Error();
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await file.stat({ bigint: true });
    if (!before.isFile() || before.size > BigInt(maximum)) throw new Error();
    const buffer = Buffer.alloc(maximum + 1);
    let length = 0;
    while (length < buffer.length) {
      const chunk = await file.read(buffer, length, buffer.length - length, length);
      if (!chunk.bytesRead) break;
      length += chunk.bytesRead;
    }
    const after = await file.stat({ bigint: true });
    if (length > maximum || before.size !== BigInt(length) || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw new Error();
    const bytes = buffer.subarray(0, length);
    if (createHash("sha256").update(bytes).digest("hex") !== expected) throw new Error();
    return JSON.parse(bytes.toString("utf8"));
  } finally { await file.close(); }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
