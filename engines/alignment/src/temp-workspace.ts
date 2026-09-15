import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import type { AlignmentAudioLease, AlignmentAudioWorkspace } from "@cevra/contracts";
import { LocalAlignmentError } from "./errors.js";

export class NodeAlignmentAudioWorkspace implements AlignmentAudioWorkspace {
  constructor(
    private readonly root: string,
    private readonly removeDirectory: typeof rm = rm
  ) {
    if (!isAbsolute(root)) throw new LocalAlignmentError("ALIGNMENT_INVALID_REQUEST", "Alignment temporary root must be absolute.");
  }
  async acquire(_jobId: string): Promise<AlignmentAudioLease> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const directory = await mkdtemp(join(resolve(this.root), "job-"));
    let released = false;
    return {
      outputUri: join(directory, "audio.wav"),
      release: async () => {
        if (released) return;
        await this.removeDirectory(directory, { recursive: true, force: true });
        released = true;
      }
    };
  }
}
