import type { MediaEngineAdapter } from "@cevra/contracts";
import { MANUAL_EXPORT_LIMITS } from "@cevra/application";
import type { ProcessMediaWorkerTransport } from "@cevra/media-ffmpeg";
import { dirname } from "node:path";

/** Admit manual CFR30 preview/final renders; Original/Take operations retain their existing path. */
export function guardManualExportEngine(engine: MediaEngineAdapter,
  transport: Pick<ProcessMediaWorkerTransport, "withOwnedRenderBudget">): MediaEngineAdapter {
  let admittedPreview: { output: string; root: string } | undefined;
  return {
    identity: () => engine.identity(), healthcheck: () => engine.healthcheck(), capabilities: () => engine.capabilities(),
    async execute(operation, context) {
      if (operation.type === "extract-frame" && admittedPreview?.output === operation.inputUri
        && operation.atMs === 0 && operation.maxDimension === 720
        && dirname(operation.outputUri) === admittedPreview.root) {
        const ownedDirectory = admittedPreview.root;
        admittedPreview = undefined;
        const guarded = await transport.withOwnedRenderBudget({ ownedDirectory,
          rendererRssLimitBytes: MANUAL_EXPORT_LIMITS.rendererRssBytes,
          ownedFileLimitBytes: MANUAL_EXPORT_LIMITS.ownedJobBytes }, () => engine.execute(operation, context));
        return guarded.result;
      }
      admittedPreview = undefined;
      if (operation.type !== "render-manual-video-sequence" && operation.type !== "render-manual-video-preview") return engine.execute(operation, context);
      // A final observer failure can follow publication. The transport retires
      // its generation; retain final/account evidence for Host reconciliation.
      // This wrapper has no authority to unlink a public destination.
      const guarded = await transport.withOwnedRenderBudget({
          ownedDirectory: operation.ownedWorkspaceUri,
          rendererRssLimitBytes: MANUAL_EXPORT_LIMITS.rendererRssBytes,
          ownedFileLimitBytes: MANUAL_EXPORT_LIMITS.ownedJobBytes
        }, () => engine.execute(operation, context));
      if (operation.type === "render-manual-video-preview" && guarded.result.type === "file"
        && guarded.result.outputUri === operation.outputUri && dirname(operation.ownedWorkspaceUri) === dirname(operation.outputUri)) {
        admittedPreview = { output: operation.outputUri, root: dirname(operation.outputUri) };
      }
      return guarded.result;
    }
  };
}
