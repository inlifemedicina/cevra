# Semantic Editorial Analysis — Claude CLI Round-trip PoC V1

**2026-09-29 — BLOCKED — EXPLICIT PROVIDER AUTHENTICATION ERROR AFTER CLEAN SESSION INIT.**

Base: `a58ca419c2a0db2c416db83d84c432fcae23d830`.
Branch: `feat/semantic-claude-roundtrip-poc-v1`.
Slice A remains CLOSED; ADR 0030 remains IN DEVELOPMENT.
Global roadmap tracking remains **55%**.

## Current result

After the user's official subscription login, sanitized auth reports
`loggedIn: true`, `authMethod: claude.ai`, `apiProvider: firstParty`,
`subscriptionType: pro`, exit 0. The binary's pinned hash, architecture,
publisher signature and notarization assessment still pass. Installation and
authentication are no longer blockers.

Historical state before the latest private diagnosis: the isolated adapter's first real canary was rejected at its first
initialization event; that checkpoint did not retain the failing field. A
focused diagnostic change preserved every pass/fail decision, and a second
canary with the same synthetic input and controls identified
`INIT_PLUGINS_NONEMPTY`: the `system/init` event reported **two plugins**.
`tools`, `mcp_servers` and `skills` were present as empty arrays, and bypass
was false. Both owned processes were terminated and reaped. At that checkpoint,
**2 / 8** real process attempts had been used, with **6 remaining**. No final
model response was accepted.
The reported plugin list is a failed capability gate, not evidence that a
plugin/tool ran, accessed data or escaped containment. Do not infer plugin
names, function, provenance or administrative origin from the count alone.

## Historical installation continuation — authentication then missing

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

### Historical required human action — now completed by the user

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

## Scope and confirmations at the installation-only checkpoint (historical)

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

## Authenticated continuation and first real canary — 2026-09-29

Initial branch HEAD: `c972d023f0127ae95ace6ae752a9ffc8a36b45db`.
The native canary tested code/harness/rubric checkpoint
`3ead64bc6699c887ea28110651b94146c3ae16b8`. Its sole sentence was
“A caixa tem uma etiqueta de rastreamento.”, projected from a synthetic source.
Only the bounded text envelope and first-party playbook were written to stdin;
no repository, programmer chat, source paths, private data or credentials were
supplied as prompt context. Remote receipt/inference before termination is not
proven either way; a failed early client attempt is not reported as zero remote
consumption. It conservatively consumes one of the eight authorized attempts.

### Preflight: configuration proof versus observed execution

- Original HOME retained for official auth; child environment is an explicit
  allowlist of HOME, system PATH, LANG and `DISABLE_AUTOUPDATER=1`. No inherited
  API/cloud/gateway credentials or endpoints. No auth file/Keychain extraction.
- The local system managed-settings directory and managed preference domain
  were absent. Official `doctor` reported remote managed settings “not fetched”
  because that mechanism requires Enterprise/Team; this account reports Pro.
  No administrative policy was bypassed. Custom-install PATH/launcher warnings
  were not “fixed” by editing personal/global configuration.
