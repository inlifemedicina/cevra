import type { MediaEngineAdapter } from "@cevra/contracts";
import { MANUAL_EXPORT_LIMITS } from "@cevra/application";
import type { ProcessMediaWorkerTransport } from "@cevra/media-ffmpeg";

/** Finish sampled resource admission before Media Application can record a successful export. */
export function guardManualExportEngine(engine: MediaEngineAdapter,
  transport: Pick<ProcessMediaWorkerTransport, "withOwnedRenderBudget">): MediaEngineAdapter {
  return {
    identity: () => engine.identity(), healthcheck: () => engine.healthcheck(), capabilities: () => engine.capabilities(),
    async execute(operation, context) {
      if (operation.type !== "render-manual-video-sequence") return engine.execute(operation, context);
      // A final observer failure can follow publication. The transport retires
      // its generation; retain final/account evidence for Host reconciliation.
      // This wrapper has no authority to unlink a public destination.
      const guarded = await transport.withOwnedRenderBudget({
          ownedDirectory: operation.ownedWorkspaceUri,
          rendererRssLimitBytes: MANUAL_EXPORT_LIMITS.rendererRssBytes,
          ownedFileLimitBytes: MANUAL_EXPORT_LIMITS.ownedJobBytes
        }, () => engine.execute(operation, context));
      return guarded.result;
    }
  };
}
