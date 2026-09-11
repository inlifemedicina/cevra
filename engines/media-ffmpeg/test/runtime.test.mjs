import test from "node:test";
import assert from "node:assert/strict";
import { PersistentMediaWorkerClient, selectDecodeAcceleration, selectVideoEncoder } from "../dist/index.js";

test("macOS chooses VideoToolbox when available", () => {
  const result = selectVideoEncoder({ platform: "darwin", arch: "arm64", encoders: ["h264_videotoolbox"], hwaccels: ["videotoolbox"] }, "h264", "final");
  assert.equal(result.encoder, "h264_videotoolbox");
  assert.equal(result.family, "videotoolbox");
  assert.equal(selectDecodeAcceleration({ platform: "darwin", arch: "arm64", encoders: [], hwaccels: ["videotoolbox"] }), "videotoolbox");
});

test("Windows benchmark can override static encoder priority", () => {
  const caps = { platform: "win32", arch: "x64", encoders: ["h264_nvenc", "h264_qsv", "h264_mf"], hwaccels: ["d3d11va"] };
  const result = selectVideoEncoder(caps, "h264", "preview", [
    { encoder: "h264_nvenc", codec: "h264", success: true, fps: 180 },
    { encoder: "h264_qsv", codec: "h264", success: true, fps: 240 }
  ]);
  assert.equal(result.encoder, "h264_qsv");
  assert.equal(result.reason, "benchmark");
});

test("GPL-only software encoders are not implicit fallback", () => {
  const result = selectVideoEncoder({ platform: "linux", arch: "x64", encoders: ["libx264"], hwaccels: [] }, "h264", "final");
  assert.equal(result, undefined);
});

test("persistent worker starts once across calls and can close", async () => {
  let starts = 0;
  let stops = 0;
  const calls = [];
  const transport = {
    async start() { starts += 1; },
    async stop() { stops += 1; },
    async request(method, params) {
      calls.push({ method, params });
      if (method === "cevra/info") return { name: "cevra-media-worker", version: "0.1.0", protocolVersion: 1, upstream: { id: "ffmpeg-skill", version: "1.4.2", contractVersion: "1.0" } };
      if (method === "cevra/health") return { ok: true, checkedAt: "2026-09-11T00:00:00Z", checks: [], tools: {} };
      if (method === "tools/list") return { tools: [] };
      return { structuredContent: {} };
    }
  };
  const client = new PersistentMediaWorkerClient(transport);
  await client.info();
  await client.health();
  await client.listTools();
  assert.equal(starts, 1);
  assert.equal(calls.length, 3);
  await client.close();
  assert.equal(stops, 1);
});
