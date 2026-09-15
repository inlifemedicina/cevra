import { spawn } from "node:child_process";

const child = spawn(process.argv[2], [process.argv[3], process.argv[4]], {
  stdio: ["pipe", "ignore", "ignore"]
});
child.once("spawn", () => {
  process.stdout.write(`${child.pid}\n`);
  child.stdin.write(`${JSON.stringify({
    protocolVersion: 1,
    operation: "transcribe",
    jobId: "containment-test",
    inputPath: "/tmp/containment-input.wav",
    wordTimestamps: false,
    modelId: "base",
    modelCacheDir: "/tmp/containment-model",
    allowModelDownload: false,
    device: "cpu",
    computeType: "int8"
  })}\n`);
});
setInterval(() => undefined, 60_000);
