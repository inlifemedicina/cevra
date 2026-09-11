import type {
  MediaWorkerClient,
  MediaWorkerEncoderBenchmark,
  MediaWorkerHealth,
  MediaWorkerInfo,
  MediaWorkerRuntimeProfile,
  MediaWorkerToolResult,
  WorkerVideoCodec
} from "./worker.js";

export interface PersistentWorkerTransport {
  start(): Promise<void>;
  stop(): Promise<void>;
  request<T>(method: string, params?: Record<string, unknown>, signal?: AbortSignal): Promise<T>;
}

export class PersistentMediaWorkerClient implements MediaWorkerClient {
  private startPromise: Promise<void> | undefined;
  private jobQueue: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(private readonly transport: PersistentWorkerTransport) {}

  async info(): Promise<MediaWorkerInfo> {
    return this.request<MediaWorkerInfo>("cevra/info");
  }

  async health(): Promise<MediaWorkerHealth> {
    return this.request<MediaWorkerHealth>("cevra/health");
  }

  async configureRuntime(profile: MediaWorkerRuntimeProfile): Promise<void> {
    await this.request<{ configured: true }>("cevra/configure", { profile });
  }

  async benchmarkVideoEncoders(codec: WorkerVideoCodec, encoders: string[]): Promise<MediaWorkerEncoderBenchmark[]> {
    const result = await this.request<{ benchmarks: MediaWorkerEncoderBenchmark[] }>("cevra/benchmark", { codec, encoders });
    return result.benchmarks;
  }

  async listTools(): Promise<Array<{ name: string; inputSchema?: Record<string, unknown> }>> {
    const result = await this.request<{ tools: Array<{ name: string; inputSchema?: Record<string, unknown> }> }>("tools/list");
    return result.tools;
  }

  async callTool(name: string, arguments_: Record<string, unknown>, jobId: string, signal?: AbortSignal): Promise<MediaWorkerToolResult> {
    if (!jobId.trim()) throw new Error("Media jobId is required.");
    if (signal?.aborted) throw abortError();
    const run = this.jobQueue.then(async () => {
      if (signal?.aborted) throw abortError();
      try {
        return await this.request<MediaWorkerToolResult>("tools/call", { name, arguments: arguments_, jobId }, signal);
      } catch (error) {
        if (signal?.aborted) throw abortError();
        throw error;
      }
    });
    this.jobQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  async close(): Promise<void> {
    this.closed = true;
    if (!this.startPromise) return;
    try {
      await this.startPromise;
    } finally {
      this.startPromise = undefined;
      await this.transport.stop();
    }
  }

  private async request<T>(method: string, params?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    if (this.closed) throw new Error("CEVRA media worker client is closed.");
    if (signal?.aborted) throw abortError();
    await this.ensureStarted();
    if (signal?.aborted) throw abortError();
    return this.transport.request<T>(method, params, signal);
  }

  private ensureStarted(): Promise<void> {
    this.startPromise ??= this.transport.start().catch((error) => {
      this.startPromise = undefined;
      throw error;
    });
    return this.startPromise;
  }
}

function abortError(): Error {
  const error = new Error("CEVRA media operation was cancelled.");
  error.name = "AbortError";
  return error;
}
