import { createHash } from "node:crypto";

export function canonicalJson(value: unknown): string {
  return encode(value, new Set());
}

export function sha256Digest(value: string | Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function encode(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new TypeError("Cache JSON numbers must be finite and not negative zero.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    guardCycle(value, ancestors);
    const result = `[${value.map((item) => encode(item, ancestors)).join(",")}]`;
    ancestors.delete(value);
    return result;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const prototype = Object.getPrototypeOf(record);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Cache JSON accepts only plain objects.");
    guardCycle(record, ancestors);
    const parts = Object.keys(record).sort().map((key) => {
      if (record[key] === undefined) throw new TypeError("Cache JSON does not accept undefined.");
      return `${JSON.stringify(key)}:${encode(record[key], ancestors)}`;
    });
    ancestors.delete(record);
    return `{${parts.join(",")}}`;
  }
  throw new TypeError("Cache JSON value is not serializable.");
}

function guardCycle(value: object, ancestors: Set<object>): void {
  if (ancestors.has(value)) throw new TypeError("Cache JSON value is cyclic.");
  ancestors.add(value);
}
