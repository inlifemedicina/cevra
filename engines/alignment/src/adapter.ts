import { isAbsolute, resolve } from "node:path";
import type { AlignmentEngineAdapter, AlignmentExecutionIdentity, AlignmentRequest, AlignmentResult, CapabilityDescriptor, EngineHealth, EngineIdentity, ExecutionContext } from "@cevra/contracts";
import { CEVRA_ENGINE_API_VERSION } from "@cevra/contracts";
import { alignmentCancellation, LocalAlignmentError } from "./errors.js";
import { ProcessAlignmentWorkerRunner, assertModelRootIsolated, verifyPinnedModel } from "./process-runner.js";
import { ALIGNMENT_MAX_TOKENS_PER_WINDOW, ALIGNMENT_MAX_WINDOW_MS, ALIGNMENT_MODELS, ALIGNMENT_PIPELINE_VERSION, ALIGNMENT_PROTOCOL_VERSION, ALIGNMENT_RESULT_VALIDATION_VERSION, ALIGNMENT_WILDCARD_ALGORITHM_VERSION, CEVRA_ALIGNMENT_VERSION, type LocalAlignmentAdapterOptions } from "./types.js";
import { normalizeAlignmentRequest, normalizeAlignmentWorkerResult } from "./validation.js";

export class CtcForcedAlignmentAdapter implements AlignmentEngineAdapter {
  private readonly runner;
  private readonly modelVerifier;
  private activeJobId: string | undefined;
  constructor(private readonly options: LocalAlignmentAdapterOptions) {
    if (!isAbsolute(options.profile.modelRoot)) throw new LocalAlignmentError("ALIGNMENT_INVALID_REQUEST", "modelRoot must be an absolute trusted path.");
    if (options.profile.allowModelDownload !== undefined && options.profile.allowModelDownload !== false) throw new LocalAlignmentError("ALIGNMENT_INVALID_REQUEST", "Alignment model downloads are disabled.");
    if (options.profile.device !== undefined && options.profile.device !== "cpu" && options.profile.device !== "cuda") throw new LocalAlignmentError("ALIGNMENT_INVALID_REQUEST", "Alignment device is not allow-listed.");
    this.runner = options.runner ?? new ProcessAlignmentWorkerRunner({ runtime: options.runtime });
    this.modelVerifier = options.modelVerifier ?? ((path, pin) => verifyPinnedModel(path, pin.files));
  }
  async identity(): Promise<EngineIdentity> { return { id: "cevra.alignment.ctc", kind: "alignment", displayName: "CEVRA Local Forced Alignment", version: CEVRA_ALIGNMENT_VERSION, apiVersion: CEVRA_ENGINE_API_VERSION }; }
  async describeAlignmentExecution(request: AlignmentRequest, signal?: AbortSignal): Promise<AlignmentExecutionIdentity | undefined> {
    if (signal?.aborted) throw alignmentCancellation(signal.reason);
    const normalized = normalizeAlignmentRequest(request);
    const pin = ALIGNMENT_MODELS[normalized.language];
    try {
      assertModelRootIsolated(this.options.profile.modelRoot, this.options.runtime);
      await this.modelVerifier(resolve(this.options.profile.modelRoot, pin.directoryName), pin);
    } catch { return undefined; }
    return {
      engineId: "cevra.alignment.ctc", engineVersion: CEVRA_ALIGNMENT_VERSION, engineApiVersion: CEVRA_ENGINE_API_VERSION,
      workerProtocolVersion: ALIGNMENT_PROTOCOL_VERSION, modelId: pin.modelId, modelRevision: pin.revision,
      modelDigest: pin.modelDigest as `sha256:${string}`, device: this.options.profile.device ?? "cpu",
      pipelineVersion: ALIGNMENT_PIPELINE_VERSION, requiredSampleRate: pin.requiredSampleRate,
      maximumWindowMs: ALIGNMENT_MAX_WINDOW_MS, maximumTokensPerWindow: ALIGNMENT_MAX_TOKENS_PER_WINDOW,
      wildcardAlgorithmVersion: ALIGNMENT_WILDCARD_ALGORITHM_VERSION, resultValidationVersion: ALIGNMENT_RESULT_VALIDATION_VERSION
    };
  }
  async healthcheck(): Promise<EngineHealth> {
    try { const result = await this.runner.healthcheck(); return { status: "ready", checkedAt: new Date().toISOString(), checks: [{ id: "alignment-runtime", status: "PASS", evidence: { protocolVersion: result.protocolVersion, alignmentVersion: result.alignmentVersion } }] }; }
    catch (error) { return { status: "unavailable", checkedAt: new Date().toISOString(), checks: [{ id: "alignment-runtime", status: "FAIL", evidence: { code: error instanceof LocalAlignmentError ? error.code : "ALIGNMENT_FAILED" } }] }; }
  }
  async capabilities(): Promise<CapabilityDescriptor[]> {
    const health = await this.healthcheck();
    const capabilities: CapabilityDescriptor[] = [];
    for (const language of ["pt", "en"] as const) {
      let available = health.status === "ready";
      if (available) { try { assertModelRootIsolated(this.options.profile.modelRoot, this.options.runtime); const pin = ALIGNMENT_MODELS[language]; await this.modelVerifier(resolve(this.options.profile.modelRoot, pin.directoryName), pin); } catch { available = false; } }
      capabilities.push({ id: `alignment.local.ctc.${language}`, version: 1, available, detail: `model=${ALIGNMENT_MODELS[language].modelId}@${ALIGNMENT_MODELS[language].revision}` });
    }
    return capabilities;
  }
  async align(request: AlignmentRequest, context: ExecutionContext): Promise<AlignmentResult> {
    if (!context?.jobId || typeof context.jobId !== "string" || !context.jobId.trim()) throw new LocalAlignmentError("ALIGNMENT_INVALID_REQUEST", "ExecutionContext.jobId is required.");
    if (context.signal?.aborted) throw alignmentCancellation(context.signal.reason);
    if (this.activeJobId) throw new LocalAlignmentError("ALIGNMENT_BUSY", `Alignment job ${this.activeJobId} is already active.`);
    const normalized = normalizeAlignmentRequest(request);
    assertModelRootIsolated(this.options.profile.modelRoot, this.options.runtime);
    const pin = ALIGNMENT_MODELS[normalized.language];
    const modelPath = resolve(this.options.profile.modelRoot, pin.directoryName);
    await this.modelVerifier(modelPath, pin);
    this.activeJobId = context.jobId;
    const workerRequest = { protocolVersion: 1 as const, operation: "align" as const, jobId: context.jobId, inputPath: normalized.inputPath, language: normalized.language, transcript: normalized.transcript, modelPath, modelId: pin.modelId, modelRevision: pin.revision, modelDigest: pin.modelDigest, allowModelDownload: false as const, device: this.options.profile.device ?? "cpu" };
    try { return normalizeAlignmentWorkerResult(await this.runner.align(workerRequest, context), workerRequest, pin); }
    catch (error) { if (context.signal?.aborted && !(error instanceof LocalAlignmentError && error.code === "ALIGNMENT_CANCELLED")) throw alignmentCancellation(error); throw error; }
    finally { this.activeJobId = undefined; }
  }
}
