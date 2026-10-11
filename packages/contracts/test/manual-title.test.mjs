import assert from "node:assert/strict";
import test from "node:test";
import { FixedManualTitleCompositionAdapter, validateManualTitleComposition, validateMediaOperation } from "../dist/index.js";
const plan = new FixedManualTitleCompositionAdapter().compile({ version: 1, componentId: "cevra.title.lower-third.inter.v1", text: "Ação", startFrame: 1, endFrame: 30, aspect: "9:16" });
test("closed composition carries no caller assets/code; versioned render operations preserve legacy rejection", () => {
  const item = { inputUri: "/original.mp4", sourceStartFrame: 0, sourceEndFrame: 30, sourceContent: { sha256: "a".repeat(64), sizeBytes: 100 }, audioSelection: "single-source-stream" };
  const base = { items: [item], outputUri: "/out.mp4", ownedWorkspaceUri: "/job" };
  for (const [type, version] of [["render-manual-video-sequence", 2], ["render-manual-video-preview", 3]]) assert.deepEqual(validateMediaOperation({ type, version, ...base, composition: plan }).composition, plan);
  assert.throws(() => validateMediaOperation({ type: "render-manual-video-sequence", version: 1, ...base, composition: plan }));
  for (const bad of [{ ...plan, fontSha256: "a".repeat(64) }, { ...plan, filter: "caller code" }, { ...plan, title: { ...plan.title, output: "/private" } }]) assert.throws(() => validateManualTitleComposition(bad));
});
