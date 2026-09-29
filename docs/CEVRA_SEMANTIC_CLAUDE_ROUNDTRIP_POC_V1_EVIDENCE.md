# Semantic Editorial Analysis — Claude CLI Round-trip PoC V1

**2026-09-29 — CLI INSTALLED / VERIFIED; BLOCKED — AUTH (human login required).**

Base: `a58ca419c2a0db2c416db83d84c432fcae23d830`.
Branch: `feat/semantic-claude-roundtrip-poc-v1`.
Slice A remains CLOSED; ADR 0030 remains IN DEVELOPMENT.
Global roadmap tracking remains **55%**.

## Current result

The explicitly authorized continuation from
`9e9370f4f98d02d777cea004d8aac703a0a20b2a` installed and verified official
Claude Code **2.1.280 / darwin-arm64** outside the repository. Native
`--version` and `--help` pass. Sanitized official `auth status` returned
`loggedIn: false`, `authMethod: none`, `apiProvider: firstParty`, exit 1.
The executable blocker is resolved; the next indispensable step is human
subscription login with this exact binary. No adapter was implemented ahead
of authentication/containment gates. Real harness executions remain **0 / 8**.

## Historical first preflight — before installation authorization

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

## Historical installed state observed before this continuation

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

## Why implementation originally stopped here

The adapter must be based on exact installed CLI behavior: effective argv,
stream-json envelopes, authentication, model/effort options, cancellation, and
error events. Implementing it against documentation alone would create another
unexercised transport scaffold and could silently encode incompatible behavior.
The task requires stopping on a missing compatible version and expressly
forbids replacing a pre-inference blocker with generic scaffolding.

No fake runner, Application test, real fixture, canary, rubric execution, or
CI command was added or run on this branch. Existing Slice A tests and CI remain
historical evidence from `main`; they are not relabelled as Claude evidence.

## Historical prerequisite — superseded by the authorized installation below

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

## Authorized installation and verification — 2026-09-29

The official `stable` marker was resolved once to **2.1.280**; all subsequent
artifact URLs are versioned, and no update was requested. The inspected
installer URL returned an empty body and was **not executed**. Direct download
was used instead; no curl-pipe-shell, global package manager or installer ran.

Release origin:
<https://downloads.claude.ai/claude-code-releases/2.1.280/>.
Binary: `darwin-arm64/claude`, **217,254,576 bytes**. The release manifest
records commit `80abbfe7d7232280011ff01a21ae3338f4c6e372` and build time
`2026-09-21T20:55:27Z`; these are upstream metadata, not CEVRA commits.

| Artifact | SHA-256 |
|---|---|
| `darwin-arm64/claude` | `387a5c5dcdbb815085edf0baf79591f9d8894efe922bceaf3d75b1b08055229d` |
| `manifest.json` | `6d9840c779f76b2a7e974aa3476be24d1ea477f5dc96abd0096be28a58cb7120` |
| `manifest.json.sig` | `7252aef91c11086a5ba217639213d1b97adee08989c45e88835212109372a778` |
| `claude-code.asc` | `bd70a5e4a268002704024ceba7f8446024114e94f3f0bdd11c23a9e592be81c6` |

The key came from <https://downloads.claude.ai/keys/claude-code.asc>.
Its primary fingerprint matched the independently published official setup
documentation: **31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE**. The detached
manifest signature verified; a one-byte modified manifest was rejected.
GPG was unavailable locally, so verification used **OpenPGP.js 6.3.2** only
in private disposable scratch, with the existing Node 24.19.0. Its official
npm tarball integrity was checked before loading:
`sha512-wcZTzHz41LV8Y48zH/JlD1JT8YdNmpWOuMAjQ/podvvCwsjBEU37K3znJh4UQcj3hksE5z9TzvhbUbwzsGvlLQ==`.
Only the verifier module and its license were extracted; no package lifecycle
script ran. License review: LGPL-3.0+ local verification-tool use only, no
linking into CEVRA, dependency/lockfile change or product redistribution.
No global GPG/toolchain was installed and no personal keyring was imported.

Native checks before execution:

- `file`: Mach-O 64-bit executable arm64;
- `codesign --verify --strict --verbose=2`: PASS;
- publisher: `Developer ID Application: Anthropic PBC (Q6L2SF6YDW)`;
- identifier: `com.anthropic.claude-code`, hardened runtime enabled;
- `spctl --assess --type install --verbose=4`: accepted,
  `source=Notarized Developer ID`;
- the separate `--type execute` assessment rejected the non-app executable
  with “the code is valid but does not seem to be an app”; this is recorded,
  not relabelled PASS. No Gatekeeper/quarantine bypass was used.

The directory chain was checked for ownership, symlinks and unsafe write
permissions. The version directory was created exclusively; each artifact
was copied without overwrite and the binary hash rechecked. Retained location:

`~/Library/Application Support/CEVRA/DeveloperTools/claude-code/2.1.280/`

It contains `claude` plus the manifest, detached signature, public key and a
local installation receipt. A post-preflight hash check still matched the
original binary digest; no semantic matrix ran, so no post-matrix claim is made.
There is no PATH/shell-profile/global-Claude-setting change. Claude.app and
its Linux VM payload remain untouched. Future removal is limited to this
exact version directory after confirming it is no longer needed; do not
remove the user's Claude configuration or other installations.

Official setup/auth/CLI references were revalidated. With an explicit child
environment (`HOME` unchanged; system PATH, USER, LANG and
`DISABLE_AUTOUPDATER=1`; no inherited API/cloud/gateway variables):

| Check | Actual result |
|---|---|
| `--version` | `2.1.280 (Claude Code)` |
| `--help` | PASS; lists restricted/safe-mode/tools/strict-MCP/permission-prompts/no-chrome/no-session-persistence/stream-json/model/effort |
| `auth status` | exit 1; not logged in; first-party provider; no credentials printed |
| `auth login --help` | `--claudeai` is subscription; `--console` is API billing and is not used |
| Effective managed policy/combined isolation | NOT VERIFIED; pre-inference gate after login |
| Opus access, effective model/Medium effort, subscription entitlement | NOT VERIFIED; no inference |
| Adapter/transport/Application integration and semantic matrix | NOT RUN / NOT IMPLEMENTED |

Help availability is not proof of effective containment or compatibility of
every flag combination. The original eight-execution quota is unconsumed.
No synthetic prompt, real media, repository context or chat was transmitted
to an analyzer. Installation/status traffic is not a semantic round-trip.

### Only required human action

Run the following from Terminal and finish the official browser login using
the existing Claude subscription. Do not select Console/API, enable extra
usage, send credentials to CEVRA, or copy tokens/auth files:

```sh
env -i HOME="$HOME" USER="$USER" PATH=/usr/bin:/bin:/usr/sbin:/sbin \
  LANG=en_US.UTF-8 DISABLE_AUTOUPDATER=1 \
  "$HOME/Library/Application Support/CEVRA/DeveloperTools/claude-code/2.1.280/claude" \
  auth login --claudeai
```

Then recheck sanitized auth, effective managed policy/containment and the
binary hash before implementing the adapter or consuming the real matrix.
No credentials, account identifiers or login URLs are retained here. The
programming model/effort are not independently observable in this preflight;
the requested GPT-5.6 Sol/High are not asserted as effective configuration.

## Scope and confirmations (current)

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

Verdict: **BLOCKED — AUTH; INSTALLATION VERIFIED**. Slice A remains CLOSED;
complete semantic analysis and commercial integration remain NOT DELIVERED.
