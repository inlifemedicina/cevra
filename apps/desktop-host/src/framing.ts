import { MAX_JSONL_MESSAGE_BYTES } from "./protocol.js";

export class JsonLineFramer {
  private chunks: Buffer[] = [];
  private bufferedBytes = 0;

  constructor(private readonly maximumBytes = MAX_JSONL_MESSAGE_BYTES) {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) throw new RangeError("maximumBytes must be positive.");
  }

  push(chunk: Buffer): string[] {
    const lines: string[] = [];
    let cursor = 0;
    for (;;) {
      const newline = chunk.indexOf(0x0a, cursor);
      if (newline < 0) {
        this.append(chunk.subarray(cursor));
        break;
      }
      this.append(chunk.subarray(cursor, newline));
      const line = Buffer.concat(this.chunks, this.bufferedBytes).toString("utf8");
      this.chunks = [];
      this.bufferedBytes = 0;
      if (line.trim().length > 0) lines.push(line);
      cursor = newline + 1;
    }
    return lines;
  }

  finish(): void {
    if (this.bufferedBytes !== 0) throw new Error("Desktop host stdin ended with an incomplete JSONL message.");
  }

  private append(chunk: Buffer): void {
    if (chunk.length === 0) return;
    this.bufferedBytes += chunk.length;
    if (this.bufferedBytes > this.maximumBytes) {
      this.chunks = [];
      this.bufferedBytes = 0;
      throw new RangeError(`Desktop host JSONL message exceeds ${this.maximumBytes} bytes.`);
    }
    this.chunks.push(chunk);
  }
}
