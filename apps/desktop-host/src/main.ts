import { createProductionDesktopSession } from "./session.js";
import { DesktopHostProtocolServer } from "./server.js";

void start().catch((cause) => {
  process.stderr.write(`[cevra-desktop-host] startup failed: ${cause instanceof Error ? cause.message : "unknown"}\n`);
  process.exit(1);
});

async function start(): Promise<void> {
  let shuttingDown = false;
  let session: Awaited<ReturnType<typeof createProductionDesktopSession>> | null = null;
  let startupError: unknown;
  try {
    session = await createProductionDesktopSession();
  } catch (cause) {
    startupError = cause;
  }
  const server = new DesktopHostProtocolServer(session, {
    writeProtocolLine(line) { process.stdout.write(line); },
    writeLog(line) { process.stderr.write(`[cevra-desktop-host] ${line}\n`); },
    requestShutdown() { void shutdown(0); }
  }, startupError);

  process.stdin.on("data", (chunk: Buffer) => server.accept(chunk));
  process.stdin.on("end", () => { server.finish(); void shutdown(0); });
  process.stdin.on("error", (cause) => {
    process.stderr.write(`[cevra-desktop-host] stdin failed: ${cause.message}\n`);
    void shutdown(1);
  });
  process.on("SIGTERM", () => { void shutdown(0); });
  process.on("SIGINT", () => { void shutdown(0); });
  process.stderr.write("[cevra-desktop-host] ready\n");

  async function shutdown(exitCode: number): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdin.pause();
    const forced = setTimeout(() => process.exit(1), 5000);
    forced.unref();
    try {
      await session?.close();
    } finally {
      clearTimeout(forced);
      process.exit(exitCode);
    }
  }
}