- Official current [CLI controls](https://code.claude.com/docs/en/cli-reference),
  [permissions](https://code.claude.com/docs/en/permissions),
  [settings](https://code.claude.com/docs/en/settings) and
  [model configuration](https://code.claude.com/docs/en/model-config) were checked
  against native 2.1.280 help. Restricted/safe mode do not supersede managed
  policy. System-prompt replacement avoids default programmer context.
- Spawn uses an absolute verified executable, `shell: false`, a fresh external
  private cwd, fresh session, stdin and explicit argv: restricted, safe-mode,
  `--tools` with a real empty string, strict empty MCP configuration,
  `--disallowedTools mcp__*`, permission-prompts none, empty setting-sources,
  disabled slash commands/Chrome/session persistence, max-turns 1, stream-json
  with verbose, requested `opus` / `medium`. No bare/bypass/resume/continue.
- These documented/versioned controls supported starting a minimal canary;
  the real initialization then failed the additional event gate. They are not
  relabelled as a successful effective-isolation demonstration.
- Neither the effective model ID nor effective effort was established by this
  failed attempt. Requested Opus/Medium are not substituted for observed values.
  Auth is subscription Pro, but status does not attest every account billing
  setting. No extra usage/purchase/API mode was enabled by CEVRA.

### Exact first-attempt result

| Item | Observed result |
|---|---|
| Real harness/process attempts | 1/8; 7 remain, not automatically consumed |
| Application result | `SEMANTIC_ANALYSIS_ANALYZER_UNAVAILABLE` |
| Transport result | `CONTAINMENT` on event 1 |
| stdout / stderr | 890 / 0 bytes |
| Process latency / total harness latency | 757.189 / 875.823 ms, this macOS arm64 host only |
| Child settlement | closed/reaped before adapter settlement |
| History / redo | archive byte-equivalent / redo preserved |
| Final semantic response, model, usage, charged cost | unavailable; not invented |
| PT-BR/EN-US editorial, continuation, hostile/visual, real cancellation | NOT RUN after gate failure |

At this code checkpoint, event 1 + `CONTAINMENT` narrows the rejection to a
`system/init` control assertion (tool/MCP/plugin/skill list or bypass mode).
That is a **code-path inference**, not a retained listing of the failing
field. The original reader deliberately discarded raw events and did not
retain sufficient sanitized shape diagnostics. No tool execution was observed.
Do not infer which list was nonempty, whether a field was missing, or whether
the client actually exposed a capability. The failed run cannot be retrospectively
reconstructed from invented metadata.

**FIX NOW for diagnosability, without another inference:** the final code adds
only allowlisted event type/subtype, list counts, bypass boolean and payload
byte counts to rejected-event receipts. No event text, thinking, paths or
arbitrary objects are retained. Deterministic tests cover that narrow addition.
It does not relax a containment assertion or make the failed canary pass.
The first run predates this diagnostic addition; its payload byte counts were
not recorded and are not replaced by a later fixture measurement.

The next concrete step is a focused review of initialization control semantics
and the non-content diagnostic, followed by at most one explicitly continued
canary under the remaining quota. It must identify the rejected field and
distinguish an unsupported/missing field from an enabled capability **before**
any gate adjustment or editorial matrix. No provider/model/billing substitution
is authorized by this blocker. There is no request to repeat login/install.

### Implemented/tested infrastructure, not a functional AI claim

The [private adapter and reproduction guide](../packages/agents/claude-poc/README.md)
define the pre-response rubric and six planned cases. Playbook instructions
are separate from the grading rubric, which is never sent to Claude.
The adapter satisfies the unchanged Application port through Node spawn;
it validates correlation, no-tool initialization/events, a single successful
turn/final result, exact observed Opus consistency, close/reap, and bounded
JSONL/stdout/stderr/events/final text. It performs no JSON repair, retry or
fallback and retains no thinking. The default Application 64 KiB first /
256 KiB cumulative / two-invocation limits remain unchanged.

Deterministic tests use a controlled Node child explicitly labelled **fake CLI**,
plus real ProjectHistory, projection, Application validation and two independent
continuation processes. They exercise fragmented UTF-8, authentication failure,
unexpected tools/control events, limits, process death, cancellation, delayed
settlement, stdin buffering, malformed/duplicate/partial results, citation rejection,
stale commit→undo, immutability, PT-BR/EN-US and unchanged history/redo.
They do not establish real CLI transport compatibility or semantic quality.

No CLOSED Application/projection/Project IR/history code changed. No SDK,
dependency, runtime pin, schema or product authority was added. Director impact:
compatible I1/I3/I5 **blocked feasibility work**, not Director implementation.
Slice A stays CLOSED; full semantic analysis and commercial integration are
NOT DELIVERED. Global progress remains **55%**.

### Validation and checkpoint ledger

| Layer | Checkpoint / result |
|---|---|
| Historical installation documentation | `c972d023f0127ae95ace6ae752a9ffc8a36b45db`; push CI [36627274406](https://github.com/inlifemedicina/cevra/actions/runs/36627274406) SUCCESS; not evidence for the new adapter |
| Real canary / first adapter | `3ead64bc6699c887ea28110651b94146c3ae16b8`; 30 deterministic tests PASS before the sole real attempt; real attempt BLOCKED as above |
| Final code/test checkpoint | `a534e9b17b71cadf94e3a65ccb981f802bed9370`; sanitized rejection diagnostics added, 31 deterministic tests PASS; no additional real attempt |
| Full local build/regression | `npm run ci`, Node 24.19.0, Python 3.12.14 available for Desktop checks; exit 0, 633 tests total including the 31 adapter tests |
| Local groups | Desktop UI 45; Desktop Host 74; Application 210; contracts 21; i18n 2; Project IR 53; Store 11; Transcript Cache 12; Alignment Node 33; Media Node 91; Transcription Node 50; PoC 31 — all PASS |
| Dependency audit | `npm audit --json`: zero vulnerabilities; no new dependency or lockfile change |
| Native ML / local Rust / FFmpeg rebuild | NOT RUN in this continuation; unrelated to this bounded transport change |
| New push CI | Required on the final pushed SHA; exact run/SHA/result belongs to the delivery report, not the historical run above |
| Exact managed Media Runtime | Branch excluded from the existing push allowlist; no manual dispatch or workflow change authorized/needed |

The rubric remains fixed and **editorial evaluation NOT RUN**. Installation,
auth, fake-process tests and normal CI cannot be used as a real-semantic PASS.
Programming model/effort are not independently observable here; requested
GPT-5.6 Sol/High are not reported as verified configuration. Claude's requested
Opus/Medium likewise remains distinct from the unavailable effective result.

The local official CLI installation is retained at the versioned path above,
with no binary change. The private matrix ledger and bounded failed-canary
receipt are retained outside the repository for quota/audit continuity; the
canonical facts are transcribed here, not a raw provider dump. No new login,
purchase, provider switch or broader project implementation is requested.

## Focused `system/init` diagnosis and canary #2 — 2026-09-29

The prior branch HEAD was `334e3c63a655ae48bb3520970a8852f250d0590b`
(normal CI [36639702121](https://github.com/inlifemedicina/cevra/actions/runs/36639702121),
SUCCESS 5/5). Diagnostic code/test checkpoint:
`b48f560581a01e2b8a67c990704b52417388c3ec`.
Only the init gate's failure diagnostics changed. The existing harness gained
the minimum bookkeeping needed to retain `canary.json` and write a distinct
`canary-2.json` in the **same** private ledger. It prevents a second child in
one canary operation and retains only bounded structural/result counts for the
canary, never its final text or raw events. Argv, flags, playbook, synthetic
sentence, model alias, effort, budgets and Application code were unchanged.

The failure reasons are a closed vocabulary. Each init list records only
presence, primitive structural type and count; model records a class, and
permission mode records a bypass boolean. No tool, plugin, skill or MCP name,
prompt, credential, path, provider error text, instructions or model supplied
free text is retained. The tests assert that arbitrary fixture names cannot
appear in errors or metrics. Missing required lists still fail; optional
plugin/skill lists have the same baseline acceptance rules. The patch does not
interpret a missing field as an empty list.

Tests **before** canary #2: `npm run test:claude-poc` **32/32 PASS**; directly
related `@cevra/application` **210/210 PASS**; harness syntax and
`git diff --check` PASS. Cases cover required list absent/wrong type/empty/
nonempty, optional list absent/empty/wrong type/nonempty, normal/bypass mode,
valid/invalid/drifting model, and preservation of prior rejection behavior.
All tests are deterministic fake-process tests; there was no inference in CI.
The binary SHA-256 immediately before the run still matched the pinned
`387a5c5dcdbb815085edf0baf79591f9d8894efe922bceaf3d75b1b08055229d`.

| Field | Canary #2 `system/init` observation |
|---|---|
| type / subtype | `system` / `init` |
| reason | `INIT_PLUGINS_NONEMPTY` (`CONTAINMENT`) |
| `tools` | present; array; count 0 |
| `mcp_servers` | present; array; count 0 |
| `plugins` | present; array; count **2** |
| `skills` | present; array; count 0 |
| permission mode | present string; bypass **false**; value not retained |
| model | present string; permitted Opus class; exact ID not retained in this failed init |
| process | one child, one event, 889 stdout bytes, 0 stderr bytes, closed/reaped; 738 ms observed client latency |
| Application | `SEMANTIC_ANALYSIS_ANALYZER_UNAVAILABLE`; no accepted result; ProjectHistory archive and redo preserved |

Before this run the original ledger held exactly **1** `canary` attempt and
the second receipt did not exist. Afterwards the same ledger held exactly
**2** `canary` attempts and both receipts remained separate. No process #3
was started. The first attempt remains historically `CONTAINMENT` with unknown
failing field; its 890 stdout bytes cannot be used to infer plugin counts.
The second attempt gives the precise reason above. Thus the result is
**BLOCKED — CONTAINMENT REAL CAPABILITY REPORTED** rather than an absent-field
or wrong-type schema mismatch. A nonempty plugin list is a real initialization
signal; this record does not claim any plugin actually executed or had access
to a tool. No final response, editorial judgment or real cancellation was
tested. Provider-side usage or cost before termination is unobserved; no
API key, Console/API route, purchase or extra-usage setting was activated.

Next action: focused assessment of why version 2.1.280 reports two plugins
despite the fixed restricted/safe-mode configuration, and whether that init
field represents effective capabilities in this mode. Keep the gate closed
until the semantics are established. This task authorizes no further harness
attempt and makes no provider substitution. Semantic Editorial Analysis V1
remains NOT DELIVERED; global progress stays **55%**.

## Local plugin-origin investigation — 2026-09-29

No inference process was started. The same verified 2.1.280 binary and explicit
HOME/system-PATH environment were used for the official read-only
`claude plugin list --json` command, both from the branch worktree and from the
private matrix directory. Both returned a valid empty array (exit 0, no stderr).
The documented user plugin and skills directories, including the documented
installed-plugin inventory, are absent. The user settings file exists but has
no `enabledPlugins`, `extraKnownMarketplaces`, or `syncClaudeAiPlugins` key.
The documented macOS managed settings file/drop-in directory and managed
preference domain are absent. The fixed harness argv has no `--plugin-dir`,
`--plugin-url`, or inherited plugin-directory environment variable; it retains
`--restricted`, `--safe-mode`, empty `--setting-sources`, and no tools/MCP.

Official [CLI](https://code.claude.com/docs/en/cli-reference),
[plugin inventory](https://code.claude.com/docs/en/plugins/cli-reference),
[loading](https://code.claude.com/docs/en/plugins/loading),
[settings](https://code.claude.com/docs/en/settings),
[environment](https://code.claude.com/docs/en/env-vars), and
[Agent SDK plugin](https://code.claude.com/docs/en/agent-sdk/plugins)
references were consulted. They describe `system/init.plugins` as loaded
plugins and `--settings`/`enabledPlugins` as a per-session override keyed by
**full plugin ID**. Current documentation does not establish why this exact
2.1.280 invocation emitted two plugin entries despite its safe/restricted
controls and an empty official inventory. A declaration in `system/init` does
not prove a hook ran, a tool was available/executed, or an instruction reached
the model. Conversely, empty tools/MCP/skills do not prove absence of plugin
hooks or instructions. The two init entries cannot be correlated to local
inventory entries, so their origins, component counts, required status, and
effective powers remain **unknown**; no private IDs or manifests were copied.

The preferred per-process `--settings` override cannot be built safely from
this evidence: there are no verified full IDs to set explicitly to `false`.
An empty `enabledPlugins` object would not override inherited entries, and
`syncClaudeAiPlugins=false` can move synchronized plugins on the shared disk.
No global disable, alternate HOME, managed-policy bypass, or init-gate
exception was attempted. Therefore the conditional gate for canary #3 was not
met. The original ledger remains **2/8**, with both immutable canary receipts;
six attempts remain, and no semantic response has been accepted. This is
**BLOCKED — PLUGIN ORIGIN**, not a verified CLI escape or plugin execution.

Deterministic regression after the investigation: Claude PoC fake-process
tests **32/32 PASS**, including nonempty-plugin rejection and clean-init
acceptance; directly related Application tests **210/210 PASS**. These tests
do not identify or control the native loader. The next minimum action is a
documented, non-inferential way to map the two init entries to exact plugin
IDs/origins, or an official explanation of the 2.1.280 init contract. Only
then can a narrow session override be reviewed and one authorized canary
considered. No editorial matrix, provider switch, product integration, or
additional billing path was started.

## Private init-metadata diagnosis — 2026-09-29

The Product Owner refined the prior non-inference-only restriction to permit
one synthetic diagnostic process, immediate termination after its first init,
and at most one later corrective canary if an official per-session control was
proven. Code/test checkpoint `3235082e403e7e5ebe5cd37a6207b7455b290170`
adds an operator-only metadata projection and exclusive 0600 receipt in the
existing 0700 ledger directory. The normal init validator and fixed CLI argv,
model/effort, playbook, transport bounds and Application contracts are unchanged.
Unknown event fields are not copied; the receipt is **private local diagnostic
data, not publishable sanitized evidence**. It retains only bounded plugin
identifiers and source/path metadata, never the raw event, prompt, instructions,
tool input or reasoning. Public metrics and this document use P1/P2 aliases.

Before the process, the ledger held two failed canaries and their separate
receipts; the diagnostic receipt and execution lock were absent. The pinned
Claude 2.1.280 darwin-arm64 binary SHA-256 matched
`387a5c5dcdbb815085edf0baf79591f9d8894efe922bceaf3d75b1b08055229d`.
Deterministic fake-process tests passed **34/34**, including capture, bounds,
private receipt exclusivity/symlink refusal, process reaping, clean-init
diagnostic stop, and unchanged nonempty-plugin rejection. The directly related
Application tests passed **210/210**. These prove CEVRA behavior, not native
Claude loader semantics.

Exactly one additional real process, attempt **#3**, used the same synthetic
minimal phrase, flags, Opus alias and Medium effort. It was stopped on its
first `system/init` and reaped (one event, 889 stdout bytes, zero stderr bytes,
about 733 ms local child latency). It supplied no accepted response; the
Application reported analyzer unavailable and preserved ProjectHistory and
redo. The init still reported tools/MCP/skills arrays of length zero, two
plugin entries, no bypass, and a permitted Opus model class. The requested
effort is not independently attested by this stopped run. Remote work or usage
before init cannot be ruled out and no provider-side consumption count is
claimed. The binary hash was unchanged afterwards.

| Alias | Observed shape | Origin evidence | Not established |
|---|---|---|---|
| P1 | object with `name`, `path`, `source` | `path` is the virtual `builtin` marker; `source` is exactly `<name>@builtin` | manifest, components, enabled/required status, hooks/instructions, execution |
| P2 | same shape, distinct name/source | same virtual `builtin` marker and `<name>@builtin` form | same unknowns |

Neither entry supplies a separate `id`, version, enabled/required flag, or
filesystem directory. No user path is represented by the virtual marker. The
official [marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference)
reserves `builtin` for built-in plugins, corroborating the runtime's origin
label; the exact internal loader behavior of 2.1.280 is still not public proof.
This explains the observed difference in *category* between the empty
installed-plugin CLI inventory and the init's built-in entries, without
asserting that the inventory command has a universal normative exclusion rule.
The [plugin loading reference](https://code.claude.com/docs/en/plugins/loading)
documents `enabledPlugins` controls for marketplace, inline, skills-directory
and synced IDs, but does not document a built-in override. The
[CLI reference](https://code.claude.com/docs/en/cli-reference) says
`--safe-mode` disables plugins and `--settings` overrides session settings;
nevertheless the pinned 2.1.280 init reported both built-in entries with
safe/restricted mode already active. Whether these entries register components
or are metadata-only is not established by empty tools/MCP/skills alone.

At this diagnostic checkpoint, no demonstrably effective per-process control
for these built-in entries had been established. An unverified `enabledPlugins`
key or an exception to the init gate would not meet that task's corrective-canary
prerequisite. **Attempt #4 had not yet run.** The immutable ledger then held **3/8** attempts, leaving **5**;
the original two receipts and the private third receipt remain separate. No
plugin name, path, manifest or raw event was committed, logged or supplied to
the analyzer. No personal/global settings, plugin installation, authentication
or billing mode changed. The remaining decision is a focused provider-contract
question: obtain an official 2.1.280 account of built-in init entries and a
supported session-only disablement, or explicitly reconsider the containment
contract with separate evidence and authorization. This task does neither and
does not proceed to the editorial matrix.

## Restrictive session override and corrective canary — 2026-09-29

The Product Owner subsequently authorized one empirical test of the official
`--settings` session override, without relaxing the original containment gate.
The existing private #3 receipt was verified as an owned 0600 regular file in
the existing 0700 ledger directory. It contains exactly two distinct entries
with virtual `path: builtin` and `source` exactly `<name>@builtin`. Their exact
private source strings were used solely as the two keys of a 0600 temporary
JSON file, each explicitly `false` under `enabledPlugins`; no plugin name was
placed in argv, output, Git, or the semantic payload. The file remained until
child settlement, then was removed with inode/owner checking. The original
`--restricted`, `--safe-mode`, empty `--tools`, strict empty MCP, permission,
session, model, effort, and transport controls were retained. The init validator
still rejects every nonempty plugin array; no `@builtin` exception was made.

The official [memory](https://code.claude.com/docs/en/memory),
[plugin loading](https://code.claude.com/docs/en/plugins/loading), and
[CLI](https://code.claude.com/docs/en/cli-reference) references support the
general settings mechanism and describe a built-in disable example, but do not
by themselves prove that these two entries can be disabled in 2.1.280. This
run is the empirical evidence for this exact version and receipt, not a general
claim about all built-ins or hidden runtime behavior.

Code/test checkpoint: `60a03e50178156604e386c0d0644ed6577aeee21`. Deterministic
Claude transport tests passed **38/38**; directly related Application tests
passed **210/210**. The fake process characterizes private file creation,
exclusive ownership, exact false keys, argv, unchanged nonempty-plugin
rejection, Application citation/history behavior and cleanup; it does not
certify the native loader. The first focused test run had one test-harness
cleanup failure caused by a symlink-open error being returned as `ELOOP` rather
than a closed validation error. That path was corrected, its own orphaned
synthetic symlink removed after exact-target inspection, and the full focused
run passed. No real attempt was consumed by that test failure.

Exactly one real corrective process, **attempt #4**, used the same synthetic
minimal canary, pinned binary and requested Opus/Medium. The transport accepted
`system/init` under the unchanged gate, which implies required tools/MCP arrays
were empty, optional plugins/skills were absent or empty, no bypass was
observed, and the init model passed the allowed-Opus check. The next event was
an assistant event rejected as `MODEL_UNAVAILABLE`; the retained non-content
metrics do not distinguish missing from non-Opus `message.model`, so no exact
assistant model ID is asserted. There was **no accepted final result** and no
semantic analysis. The child was reaped after two events, 1,669 stdout bytes,
zero stderr bytes and about 729 ms local transport latency. The serialized
Application envelope was 1,237 bytes and the versioned playbook 2,141 bytes.
No output-token count or actual charge was established. History/archive and
redo remained unchanged. The same pinned binary SHA-256 was observed before
and after; the personal settings file's size, mtime and SHA-256 were unchanged.
The local receipt is `canary-4.json` in the existing private ledger; older
receipts remain separate. Ledger: **4/8 used, 4 remaining**. PT-BR, EN-US,
continuation, hostile and cancellation real scenarios are **NOT RUN**.

Classification: **SESSION INIT CONTROL OBSERVED / REAL ROUND-TRIP BLOCKED AT
ASSISTANT MODEL GATE**. This is not proof that the built-ins executed, nor proof
of universal isolation, effective Medium effort, editorial quality or product
integration. Do not retry or loosen model/containment checks under this task.
The next decision is a focused examination of this version's assistant-event
model contract, using the already captured closed error and, if separately
authorized, a new bounded diagnostic; no additional real process is authorized
here. Slice A remains CLOSED, ADR 0030 remains IN DEVELOPMENT, and global
progress remains **55%**.

## Assistant/result contract correction and canary #5 — 2026-09-29

The previous #4 receipt did not retain `assistant.message.model` or the
assistant error field. Its `MODEL_UNAVAILABLE` remains a **historical CEVRA
classification with unproven provider cause**, not retroactively reclassified
as authentication failure. The new work consulted the official
[Python Agent SDK reference](https://code.claude.com/docs/en/agent-sdk/python),
[streaming-output reference](https://code.claude.com/docs/en/agent-sdk/streaming-output),
[troubleshooting reference](https://code.claude.com/docs/en/agent-sdk/troubleshooting),
and the public Python SDK parser at
[`f2204bb956bab02907aaf3cb88eb9dead28eaa35`](https://github.com/anthropics/claude-agent-sdk-python/blob/f2204bb956bab02907aaf3cb88eb9dead28eaa35/src/claude_agent_sdk/_internal/message_parser.py),
plus the official TypeScript SDK types. These references distinguish
`assistant.message.model` from envelope `assistant.error`, and document that a
`result` with subtype `success` may still have `is_error=true`. They guide the
CEVRA reader but do not prove every behavior of pinned Claude Code 2.1.280.

Code/test checkpoint `8cbb2556d5244826a05e55755cc76c361a7066bb` now
checks session/capability containment first, classifies explicit assistant
errors before treating the message as generated-model evidence, and requires a
real allowed-Opus assistant plus a successful final result before returning
content to Application. A prior assistant error remains primary even if a
later result appears successful or the child exits nonzero. Unknown errors,
synthetic/operational messages without proven semantics, partial output,
foreign sessions, tools and non-Opus generation remain fail-closed. Public
event summaries now locate the model correctly (`system.model`,
`assistant.message.model`, or result `modelUsage`) and expose only closed
shape/category/status fields. An owner-only, exclusive 0600 local receipt in
the existing private 0700 ledger directory retains at most 16 KiB of selected
assistant/result metadata; error text is represented by presence/hash, not
copied. No raw event, reasoning, transcript, credential or private plugin ID
is included. The original two-ID `enabledPlugins=false` session override and
unchanged init gate remain in force.

Deterministic PoC transport tests passed **60/60** and directly related
Application tests passed **210/210** before the new real process. Fixtures
characterize explicit auth/rate-limit/billing/request/server/unknown errors,
`<synthetic>` model, wrong/missing model, capability priority, `success` plus
`is_error=true`, prior-error stickiness, process exit, receipt safety, and
Application history/redo; they are not real AI evidence.

Exactly one further real process, **canary #5**, used the same synthetic
minimal text, pinned Claude 2.1.280 binary, requested Opus/Medium, private
plugin override and unchanged containment controls. The unchanged init gate
accepted `system/init`. The next `assistant` event explicitly declared
`error: authentication_failed` with `message.model: <synthetic>`; this is a
client/provider error message, **not evidence of Opus generation**. The final
`result` had `subtype: success` but `is_error: true` and
`terminal_reason: api_error`; no HTTP status was present. CEVRA correctly
returned `PROVIDER_AUTH_ERROR` at transport level. Application surfaced
analyzer unavailable, accepted no semantic result and left ProjectHistory and
redo intact. No tool event occurred in the three observed events; the child
closed. The bounded local metrics were 2,842 stdout bytes, zero stderr bytes,
1,237 envelope bytes, 2,141 playbook bytes and about 728 ms transport latency.
`modelUsage` reported no model entry in this error result. Effective generated
model, effort, token use, provider-side work and actual charge remain unknown.

The private `canary-5-private.json` receipt is regular, 0600 and outside Git;
older receipts remain unchanged. The pinned binary SHA-256 and the personal
settings file's size/mtime/SHA-256 were unchanged before and after. The
immutable historical ledger is **5/8 used, 3 remaining**. PT-BR, EN-US,
continuation and real cancellation are **NOT RUN**, because the canary failed.
No login, installation, payment-mode change, retry, model/provider switch or
gate relaxation was attempted. The specific next action is a separately
authorized authentication investigation/decision using the official client,
without assuming that the prior login status guarantees this headless run.
Slice A remains CLOSED; the complete semantic analysis and real round-trip
remain NOT DELIVERED; ADR 0030 remains IN DEVELOPMENT; progress stays **55%**.

## Child authentication environment comparison — 2026-09-29

This task used the same pinned Claude Code 2.1.280/darwin-arm64 binary and
verified SHA-256 as canary #5. The official `claude auth status --json` command
is read-only in the pinned CLI. The current official
[authentication reference](https://code.claude.com/docs/en/authentication)
documents macOS Keychain/config-directory behavior and credential precedence;
the [CLI reference](https://code.claude.com/docs/en/cli-reference) documents
`auth status`, its exit code and `configDirectory`. The official
[plan notice](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
explicitly says its announced separate Agent SDK credit change was paused;
this task did not infer a new billing mode. The CLI's `auth status --help`
exposed `--json`/`--text`, not the full session isolation arguments, so a
status probe with the temporary plugin override was **NOT RUN**.

Sanitized read-only comparison (same effective UID, HOME, binary, system PATH,
LANG and disabled auto-update):

| Profile | USER/LOGNAME | Official status | Config directory |
|---|---|---|---|
| A, equivalent to the completed login | present, matching effective OS user | exit 0; logged in; Claude.ai / first-party / Pro | same as B |
| B, original `childEnvironment()` | absent | exit 1; not logged in; first-party provider | same as A |
| Corrected B, OS-reported user identity only | present | exit 0; logged in; Claude.ai / first-party / Pro | same as A |

This is direct evidence of a **local child-environment authentication selection
defect** in the status command, not proof that a model call will now succeed.
The precise macOS credential-store operation is not observed. No credential,
Keychain item, auth file, token or full personal configuration was read by
CEVRA. `USER` and `LOGNAME` now come from the effective OS user rather than
inheriting an unrestricted parent environment; forbidden API/cloud/provider
credentials and proxy variables remain absent. The `--restricted`, `--safe-mode`,
empty tools/MCP, private plugin override, Opus/Medium request and original init
validator are unchanged. No global settings or login were changed.

Code/test checkpoint `822262bce5f6b332d1dc656208a22b4ab43668c6`
also adds closed auxiliary explanation categories for explicitly errored
assistant/result events. An unknown/unclassifiable message remains unknown;
`authentication_failed` alone never asserts HTTP 401 or proves remote
rejection. Only category/evidence/presence/hash are retained in the exclusive,
owner-only private receipt; raw error text, event, transcript, credentials and
private plugin names are not persisted. The historical #4 and #5 conclusions
above remain unchanged. Deterministic Claude transport tests passed **70/70**
and directly related Application tests **210/210**. These are fake-process and
Application contract tests, not real Opus execution.
Push CI [run 36660806889](https://github.com/inlifemedicina/cevra/actions/runs/36660806889)
completed **SUCCESS 5/5** on that code/test SHA (Monorepo, Tauri, Media Runtime
reproducibility, Transcription and Alignment). It did not invoke Claude or
prove real authentication/model execution.

**Canary #6 NOT RUN — private-ledger loss.** Before any new model process, the
previously recorded `/tmp` ledger directory was checked at its exact path and
in the bounded own-prefix locations under `/private/tmp` and this process's
`TMPDIR`; it is no longer present. The reason for disappearance is unknown.
The five historical receipts and the private diagnostic #3 source IDs required
for the restrictive plugin override therefore cannot be verified or supplied
from this host. Tracked evidence preserves the historical **5/8** count, but it
is not a replacement for those immutable private receipts. The harness was
prepared to require the exact five-attempt sequence before #6; no replacement
ledger was created, no extra diagnostic was run and no sixth inference process
was started. Nominal historical balance: **3/8**, unavailable for safe execution
until the original private evidence is restored or the Product Owner makes a
separate, explicit evidence/attempt-control decision. PT-BR, EN-US,
continuation and cancellation remain **NOT RUN**. Model generation, effective
effort, provider-side usage and semantic quality remain unproved.

## Authorized evidence-control recovery and attempts #6–#7 — 2026-09-30

The Product Owner explicitly authorized a recovery checkpoint after the
temporary ledger and private diagnostic #3 receipt disappeared for an unknown
reason. This did **not** recover those five original receipts. They remain
historically recorded but no longer independently re-verifiable by their raw
files. The new owner-only checkpoint records experiment identity, canonical
base, prior head `4d220faadcdbc17aeae51c8be695aaf4a8ca21c4`, creation time,
`authorized-recovery`, **five prior attempts debited**, eight maximum, and
`originalReceipts: unavailable`. It is stored outside Git and `/tmp` in
`$HOME/Library/Application Support/CEVRA/DeveloperEvidence/semantic-claude-roundtrip-poc-v1/`.
Its directories are 0700 and files 0600. Reopening it does not replenish quota;
normal execution without a valid checkpoint fails closed. An exclusive lock
serializes the experiment, each attempt gets an exclusive fsynced reservation
**before** Claude is spawned, and a missing final receipt still spends the
reserved slot. Ambiguous lock ownership is not reclaimed automatically.
No Project IR, ProjectHistory, Store or Media Archive persistence changed.
The recovery/control and directed-test code checkpoint is
`aa6e7c145df9977f8c560a1217e0bbfb2ec42daa`; the model processes above
ran from its exact code tree before the documentation-only follow-up.

Deterministic PoC tests, including recovery idempotence, missing/corrupt
checkpoint, symlink/foreign file, concurrent reservation, post-reservation
crash, ninth-attempt rejection and unchanged normal init containment, passed
**77/77**. The directly related Application tests passed **210/210**. These
tests use controlled processes and do not prove Claude behavior. The CLI hash
remained `387a5c5dcdbb815085edf0baf79591f9d8894efe922bceaf3d75b1b08055229d`
before and after the two new processes. Official `auth status --json` passed
under the exact closed child environment before each process; that status is
not proof of model generation. No login, installation, API key or extra-usage
purchase was performed; the CEVRA harness wrote no global settings.
Push CI [run 36663510816](https://github.com/inlifemedicina/cevra/actions/runs/36663510816)
completed **SUCCESS 5/5** on code/test SHA
`aa6e7c145df9977f8c560a1217e0bbfb2ec42daa` (Monorepo, Tauri, Media
Runtime reproducibility, Transcription, Alignment). The workflow contains no
Claude inference and is not the evidence for attempts #6 or #7.

| Attempt | Purpose and observation | Transport/Application outcome | Persistent control |
|---|---|---|---|
| #6 | Current plugin-ID recapture; first `system/init` only; two distinct virtual builtin entries with `name`, `path`, `source`; zero accepted semantic output | `DIAGNOSTIC_STOP`; child reaped; 1 event, 890 stdout bytes, 0 stderr bytes, 1,237 envelope bytes, ~1,359 ms transport | New private `plugin-metadata-6.json` and exclusive reservation/receipt, **not** a recovered #3 receipt |
| #7 | Small synthetic PT-BR, two sources, full Application → closed projection → Claude adapter path; same exact private IDs disabled by session-only `--settings` | Init passed the unchanged gate, then a second event was `type=system`, subtype outside the diagnostic summary vocabulary; `CONTAINMENT`, no generated-model or final semantic result accepted. Child reaped; 2 events, 951 stdout bytes, 0 stderr bytes, 2,459 envelope bytes, ~2,798 ms transport | Exclusive reservation/receipt and private bounded diagnostic (zero assistant/result entries); ProjectHistory and redo unchanged |

The #7 last-event summary contains only `system/other`; the exact subtype was
not retained, so it is **not** identified as a tool, hook, plugin execution,
escape, provider error or harmless status. Since the reader rejects any
unexpected post-init system event, containment remains fail-closed. The clean
init is evidence that the current restrictive override was effective for that
init, not universal isolation. No Opus generation, effective effort, usage,
charge or editorial quality is established. The Application surfaced analyzer
unavailable and made no mutation. The semantic response, citations, quality
rubric and real-agent round-trip were **not** reached.

The ledger now reads **7/8 consumed, one remaining**. The authorized PT-BR
attempt failed materially at transport containment, so the final slot was not
spent: EN-US, continuation and real cancellation are **NOT RUN**. Do not treat
the old historical receipts as reconstructed or consume #8 to repeat an
unclassified event. The next gate is a focused decision on the precise
post-init `system` event contract in Claude Code 2.1.280; a future diagnostic
must preserve the closed validator and the one remaining historical slot.
This private PoC does not authorize Desktop/commercial integration. Slice A
remains CLOSED, ADR 0030 remains IN DEVELOPMENT, complete Semantic Editorial
Analysis remains NOT DELIVERED, and global weighted progress remains **55%**.

## Transport event policy for the final bounded attempt — pre-implementation table

Reference: official `@anthropic-ai/claude-agent-sdk@0.3.280` declaration
`sdk.d.ts` (npm integrity SHA-512
`6884124ca70225c3a08b5db918019068d654620c5b10143057601cf94b69d3e8065232045a34eacf807c917afd5e391c0936224543130ec5cf0147c87010e39f`),
released from `anthropics/claude-agent-sdk-typescript` tag `v0.3.280` at
`58d2e4b81bdca2c6ce10e6e5db22ad7acdc1d58c`, which declares parity with
Claude Code 2.1.280. Current official headless/streaming docs corroborate
the JSONL envelope, `api_retry`, block-wise assistant messages and final result;
they do not establish the exact event that occurred in attempt #7.

| Type/subtype | Minimum validated shape and phase | CEVRA effect | Invalid or forbidden outcome |
|---|---|---|---|
| `system/init` | One matching session; before turn events; closed empty tools/MCP/plugins/skills, no bypass, allowed Opus | Establish session only | Existing containment/model/correlation error |
| `system/status` | Matching session after init; `status=requesting` or `null`; no compact result/error or permission-mode drift | Operational observation; no result authority | Protocol error; `compacting` is rejected context change |
| `system/session_state_changed` | Matching session after init; `state=running` or `idle` | Operational observation only | `requires_action` is forbidden; malformed is protocol error |
| `system/thinking_tokens` | Matching session after init; bounded nonnegative `estimated_tokens` and `estimated_tokens_delta` | Approximate progress only; no reasoning content retained or result authority | Malformed protocol error |
| `system/api_retry` | Matching session after init; bounded integer `attempt`, `max_retries`, `retry_delay_ms`, integer-or-null `error_status`, closed error category, optional bounded `no_response` integers | Classify cause, stop own process; no CEVRA retry | Malformed protocol error; observed retry is terminal to this experiment |
| `rate_limit_event` | Matching session after init; closed status and booleans, no overage | Advisory, or terminal quota/overage refusal | Invalid protocol or extra-usage rejection |
| `auth_status` | Matching session after init; boolean authentication state and string-list output (not retained) | Terminal authentication condition in this headless proof | Malformed protocol error; never treated as generated content |
| `assistant` | Matching session, no parent tool, safe content blocks; explicit error first, otherwise allowed Opus; individual block may have null stop reason | Track authorized textual generation; thinking discarded; no completion until result | Tool/subagent containment, provider/model/partial error |
| `result/success` | Matching session, one turn, `is_error=false`, no permission denials/deferred tool, completed terminal state, authorized generated Opus and matching model usage; followed by clean close | Only source of final text for Application validation | Error/partial/duplicate/correlation failure; prior error never cleared |
| `result/error_*` | Matching session, typed error envelope | Terminal provider/turn failure, never semantic success | Malformed protocol error |
| Tool, hook, task, plugin install, permission request, compaction, memory recall, local command, subagent or context-changing event | Any phase | None | Containment/policy failure; known SDK type is not CEVRA authorization |
| Other type/subtype or unsupported shape | Any phase | None | `PROTOCOL_EVENT_UNSUPPORTED`/`PROTOCOL_EVENT_INVALID`, exact bounded type/subtype in private receipt only |

This is deliberately smaller than the SDK union. It does not convert post-init
`system` into a blanket pass. The official types/headless docs describe
`api_retry` as a runtime retry notice, not evidence that #7 was a retry or that
the first HTTP attempt was billed. Assistant block messages may legitimately
carry `stop_reason=null`; the result remains authoritative.

### Attempt #8 and final-slot result

The policy table above was first committed as `793d634` with
`system/thinking_tokens` incorrectly in the prohibited group. After official
SDK type review and 91/91 offline PoC tests plus 210/210 Application tests,
the sole authorized #8 process ran from that exact code SHA. It used a small
synthetic PT-BR two-source fixture through real ProjectHistory, the closed
projection, Application and the Claude adapter. The pinned Claude Code 2.1.280
binary hash was unchanged before/after; official subscription status and the
private plugin override passed preflight. Its first `system/init` passed the
unchanged no-tools/no-MCP/no-plugin/no-bypass/Opus-class gate. Its second event
was **`system/thinking_tokens`**, classified by the pre-correction reader as
`CONTAINMENT / FORBIDDEN_SYSTEM_EVENT`. The CLI was terminated and reaped;
there was no assistant/result event and no accepted semantic response. The
durable private receipt records only bounded event metadata and the ordered
trace; the original #7 subtype remains unknown and is not backfilled.

The version-matched SDK declaration defines `thinking_tokens` as an approximate
progress estimate from a redacted-thinking phase, not reasoning text, tool
use, context mutation or proof of billed output tokens. Thus #8 exposed a
CEVRA protocol-policy mismatch, **not observed tool execution or an escape**.
The integrated correction at code/test head
`8b3aaa6` now validates its numeric shape as non-authoritative operational
metadata; this *post-#8 code is offline-tested only*, not validated
against a second real execution. It does not loosen init capability checks,
permit hooks/tools or accept analysis without authorized assistant generation,
successful result, close and Application validation.

Attempt #8: 2 events, 951 stdout bytes, 0 stderr bytes, 2,459 CEVRA envelope
bytes, approximately 3,548 ms transport latency; child closed; ProjectHistory
and redo unchanged. Generation model/effort, provider usage, actual charge,
semantic quality and full round-trip remain unknown. The immutable ledger now
shows **8/8 consumed, zero remaining**. EN-US, continuation and real
cancellation are NOT RUN. No ninth process is authorized or proposed
automatically. Private receipts remain owner-only outside Git; the five
historical raw receipts remain unavailable. The next gate is focused review
of the versioned no-tools reader policy, diagnostics and this precise failure,
followed by a separate Product Owner decision about any further real proof.
