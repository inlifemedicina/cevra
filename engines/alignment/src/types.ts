import type { AlignmentLanguage, AlignmentRequest, ExecutionContext } from "@cevra/contracts";

export const ALIGNMENT_PROTOCOL_VERSION = 1 as const;
export const CEVRA_ALIGNMENT_VERSION = "0.1.0" as const;
export const ALIGNMENT_MAX_WINDOW_MS = 30_000 as const;
export const ALIGNMENT_MAX_TOKENS_PER_WINDOW = 1_024 as const;
export const ALIGNMENT_WILDCARD_ALGORITHM_VERSION = "whisperx-3.8.6-wildcard-v1" as const;
export const ALIGNMENT_PIPELINE_VERSION = "ctc-windowed-v1" as const;
export const ALIGNMENT_RESULT_VALIDATION_VERSION = "alignment-result-v1" as const;
export const WHISPERX_BASELINE_VERSION = "3.8.6" as const;
export const WHISPERX_BASELINE_COMMIT = "3ccc17b8de34f305300f8a3fd3c9f76ba820c0d0" as const;

export interface AlignmentModelPin {
  language: AlignmentLanguage;
  modelId: string;
  revision: string;
  /** SHA-256 of the principal pinned weight artifact, not the complete directory. */
  modelDigest: string;
  requiredSampleRate: 16000;
  license: "Apache-2.0";
  directoryName: string;
  files: Readonly<Record<string, string>>;
}

export const ALIGNMENT_MODELS: Readonly<Record<AlignmentLanguage, AlignmentModelPin>> = {
  pt: {
    language: "pt", modelId: "jonatasgrosman/wav2vec2-large-xlsr-53-portuguese",
    revision: "634ac655299bcdc46c83bc01da9bab52d2987e4f",
    modelDigest: "sha256:c244caf8395a0c333bdc877e7b62ce5efea12ad8cfec0851c0fe6efb844b834e",
    requiredSampleRate: 16000, license: "Apache-2.0", directoryName: "pt-634ac655299b",
    files: {
      "config.json": "ea1d581f043b854671b11d6b7db606e1ec5aafbfdd6b964c3f2f5975e335761c",
      "preprocessor_config.json": "ca5999a45e98bb76ea87a461ba28a23ad32a5bb9f733b8e0f6546ff38b6c612d",
      "special_tokens_map.json": "bb7068de1150661a10b55f9e4b12a0e77af8bf91f5e45e1b58afaf1d0e17f675",
      "vocab.json": "66b0813833e1536fb028f675e10ceda8254e6ee400d8cfd48359f39982190696",
      "pytorch_model.bin": "c244caf8395a0c333bdc877e7b62ce5efea12ad8cfec0851c0fe6efb844b834e"
    }
  },
  en: {
    language: "en", modelId: "facebook/wav2vec2-base-960h",
    revision: "22aad52d435eb6dbaf354bdad9b0da84ce7d6156",
    modelDigest: "sha256:8aa76ab2243c81747a1f832954586bc566090c83a0ac167df6f31f0fa917d74a",
    requiredSampleRate: 16000, license: "Apache-2.0", directoryName: "en-22aad52d435e",
    files: {
      "config.json": "d3ec255c063d9f95057b553b19c20135b259875834a4fe9deb218a6be25b4cf3",
      "feature_extractor_config.json": "d3de0c797bf9b65f90bc65c30cb7b303ebeda341f6fc80af33628c4b26b95632",
      "preprocessor_config.json": "b225d617c025463b9e157e06afea8b90dc7078fc70b013c533328423e0486b4a",
      "special_tokens_map.json": "bb7068de1150661a10b55f9e4b12a0e77af8bf91f5e45e1b58afaf1d0e17f675",
      "tokenizer_config.json": "dc790594f5bc351a4311c6624f40acd95850d4aaf2a5cb3c656c9b610720b608",
      "vocab.json": "19727f8944fe6459fc3f240ae2c198395b740f6a029bd23e06656266b83bcf64",
      "model.safetensors": "8aa76ab2243c81747a1f832954586bc566090c83a0ac167df6f31f0fa917d74a"
    }
  }
};

export interface ManagedAlignmentRuntime {
  mode: "managed";
  pythonExecutable: string;
  privatePythonRoot: string;
  environmentRoot: string;
  protectedRoots?: readonly string[];
}
export interface DevelopmentAlignmentRuntime { mode: "development"; pythonExecutable: string; environmentRoot?: string; workerScript?: string; }
export type AlignmentRuntime = ManagedAlignmentRuntime | DevelopmentAlignmentRuntime;
export interface LocalAlignmentProfile { modelRoot: string; allowModelDownload?: false; device?: "cpu" | "cuda"; }
export interface LocalAlignmentAdapterOptions {
  runtime: AlignmentRuntime;
  profile: LocalAlignmentProfile;
  runner?: AlignmentWorkerRunner;
  /** Deterministic integrity seam for tests; production uses full SHA-256 verification. */
  modelVerifier?: (modelPath: string, pin: AlignmentModelPin) => Promise<void>;
}

export interface AlignmentWorkerRequest {
  protocolVersion: 1;
  operation: "align";
  jobId: string;
  inputPath: string;
  language: AlignmentLanguage;
  transcript: AlignmentRequest["transcript"];
  modelPath: string;
  modelId: string;
  modelRevision: string;
  modelDigest: string;
  allowModelDownload: false;
  device: "cpu" | "cuda";
}
export interface AlignmentWorkerHealth { protocolVersion: 1; status: "ready"; alignmentVersion: string; }
export interface AlignmentWorkerRunner {
  align(request: AlignmentWorkerRequest, context: ExecutionContext): Promise<unknown>;
  healthcheck(): Promise<AlignmentWorkerHealth>;
}
