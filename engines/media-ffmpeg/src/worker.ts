export interface WorkerCheck {
  id: string;
  status: "PASS" | "WARN" | "FAIL" | "UNKNOWN";
  message?: string;
  evidence?: Record<string, unknown>;
}

export interface MediaWorkerInfo {
  name: string;
  version: string;
  protocolVersion: number;
  upstream: {
    id: "ffmpeg-skill";
    version: string;
    contractVersion: string;
  };
}

export interface MediaWorkerHealth {
  ok: boolean;
  checkedAt: string;
  checks: WorkerCheck[];
  tools: Record<string, { usable: "yes" | "no" | "unknown"; missing?: string[]; detail?: string }>;
}

export interface MediaWorkerToolResult {
  isError?: boolean;
  content?: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
}

export interface MediaWorkerClient {
  info(): Promise<MediaWorkerInfo>;
  health(): Promise<MediaWorkerHealth>;
  listTools(): Promise<Array<{ name: string; inputSchema?: Record<string, unknown> }>>;
  callTool(name: string, arguments_: Record<string, unknown>): Promise<MediaWorkerToolResult>;
}
