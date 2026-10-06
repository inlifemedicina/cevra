import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lstat, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

const execute = promisify(execFile);
export class OwnedRenderResourceError extends Error {
  constructor(readonly code: "MEDIA_RENDER_MEMORY_LIMIT" | "MEDIA_RENDER_DISK_LIMIT" | "MEDIA_RENDER_RESOURCE_OBSERVATION_FAILED" | "MEDIA_RENDER_RESOURCE_BUSY") {
    super(code); this.name = "OwnedRenderResourceError";
  }
}
export interface OwnedRenderResourceSample {
  rendererRssBytes: number; ownedLogicalBytes: number; ownedAllocatedBytes: number; processIds: readonly number[];
  processRssBytes?: readonly { pid: number; rssBytes: number }[];
}
export interface OwnedRenderResourceEvidence {
  samples: number; peakRendererRssBytes: number; peakOwnedLogicalBytes: number; peakOwnedAllocatedBytes: number;
  enforcement: "sampled-watchdog"; intervalMs: 100;
}
export type OwnedRenderResourceObserver = (processGroupId: number, ownedDirectory: string) => Promise<OwnedRenderResourceSample>;

/** Own private POSIX group only; no command lines, environment or unrelated process details. */
async function groupRss(group: number): Promise<{ rendererRssBytes: number; processIds: number[]; processRssBytes?: { pid: number; rssBytes: number }[] }> {
  if (process.platform === "win32" || !Number.isSafeInteger(group) || group < 1) throw new OwnedRenderResourceError("MEDIA_RENDER_RESOURCE_OBSERVATION_FAILED");
  let members: string;
  try { members = (await execute("/usr/bin/pgrep", ["-g", String(group), "."], { timeout: 1000, maxBuffer: 1024 * 1024 })).stdout; }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 1) return { rendererRssBytes: 0, processIds: [] };
    throw error;
  }
  const ids = members.trim().split(/\s+/u);
  if (!ids.length || ids.some(id => !/^[1-9][0-9]*$/u.test(id))) throw Error("Invalid owned process observation.");
  const output = (await execute("/bin/ps", ["-p", ids.join(","), "-o", "pid=,pgid=,rss="], { timeout: 1000, maxBuffer: 1024 * 1024 })).stdout;
  let bytes = 0; const processIds: number[] = [], processRssBytes: { pid: number; rssBytes: number }[] = [];
  for (const line of output.trim().split("\n")) {
    const values = line.trim().split(/\s+/u).map(Number);
    if (values.length !== 3 || values.some(value => !Number.isSafeInteger(value) || value < 0)) throw Error("Invalid owned RSS observation.");
    const [pid, pgid, rss] = values;
    if (pgid !== group || !ids.includes(String(pid))) throw Error("Owned process membership changed.");
    bytes += rss! * 1024; processIds.push(pid!); processRssBytes.push({ pid: pid!, rssBytes: rss! * 1024 });
  }
  if (!Number.isSafeInteger(bytes)) throw Error("RSS overflow.");
  return { rendererRssBytes: bytes, processIds, processRssBytes };
}

/** Conservative per-entry accounting includes input copies, staging, graphs and intermediates in this owned tree.
 * Hard links count for each name. Symlinks and special files fail observation instead of following foreign paths.
 * Polling is not an instantaneous cap; the pipeline must keep every live allocation inside the registered tree.
 */
export async function observeOwnedRenderResources(processGroupId: number, ownedDirectory: string): Promise<OwnedRenderResourceSample> {
  try {
    if (!isAbsolute(ownedDirectory)) throw Error();
    const canonical = await realpath(ownedDirectory), before = await lstat(ownedDirectory, { bigint: true });
    if (canonical !== ownedDirectory || !before.isDirectory() || before.isSymbolicLink()) throw Error();
    let logical = 0n, allocated = 0n, entries = 0;
    const visit = async (directory: string, depth: number): Promise<void> => {
      if (depth > 32) throw Error();
      for (const name of await readdir(directory)) {
        if (++entries > 100_000) throw Error();
        const path = join(directory, name); let metadata;
        try { metadata = await lstat(path, { bigint: true }); }
        catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") continue; throw error; }
        if (metadata.isSymbolicLink()) throw Error();
        if (metadata.isDirectory()) await visit(path, depth + 1);
        else if (metadata.isFile()) { logical += metadata.size; allocated += metadata.blocks * 512n; }
        else throw Error();
      }
    };
    await visit(ownedDirectory, 0);
    const after = await lstat(ownedDirectory, { bigint: true });
    if (after.dev !== before.dev || after.ino !== before.ino || !after.isDirectory() || after.isSymbolicLink()) throw Error();
    if (logical > BigInt(Number.MAX_SAFE_INTEGER) || allocated > BigInt(Number.MAX_SAFE_INTEGER)) throw Error();
    const group = await groupRss(processGroupId);
    return { ...group, ownedLogicalBytes: Number(logical), ownedAllocatedBytes: Number(allocated) };
  } catch { throw new OwnedRenderResourceError("MEDIA_RENDER_RESOURCE_OBSERVATION_FAILED"); }
}

