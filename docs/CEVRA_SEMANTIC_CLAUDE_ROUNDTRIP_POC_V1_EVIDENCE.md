# Semantic Editorial Analysis — Claude CLI Round-trip PoC V1

**2026-09-29 — BLOCKED — VERSION.**

Base: `a58ca419c2a0db2c416db83d84c432fcae23d830`.
Branch: `feat/semantic-claude-roundtrip-poc-v1`.
Slice A remains CLOSED; ADR 0030 remains IN DEVELOPMENT.
Global roadmap tracking remains **55%**.

## Result

The preflight stopped before authentication, containment validation, adapter
implementation, semantic payload construction, or model inference. No
host-executable Claude Code CLI was found. The only discovered Claude Code
payload is an internal Linux/aarch64 executable managed by Claude Desktop; it
cannot execute on this macOS host and returned `exec format error` for both
`--version` and `--help`.

Real harness executions: **0 / 8**. Real analyzer turns: **0**. Runtime retries
or fallbacks: **0 observed**, because the runtime was never started. No API
call count is claimed.

This is not an authentication, entitlement, containment, model-quality, or
provider-failure verdict. It is the first unmet prerequisite for this exact
private PoC. The preserved Codex App Server diagnosis at
`788e9c0dd5b3f66a4b531ce70853a82ff5f0cfd1` remains exactly **BLOCKED —
CONTAINMENT**, with zero threads and zero turns; it is neither reclassified as
a reproduced escape nor generalized to Claude.

## Official mechanism revalidated

Official documentation consulted on 2026-09-29:

- <https://code.claude.com/docs/en/cli-reference>
- <https://code.claude.com/docs/en/headless>
- <https://code.claude.com/docs/en/settings>
- <https://code.claude.com/docs/en/authentication>
- <https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan>
- <https://code.claude.com/docs/en/agent-sdk/overview>

Current official facts relevant to the proposed next run:

- `claude -p` is the official non-interactive CLI/Agent SDK surface and accepts
  prompt content through stdin;
- `--restricted` removes command/code tools and WebFetch, avoids user/project
  settings, and requires Claude Code 2.1.248 or later;
- `--safe-mode` disables non-managed customizations while preserving normal
  authentication; managed policy may still apply;
- `--tools ""` removes built-in tools when no MCP tools remain, while
  `--disallowedTools "mcp__*"` separately denies MCP tools;
- `--strict-mcp-config` plus an empty explicit MCP configuration is the
  documented MCP-isolation control;
- `--permission-prompts none` requires 2.1.259 or later;
- `claude auth status` returns sanitized JSON and its `configDirectory` field
  requires 2.1.268 or later;
- `--no-session-persistence` controls local session storage, not remote
  retention;
- `--output-format stream-json`, `--max-turns 1`, `--model`, `--effort`,
  `--system-prompt`, and `--no-chrome` are documented CLI controls;
- the current support notice says Agent SDK, `claude -p`, and third-party app
  usage still draw from subscription usage limits. A reported USD value is a
  client-side estimate and is not proof of a charge.

`--bare` was rejected for this design because the current documentation says it
sets a simple mode that does not use the normal subscription login path and
still leaves Bash/read/edit tools. The candidate remains `--restricted` plus
`--safe-mode`, not `--bare`.

Documentation establishes a candidate mechanism, not support in a particular
binary. The task explicitly requires the installed executable and its help to
be checked before inference.

## Installed state observed

`command -v claude` and `which -a claude` returned no host command. No
executable named `claude` was found under the normal user CLI locations checked.

Claude Desktop is installed at `/Applications/Claude.app`:

- bundle identifier: `com.anthropic.claudefordesktop`;
- app version: `2.16120.0`;
- macOS app executable: Mach-O arm64.

The Desktop-managed Claude Code payload observed at
`~/Library/Application Support/Claude/claude-code-vm/2.1.270/claude` has these
properties:

- version label from the containing directory and `.sdk-version`: `2.1.270`;
- format: ELF 64-bit Linux, ARM aarch64;
- interpreter: `/lib/ld-linux-aarch64.so.1`;
- SHA-256: `7bf9f33acc124df9abccf6f2366397a82a740378d535fa12d426fa77fdbc9946`;
- host result for `--version` and `--help`: `exec format error`.

The version is therefore a Desktop VM payload label, not a successful local
`claude --version` result. It is not a supported substitute for the requested
host CLI, and no undocumented Desktop/VM bridge was reverse-engineered.

No Anthropic, Claude, AWS, Google/Vertex, Azure/Foundry, or proxy environment
variable names were present in the preflight shell. No values, credentials,
cookies, Keychain records, account IDs, or authentication files were read.

Because the CLI could not start, these items remain **NOT VERIFIED**:

- `claude auth status`, subscription mode, and absence of Console/API billing;
- exact model identifier, Opus availability, and Medium effort support;
- installed support and effective argv for every isolation flag;
- managed policy, remaining hooks, effective tool inventory, MCP inventory,
  plugins, skills, memory, and instruction sources;
- stream-json event schema, usage reporting, retry/fallback behavior,
  cancellation behavior, and remote retention;
- semantic response quality and Application validation.

The programming session's model and effort were not introspected by this
preflight. The user-requested GPT-5.6 Sol / High configuration is not recorded
as observed fact and is not claimed to have been changed by the prompt.

## Why implementation stopped here

The adapter must be based on exact installed CLI behavior: effective argv,
stream-json envelopes, authentication, model/effort options, cancellation, and
error events. Implementing it against documentation alone would create another
unexercised transport scaffold and could silently encode incompatible behavior.
The task requires stopping on a missing compatible version and expressly
forbids replacing a pre-inference blocker with generic scaffolding.

No fake runner, Application test, real fixture, canary, rubric execution, or
CI command was added or run on this branch. Existing Slice A tests and CI remain
historical evidence from `main`; they are not relabelled as Claude evidence.

## Exact prerequisite and next action

Provide an official **macOS arm64 host-executable Claude Code CLI 2.1.270 or
later** at an explicit path (or on `PATH`) without changing account policy or
enabling extra usage. Version 2.1.270 satisfies the documented minimums above
if its own `--help` confirms the required flags. The next bounded attempt must
then, before any semantic input:

1. record `--version`, `--help`, file format, origin, architecture, and hash;
2. run sanitized `claude auth status` and confirm subscription rather than
   Console/API/cloud-provider billing;
3. confirm Opus/full model identifier and Medium effort without silent
   substitution or fallback;
4. prove effective no-tools/no-MCP/no-unmanaged-context isolation using the
   exact installed version and managed-policy behavior;
5. only then implement and test the adapter and consider the fixed real matrix.

Installation or update was not authorized in this task and was not attempted.
No inference should be retried until this single prerequisite is satisfied.

## Scope and confirmations

- no real or private data was sent;
- no synthetic transcript, canary contents, repository, chat, media, or patient
  data was sent to Claude;
- no API key, paid API, usage credit, extra usage, reset, purchase, or upgrade
  was used;
- no model, effort, billing mode, account setting, managed policy, or global
  Claude configuration was changed;
- no audiovisual state, Project IR, ProjectHistory, media runtime, Desktop
  production code, or later editorial slice was changed;
- no PR, merge, rebase, release, or tag was created;
- the Codex diagnosis branch and the media spike remain preserved;
- Director impact: **compatible I1/I3/I5 feasibility research only**; no new
  authority or product integration was introduced.

Verdict: **BLOCKED — VERSION**.
