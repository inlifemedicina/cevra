export const CEVRA_ENGINE_API_VERSION = 1 as const;

export type EngineKind =
  | "media"
  | "composition"
  | "transcription"
  | "qa"
  | "image-generation"
  | "video-generation"
  | "editor"
  | "agent-host";

export type HealthStatus = "ready" | "degraded" | "unavailable";
export type CheckStatus = "PASS" | "WARN" | "FAIL" | "UNKNOWN";

export interface EngineIdentity {
  id: string;
  kind: EngineKind;
  displayName: string;
  version: string;
  apiVersion: typeof CEVRA_ENGINE_API_VERSION;
}

export interface CapabilityDescriptor {
  id: string;
  version: number;
  available: boolean;
  detail?: string;
}

export interface HealthCheckResult {
  id: string;
  status: CheckStatus;
  message?: string;
  evidence?: Record<string, unknown>;
}

export interface EngineHealth {
  status: HealthStatus;
  checkedAt: string;
  checks: HealthCheckResult[];
}

export interface ExecutionContext {
  jobId: string;
  locale: "pt-BR" | "en-US";
  signal?: AbortSignal;
}

export interface EngineAdapter {
  identity(): Promise<EngineIdentity>;
  healthcheck(): Promise<EngineHealth>;
  capabilities(): Promise<CapabilityDescriptor[]>;
}