export class OwnedRenderResourceWatchdog {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: Promise<void> | undefined;
  private stopped = false;
  private failure: OwnedRenderResourceError | undefined;
  private readonly evidence: OwnedRenderResourceEvidence = { samples: 0, peakRendererRssBytes: 0, peakOwnedLogicalBytes: 0, peakOwnedAllocatedBytes: 0, enforcement: "sampled-watchdog", intervalMs: 100 };
  private rootIdentity: { device: bigint; inode: bigint } | undefined;
  private latestProcessIds: readonly number[] = [];
  get processIds(): readonly number[] { return this.latestProcessIds; }
  constructor(private readonly options: {
    processGroupId: number; ownedDirectory: string; rendererRssLimitBytes: number; ownedFileLimitBytes: number;
    observe?: OwnedRenderResourceObserver; onFailure(error: OwnedRenderResourceError): void;
  }) {
    if (![options.rendererRssLimitBytes, options.ownedFileLimitBytes].every(value => Number.isSafeInteger(value) && value > 0)) throw new RangeError("Resource limits must be positive safe integers.");
  }
  async start(): Promise<void> {
    try {
      const root = await lstat(this.options.ownedDirectory, { bigint: true });
      if (!root.isDirectory() || root.isSymbolicLink()) throw Error();
      this.rootIdentity = { device: root.dev, inode: root.ino };
    } catch { this.fail(new OwnedRenderResourceError("MEDIA_RENDER_RESOURCE_OBSERVATION_FAILED")); }
    await this.sample(); this.assertHealthy(); this.schedule();
  }
  async stop(): Promise<OwnedRenderResourceEvidence> {
    this.stopped = true; if (this.timer) clearTimeout(this.timer); await this.pending;
    this.assertHealthy(); return Object.freeze({ ...this.evidence });
  }
  async check(): Promise<void> {
    await this.pending; if (this.timer) clearTimeout(this.timer);
    this.pending = this.sample();
    try { await this.pending; this.assertHealthy(); }
    finally { this.pending = undefined; this.schedule(); }
  }
  private assertHealthy(): void { if (this.failure) throw this.failure; }
  private schedule(): void {
    if (this.stopped || this.failure) return;
    this.timer = setTimeout(() => { this.pending = this.sample().finally(() => { this.pending = undefined; this.schedule(); }); }, 100);
  }
  private async sample(): Promise<void> {
    if (this.failure) return;
    try {
      const root = await lstat(this.options.ownedDirectory, { bigint: true });
      if (!this.rootIdentity || root.dev !== this.rootIdentity.device || root.ino !== this.rootIdentity.inode || !root.isDirectory() || root.isSymbolicLink()) throw Error();
      const result = await (this.options.observe ?? observeOwnedRenderResources)(this.options.processGroupId, this.options.ownedDirectory);
      const after = await lstat(this.options.ownedDirectory, { bigint: true });
      if (after.dev !== this.rootIdentity.device || after.ino !== this.rootIdentity.inode || !after.isDirectory() || after.isSymbolicLink()) throw Error();
      if (![result.rendererRssBytes, result.ownedLogicalBytes, result.ownedAllocatedBytes].every(value => Number.isSafeInteger(value) && value >= 0)) throw Error();
      if (!Array.isArray(result.processIds) || result.processIds.some(pid => !Number.isSafeInteger(pid) || pid < 1)) throw Error();
      this.latestProcessIds = Object.freeze([...result.processIds]);
      ++this.evidence.samples;
      this.evidence.peakRendererRssBytes = Math.max(this.evidence.peakRendererRssBytes, result.rendererRssBytes);
      this.evidence.peakOwnedLogicalBytes = Math.max(this.evidence.peakOwnedLogicalBytes, result.ownedLogicalBytes);
      this.evidence.peakOwnedAllocatedBytes = Math.max(this.evidence.peakOwnedAllocatedBytes, result.ownedAllocatedBytes);
      if (result.rendererRssBytes > this.options.rendererRssLimitBytes) this.fail(new OwnedRenderResourceError("MEDIA_RENDER_MEMORY_LIMIT"));
      else if (Math.max(result.ownedLogicalBytes, result.ownedAllocatedBytes) > this.options.ownedFileLimitBytes) this.fail(new OwnedRenderResourceError("MEDIA_RENDER_DISK_LIMIT"));
    } catch { this.fail(new OwnedRenderResourceError("MEDIA_RENDER_RESOURCE_OBSERVATION_FAILED")); }
  }
  private fail(error: OwnedRenderResourceError): void {
    if (this.failure) return;
    this.failure = error; this.options.onFailure(error);
  }
}
