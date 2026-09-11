import { CURRENT_SCHEMA_VERSION, type CevraLocale, type ProjectIR } from "./types.js";

export interface CreateProjectOptions {
  id?: string;
  name?: string;
  locale?: CevraLocale;
  now?: string;
}

function randomId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `cevra_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function createEmptyProject(options: CreateProjectOptions = {}): ProjectIR {
  const now = options.now ?? new Date().toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    project: {
      id: options.id ?? randomId(),
      name: options.name ?? "Untitled Project",
      createdAt: now,
      updatedAt: now,
      defaultLocale: options.locale ?? "pt-BR"
    },
    sources: [],
    transcript: { words: [], segments: [] },
    timeline: { durationMs: 0, tracks: [], clips: [] },
    captions: [],
    graphics: [],
    layouts: [],
    audio: { masterGainDb: 0 },
    style: {},
    generation: [],
    history: { revision: 0 },
    qa: [],
    exports: [],
    extensions: {}
  };
}
