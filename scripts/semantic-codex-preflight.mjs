/** Metadata-only PoC preflight. Deliberately cannot create threads or turns. */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { TextDecoder } from "node:util";

export const EXPECTED_VERSION = "codex-cli 0.155.0-alpha.16";
export const EXPECTED_BINARY_SHA256 = "2f76d9cb0acab786dbb1cbf1020e8001d0e6d4de7b3c87a5d5769a4d03480f13";
const METHODS = new Set(["initialize", "config/read", "configRequirements/read", "account/read", "account/rateLimits/read", "model/list", "modelProvider/capabilities/read"]);
const NOTIFICATIONS = new Set(["configWarning", "deprecationNotice", "account/updated", "account/rateLimits/updated", "remoteControl/status/changed"]);
const DISABLED_FEATURES = ["shell_tool", "unified_exec", "unified_exec_tty", "shell_snapshot", "apps", "plugins", "hooks", "memories", "multi_agent", "browser_use", "browser_use_external", "browser_use_full_cdp_access", "computer_use", "in_app_browser", "image_generation", "view_image", "workspace_dependencies", "skill_search", "skill_mcp_dependency_install", "code_mode", "code_mode_host", "sleep_tool", "tool_suggest", "remote_plugin", "remote_control"];
export const OVERRIDES = [
  'approval_policy="never"', 'sandbox_mode="read-only"', 'web_search="disabled"',
  "project_doc_max_bytes=0", 'developer_instructions=""', "mcp_servers={}",
  ...DISABLED_FEATURES.map(name => `features.${name}=false`),
  "features.skip_host_skill_discovery=true"
];

export class PreflightError extends Error {
  constructor(code) { super(code); this.name = "PreflightError"; this.code = code; }
}

/** Bounded framing before JSON parsing; no transcript or personal config logs. */
export class JsonLines {
  constructor(onMessage, { lineBytes = 1024 * 1024, totalBytes = 8 * 1024 * 1024, events = 256 } = {}) {
    this.onMessage = onMessage; this.lineBytes = lineBytes; this.totalBytes = totalBytes;
    this.maxEvents = events; this.parts = []; this.size = 0; this.bytes = 0; this.events = 0;
  }
  push(chunk) {
    this.bytes += chunk.length;
    if (this.bytes > this.totalBytes) throw new PreflightError("TOTAL_LIMIT");
    let start = 0;
    while (start < chunk.length) {
      const end = chunk.indexOf(10, start);
      const part = chunk.subarray(start, end < 0 ? chunk.length : end);
      this.size += part.length;
      if (this.size > this.lineBytes) throw new PreflightError("LINE_LIMIT");
      if (part.length) this.parts.push(part);
      if (end < 0) break;
      if (++this.events > this.maxEvents) throw new PreflightError("EVENT_LIMIT");
      let message;
      try { message = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(this.parts, this.size))); }
      catch { throw new PreflightError("INVALID_JSONL"); }
      this.parts = []; this.size = 0;
      if (!message || typeof message !== "object" || Array.isArray(message)) throw new PreflightError("INVALID_MESSAGE");
      this.onMessage(message);
      start = end + 1;
    }
  }
  end() { if (this.size !== 0) throw new PreflightError("PARTIAL_EOF"); }
}

