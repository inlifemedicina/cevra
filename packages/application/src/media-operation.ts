import type { MediaOperation } from "@cevra/contracts";

/** Canonical output paths owned by the operation contract, in contract order. */
export function mediaOperationOutputUris(operation: MediaOperation): string[] {
  switch (operation.type) {
    case "probe":
    case "measure-audio":
    case "detect-silence":
      return [];
    case "mux-audio":
    case "concat":
    case "trim":
    case "transcode":
    case "fit":
    case "crop":
    case "speed":
    case "volume":
    case "loudness-normalize":
    case "audio-fade":
    case "extract-audio":
    case "extract-frame":
    case "overlay-media":
    case "render-audio-sequence":
      return [operation.outputUri];
  }
}
