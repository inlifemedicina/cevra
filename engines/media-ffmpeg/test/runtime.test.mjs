import test from "node:test";
import assert from "node:assert/strict";
import { PersistentMediaWorkerClient, optimizeMediaRuntime, selectDecodeAcceleration, selectVideoEncoder } from "../dist/index.js";

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

test("all failed encoder benchmarks report no functional encoder", () => {
  const caps = { platform: "win32", arch: "x64", encoders: ["h264_nvenc", "h264_qsv"], hwaccels: [] };
  const result = selectVideoEncoder(caps, "h264", "final", [
    { encoder: "h264_nvenc", codec: "h264", success: false, detail: "device unavailable" },
    { encoder: "h264_qsv", codec: "h264", success: false, detail: "initialization failed" }
  ]);
  assert.equal(result, undefined);
});

test("benchmarks for another codec do not suppress platform priority", () => {
  const caps = { platform: "win32", arch: "x64", encoders: ["h264_nvenc", "hevc_nvenc"], hwaccels: [] };
  const result = selectVideoEncoder(caps, "h264", "final", [
    { encoder: "hevc_nvenc", codec: "h265", success: false, detail: "device unavailable" }
  ]);
  assert.equal(result.encoder, "h264_nvenc");
  assert.equal(result.reason, "platform-priority");
});

test("runtime optimization benchmarks approved encoders and configures decode acceleration", async () => {
  let configured;
  const worker = {
    async info() {
      return {
        name: "cevra-media-worker",
        version: "0.1.0",
        protocolVersion: 1,
        upstream: { id: "ffmpeg-skill", version: "1.4.2", contractVersion: "1.0" },
        runtime: { platform: "win32", arch: "x64", encoders: ["h264_nvenc", "h264_qsv"], hwaccels: ["d3d11va"] }
      };
    },
    async health() { return { ok: true, checkedAt: "2026-09-11T00:00:00Z", checks: [], tools: {} }; },
    async configureRuntime(profile) { configured = profile; },
    async benchmarkVideoEncoders(codec, encoders) {
      return encoders.map((encoder) => ({ encoder, codec, success: true, fps: encoder.endsWith("qsv") ? 250 : 180 }));
    },
    async listTools() { return []; },
    async callTool() { return { structuredContent: {} }; }
  };
  const result = await optimizeMediaRuntime(worker, "final");
  assert.equal(result.selections.h264.encoder, "h264_qsv");
  assert.equal(result.recommendedDecodeAcceleration, "d3d11va");
  assert.equal(configured.h264Encoder, "h264_qsv");
  assert.equal(configured.decodeAcceleration, "d3d11va");
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
      if (method === "cevra/configure") return { configured: true };
      if (method === "cevra/benchmark") return { benchmarks: [{ encoder: "h264_mf", codec: "h264", success: true, fps: 120 }] };
      return { structuredContent: {} };
    }
  };
  const client = new PersistentMediaWorkerClient(transport);
  await client.info();
  await client.health();
  await client.listTools();
  await client.configureRuntime({ h264Encoder: "h264_mf" });
  const benchmark = await client.benchmarkVideoEncoders("h264", ["h264_mf"]);
  assert.equal(benchmark[0].fps, 120);
  assert.equal(starts, 1);
  assert.equal(calls.length, 5);
  await client.close();
  assert.equal(stops, 1);
});

test("persistent client serializes jobs and forwards stable job ids", async () => {
  const events = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const transport = {
    async start() {},
    async stop() {},
    async request(method, params) {
      if (method !== "tools/call") return {};
      events.push(`start:${params.jobId}`);
      if (params.jobId === "job-1") await firstGate;
      events.push(`end:${params.jobId}`);
      return { structuredContent: {} };
    }
  };
  const client = new PersistentMediaWorkerClient(transport);
  const first = client.callTool("probe", {}, "job-1");
  const second = client.callTool("probe", {}, "job-2");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(events, ["start:job-1"]);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["start:job-1", "end:job-1", "start:job-2", "end:job-2"]);
  await client.close();
});
