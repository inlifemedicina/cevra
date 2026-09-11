declare module "node:child_process" {
  export interface WritableStreamLike {
    writable: boolean;
    write(data: string, callback?: (error?: Error | null) => void): boolean;
  }
  export interface ReadableStreamLike {
    on(event: "data", listener: (chunk: { toString(encoding?: string): string }) => void): this;
  }
  export interface ChildProcessWithoutNullStreams {
    readonly pid?: number;
    readonly exitCode: number | null;
    readonly stdin: WritableStreamLike;
    readonly stdout: ReadableStreamLike;
    readonly stderr: ReadableStreamLike;
    once(event: "exit", listener: (code: number | null, signal: string | null) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    kill(signal?: string): boolean;
  }
  export interface SpawnOptionsWithoutStdio {
    cwd?: string;
    env?: Record<string, string | undefined>;
    shell?: boolean;
    windowsHide?: boolean;
  }
  export function spawn(command: string, args: readonly string[], options: SpawnOptionsWithoutStdio): ChildProcessWithoutNullStreams;
}

declare module "node:fs" {
  export function existsSync(path: string): boolean;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
}

declare const process: {
  env: Record<string, string | undefined>;
};
