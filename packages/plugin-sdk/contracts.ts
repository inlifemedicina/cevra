export interface Capability {
  id: string;
  available: boolean;
  version?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface AdapterHealth {
  ok: boolean;
  version?: string;
  capabilities: Capability[];
  details?: Record<string, unknown>;
}

export interface IntegrationProvider {
  id: string;
  configure?(configuration: Record<string, unknown>): Promise<void>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  healthcheck(): Promise<AdapterHealth>;
  capabilities(): Promise<Capability[]>;
}

export type MediaOperation =
  | { type: 'probe'; input: string }
  | { type: 'trim'; input: string; startMs: number; endMs: number; output: string }
  | { type: 'concat'; inputs: string[]; output: string }
  | { type: 'normalizeAudio'; input: string; output: string }
  | { type: 'fit'; input: string; output: string; width: number; height: number }
  | { type: 'extractAudio'; input: string; output: string };

export interface MediaResult {
  ok: boolean;
  output?: string;
  metadata?: Record<string, unknown>;
  error?: { code: string; message: string; details?: Record<string, unknown> };
}

export interface MediaEngineAdapter {
  readonly id: string;
  healthcheck(): Promise<AdapterHealth>;
  execute(operation: MediaOperation): Promise<MediaResult>;
}

export interface CompositionEngineAdapter {
  readonly id: string;
  healthcheck(): Promise<AdapterHealth>;
  preview(projectId: string): Promise<{ url: string }>;
  render(projectId: string, output: string): Promise<MediaResult>;
}

export interface TranscriptionEngineAdapter {
  readonly id: string;
  healthcheck(): Promise<AdapterHealth>;
  transcribe(input: string, options?: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface QaEngineAdapter {
  readonly id: string;
  healthcheck(): Promise<AdapterHealth>;
  inspect(projectId: string, options?: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
}

export interface ExternalEditorAdapter {
  readonly id: string;
  healthcheck(): Promise<AdapterHealth>;
  exportProject(projectId: string, destination: string): Promise<MediaResult>;
  importProject?(source: string): Promise<Record<string, unknown>>;
}
