import { resolveRuntimePaths } from "@cevra/transcription-faster-whisper";

const [pythonExecutable, environmentRoot] = process.argv.slice(2);
if (!pythonExecutable || !environmentRoot) throw new Error("Packaging probe requires fixed runtime paths.");

const resolved = resolveRuntimePaths({
  mode: "development",
  pythonExecutable,
  environmentRoot
});
process.stdout.write(`${JSON.stringify({ workerScript: resolved.workerScript })}\n`);