export class MetadataClient {
  constructor(child, timeoutMs = 20_000) {
    this.child = child; this.id = 0; this.pending = new Map(); this.stderrBytes = 0;
    this.error = undefined; this.closed = false; this.closing = false; this.notifications = 0;
    this.done = new Promise(resolveDone => { this.resolveDone = resolveDone; });
    this.decoder = new JsonLines(message => this.receive(message));
    child.stdout.on("data", bytes => { try { this.decoder.push(bytes); } catch (e) { this.fail(e); } });
    child.stderr.on("data", bytes => {
      this.stderrBytes += bytes.length;
      if (this.stderrBytes > 64 * 1024) this.fail(new PreflightError("STDERR_LIMIT"));
    });
    child.on("error", () => this.fail(new PreflightError("PROCESS_ERROR")));
    child.on("close", () => {
      this.closed = true; clearTimeout(this.timer); clearTimeout(this.killTimer);
      try { this.decoder.end(); } catch (e) { this.fail(e); }
      if (this.pending.size || !this.closing) this.fail(new PreflightError("UNEXPECTED_EOF"));
      this.resolveDone();
    });
    child.stdin.on("error", () => this.fail(new PreflightError("WRITE_ERROR")));
    this.timer = setTimeout(() => this.fail(new PreflightError("PREFLIGHT_TIMEOUT")), timeoutMs);
  }
  receive(message) {
    if (message.method !== undefined) {
      if (message.id !== undefined || !NOTIFICATIONS.has(message.method)) {
        const error = new PreflightError("UNEXPECTED_SERVER_REQUEST_OR_EVENT");
        error.unexpectedMethod = typeof message.method === "string" && /^[A-Za-z][A-Za-z0-9/_-]{0,79}$/.test(message.method) ? message.method : "redacted";
        error.serverRequest = message.id !== undefined;
        throw error;
      }
      this.notifications++; return;
    }
    const waiting = this.pending.get(message.id);
    if (!waiting) throw new PreflightError("UNKNOWN_OR_DUPLICATE_RESPONSE");
    const hasResult = Object.hasOwn(message, "result"), hasError = Object.hasOwn(message, "error");
    if (hasResult === hasError) throw new PreflightError("INVALID_RESPONSE");
    this.pending.delete(message.id);
    if (hasError) waiting.reject(new PreflightError("RPC_ERROR")); // Never print provider error payloads.
    else waiting.resolve(message.result);
  }
  async request(method, params) {
    if (!METHODS.has(method)) throw new PreflightError("FORBIDDEN_METHOD");
    if (this.error) throw this.error;
    if (this.closed || this.closing) throw new PreflightError("CLOSED");
    const id = ++this.id;
    return new Promise((resolveResult, reject) => {
      this.pending.set(id, { resolve: resolveResult, reject });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }
  initialized() {
    if (this.error || this.closed || this.closing) throw new PreflightError("CLOSED");
    this.child.stdin.write('{"method":"initialized","params":{}}\n');
  }
  fail(error) {
    this.error ??= error;
    for (const waiting of this.pending.values()) waiting.reject(this.error);
    this.pending.clear(); this.stop();
  }
  stop() {
    if (this.closing) return;
    this.closing = true; clearTimeout(this.timer);
    if (!this.closed) {
      this.child.stdin.end(); this.child.kill("SIGTERM");
      this.killTimer = setTimeout(() => this.child.kill("SIGKILL"), 1000);
    }
  }
  async close() { this.stop(); await this.done; }
}

export function safeConfigSummary(config) {
  const mcp = Object.values(config.mcp_servers ?? {});
  return {
    approval: config.approval_policy, sandbox: config.sandbox_mode, webSearch: config.web_search,
    projectDocMaxBytes: config.project_doc_max_bytes,
    disabledFeatureCount: DISABLED_FEATURES.filter(name => config.features?.[name] === false).length,
    expectedDisabledFeatureCount: DISABLED_FEATURES.length,
    skipHostSkillDiscovery: config.features?.skip_host_skill_discovery === true,
    inheritedMcpCount: mcp.length, enabledMcpCount: mcp.filter(value => value.enabled !== false).length,
    pluginConfigCount: Object.keys(config.plugins ?? {}).length,
    developerInstructionsPresent: Boolean(config.developer_instructions),
    instructionsPresent: Boolean(config.instructions),
    modelInstructionsFilePresent: Boolean(config.model_instructions_file)
  };
}

async function inspect(binary, cwd, extraOverrides, discoverAccount) {
  // No API keys or other provider credentials inherited as environment variables.
  const env = Object.fromEntries(["HOME", "USER", "LOGNAME", "PATH", "TMPDIR", "LANG", "SHELL", "CODEX_HOME"].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  const child = spawn(binary, ["app-server", "--strict-config", "--listen", "stdio://", ...[...OVERRIDES, ...extraOverrides].flatMap(value => ["-c", value])], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
  const client = new MetadataClient(child);
  try {
    await client.request("initialize", { clientInfo: { name: "cevra_semantic_poc_preflight", title: "CEVRA metadata-only containment preflight", version: "0.1.0" }, capabilities: { experimentalApi: true } });
    client.initialized();
    const read = await client.request("config/read", { cwd, includeLayers: true });
    const summary = safeConfigSummary(read.config);
    const disableMcp = Object.keys(read.config.mcp_servers ?? {}).map(key => {
      if (!/^[A-Za-z0-9_-]+$/.test(key)) throw new PreflightError("MCP_OVERRIDE_KEY_UNSUPPORTED");
      return `mcp_servers.${key}.enabled=false`;
    });
    const result = { summary, disableMcp };
    if (discoverAccount) {
      const account = await client.request("account/read", { refreshToken: false });
      result.authMode = account.account?.type ?? "absent";
      if (result.authMode !== "chatgpt") throw new PreflightError("CHATGPT_AUTH_REQUIRED");
      const models = await client.request("model/list", { includeHidden: false });
      const selected = models.data.find(model => model.model === "gpt-5.6-sol");
      result.preferredModelAvailable = Boolean(selected);
      result.mediumAvailable = Boolean(selected?.supportedReasoningEfforts.some(value => value.reasoningEffort === "medium"));
      const requirements = await client.request("configRequirements/read", {});
      result.managedRequirementsPresent = requirements.requirements !== null;
      result.providerCapabilities = await client.request("modelProvider/capabilities/read", {});
      const limits = await client.request("account/rateLimits/read", {});
      const windows = Object.values(limits.rateLimitsByLimitId ?? {}).flatMap(value => [value.primary, value.secondary]).filter(Boolean);
      result.usageWindows = windows.map(value => ({ usedPercent: value.usedPercent, windowDurationMins: value.windowDurationMins }));
    }
    result.transport = { stdoutBytes: client.decoder.bytes, stderrBytes: client.stderrBytes, notifications: client.notifications };
    return result;
  } finally { await client.close(); if (client.error) throw client.error; }
}

export async function runPreflight(binary) {
  const digest = createHash("sha256"); for await (const chunk of createReadStream(binary)) digest.update(chunk);
  if (digest.digest("hex") !== EXPECTED_BINARY_SHA256) throw new PreflightError("BINARY_CHANGED_REVIEW_REQUIRED");
  const cwd = await mkdtemp(join(tmpdir(), "cevra-codex-metadata-"));
  const first = await inspect(binary, cwd, [], false);
  const second = await inspect(binary, cwd, first.disableMcp, true);
  // Discovery is not a tools-deny-all attestation. Do not add thread/start here.
  return {
    version: EXPECTED_VERSION, binarySha256: EXPECTED_BINARY_SHA256,
    initialConfig: first.summary, hardenedConfig: second.summary,
    authMode: second.authMode, preferredModelAvailable: second.preferredModelAvailable,
    mediumAvailable: second.mediumAvailable, usageWindows: second.usageWindows,
    managedRequirementsPresent: second.managedRequirementsPresent,
    providerCapabilities: second.providerCapabilities, transport: second.transport,
    threadStarts: 0, turnStarts: 0, containmentVerified: false,
    verdict: "BLOCKED — CONTAINMENT",
    reason: "No verified pre-thread native-tools/instruction-sources deny-all contract for the installed build. Empty environments is not an effective tool-inventory attestation."
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new PreflightError("EXPLICIT_BINARY_PATH_REQUIRED");
    console.log(JSON.stringify(await runPreflight(resolve(process.argv[2])), null, 2));
    process.exitCode = 2; // Deliberate blocked gate, not a successful inference.
  } catch (error) { console.error(JSON.stringify(error instanceof PreflightError ? { code: error.code, unexpectedMethod: error.unexpectedMethod, serverRequest: error.serverRequest } : { code: "PREFLIGHT_FAILED" })); process.exitCode = 1; }
}
