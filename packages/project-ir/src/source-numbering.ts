import type { Id, SourceAsset } from "./types.js";

export interface SourceNumberIdentity {
  sourceId: Id;
  number: number;
}

/** Persistent presentation identity, independent of reversible audiovisual state. */
export interface SourceNumberingV1 {
  version: 1;
  nextNumber: number;
  sources: SourceNumberIdentity[];
}

export function assertValidSourceNumbering(value: unknown): SourceNumberingV1 {
  if (!record(value) || !keys(value, ["version", "nextNumber", "sources"]) || value.version !== 1
      || !positiveInteger(value.nextNumber) || !Array.isArray(value.sources)) {
    throw new Error("Invalid source numbering registry.");
  }
  const ids = new Set<string>();
  const used = new Set<number>();
  for (const identity of value.sources) {
    if (!record(identity) || !keys(identity, ["sourceId", "number"])
        || typeof identity.sourceId !== "string" || identity.sourceId.length === 0
        || !positiveInteger(identity.number)) {
      throw new Error("Invalid source numbering identity.");
    }
    if (ids.has(identity.sourceId) || used.has(identity.number as number)) {
      throw new Error("Source numbering identity collision.");
    }
    if ((identity.number as number) >= (value.nextNumber as number)) {
      throw new Error("Source numbering counter would reuse an allocated number.");
    }
    ids.add(identity.sourceId);
    used.add(identity.number as number);
  }
  return structuredClone(value) as unknown as SourceNumberingV1;
}

/** Owned by ProjectHistory; export/import is detached and reservations never rewind. */
export class SourceNumberRegistry {
  private readonly identities: Map<Id, SourceNumberIdentity>;
  private nextNumber: number;

  constructor(input: SourceNumberingV1 = { version: 1, nextNumber: 1, sources: [] }) {
    const registry = assertValidSourceNumbering(input);
    this.nextNumber = registry.nextNumber;
    this.identities = new Map(registry.sources.map(identity => [identity.sourceId, identity]));
  }

  reserve(source: Pick<SourceAsset, "id">): void {
    if (typeof source.id !== "string" || source.id.length === 0) throw new Error("Invalid source numbering source.");
    const existing = this.identities.get(source.id);
    if (existing) return;
    const number = this.nextNumber;
    if (number >= Number.MAX_SAFE_INTEGER) throw new Error("Source numbering counter is exhausted.");
    this.identities.set(source.id, { sourceId: source.id, number });
    this.nextNumber = number + 1;
  }

  assertReserved(source: Pick<SourceAsset, "id">): void {
    const identity = this.identities.get(source.id);
    if (!identity) throw new Error("History source numbering is missing or mismatched.");
  }

  toRegistry(): SourceNumberingV1 {
    return { version: 1, nextNumber: this.nextNumber, sources: [...this.identities.values()].map(identity => ({ ...identity })) };
  }
}

export function sourceNumberingForSources(sources: readonly SourceAsset[]): SourceNumberingV1 {
  const registry = new SourceNumberRegistry();
  for (const source of sources) registry.reserve(source);
  return registry.toRegistry();
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length && actual.every(key => expected.includes(key));
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
