# Semantic Editorial Analysis — Claude CLI Round-trip PoC V1

**2026-09-29 — BLOCKED — PLUGIN ORIGIN (`INIT_PLUGINS_NONEMPTY` remains fail-closed).**

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

The isolated adapter's first real canary was rejected at its first
initialization event; that checkpoint did not retain the failing field. A
focused diagnostic change preserved every pass/fail decision, and a second
canary with the same synthetic input and controls identified
`INIT_PLUGINS_NONEMPTY`: the `system/init` event reported **two plugins**.
`tools`, `mcp_servers` and `skills` were present as empty arrays, and bypass
was false. Both owned processes were terminated and reaped. **2 / 8** real
process attempts used, **6 remain**. No final model response was accepted.
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
