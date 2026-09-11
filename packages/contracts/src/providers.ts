import type { EngineAdapter, ExecutionContext } from "./base.js";

export type ProviderCategory = "stock-media" | "image-generation" | "video-generation" | "audio-generation" | "editor" | "agent-host";

export interface ProviderConfiguration {
  credentialRef?: string;
  settings: Record<string, unknown>;
}

export interface ProviderRequest {
  action: string;
  input: Record<string, unknown>;
}

export interface ProviderResult {
  output: Record<string, unknown>;
}

export interface ProviderAdapter extends EngineAdapter {
  category: ProviderCategory;
  configure(configuration: ProviderConfiguration): Promise<void>;
  connect(): Promise<void>;
  execute(request: ProviderRequest, context: ExecutionContext): Promise<ProviderResult>;
  disconnect(): Promise<void>;
}
