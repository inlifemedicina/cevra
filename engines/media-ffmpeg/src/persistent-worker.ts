import type { MediaWorkerClient, MediaWorkerHealth, MediaWorkerInfo, MediaWorkerToolResult } from "./worker.js";

export interface PersistentWorkerTransport {
  start(): Promise<void>;
  stop(): Promise<void>;
  request<T>(method: string, params?: Record<string, unknown>, signal?: AbortSignal): Promise<T>;
}

export class PersistentMediaWorkerClient implements MediaWorkerClient {
  private startPromise?: Promise<void>;

  constructor(private readonly transport: PersistentWorkerTransport) {}

  async info(): Promise<MediaWorkerInfo> {
    return this.request<MediaWorkerInfo>("cevra/info");
  }

  async health(): Promise<MediaWorkerHealth> {
    return this.request<MediaWorkerHealth>("cevra/health");
  }

  async listTools(): Promise<Array<{ name: string; inputSchema?: Record<string, unknown> }>> {
    const result = await this.request<{ tools: Array<{ name: string; inputSchema?: Record<string, unknown> }> }>("tools/list");
    return result.tools;
  }

  async callTool(name: string, arguments_: Record<string, unknown>): Promise<MediaWorkerToolResult> {
    return this.request<MediaWorkerToolResult>("tools/call", { name, arguments: arguments_ });
  }

  async close(): Promise<void> {
    if (!this.startPromise) return;
    try {
      await this.startPromise;
    } finally {
      this.startPromise = undefined;
      await this.transport.stop();
    }
  }

  private async request<T>(method: string, params?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    await this.ensureStarted();
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
