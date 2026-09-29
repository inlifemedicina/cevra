# Semantic Editorial Analysis — Codex Round-trip PoC V1

**2026-09-29 — IN DEVELOPMENT / BLOCKED — CONTAINMENT.**

Base: `a58ca419c2a0db2c416db83d84c432fcae23d830` (PR #54).
Branch: `feat/semantic-codex-roundtrip-poc-v1`.
Diagnostic/test checkpoint: `158a046625c86251647fe6e3e38f55e958201b7c`.
Slice A remains CLOSED; ADR 0030 remains IN DEVELOPMENT.
Global roadmap tracking remains **55%**.

## Result and scope

Official stdio metadata exchange succeeded. The required isolation was **not
proved**, so **no thread, turn, semantic payload or model inference was
started**. Real turns used: **0 / 8**. This is not a demonstrated containment
escape, an auth failure, or a claim that every App Server version lacks suitable
controls. It is a failed prerequisite for this exact-build private PoC.

No production adapter was implemented behind an unproved security assumption.
The bounded [diagnostic](../scripts/semantic-codex-preflight.mjs) intentionally
has no thread/turn/tool method in its request allow-list. Its deterministic
[tests](../scripts/test/semantic-codex-preflight.test.mjs) do not simulate AI
quality. This safe deliverable is evidence of the blocker, not replacement
scaffolding for the required real round-trip.

## Official mechanism and exact local executable

Official references consulted, following official redirects:

- [App Server](https://learn.chatgpt.com/docs/app-server)
- [Authentication](https://learn.chatgpt.com/docs/auth)
- [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)

The executable already installed with the official ChatGPT macOS app is
`/Applications/ChatGPT.app/Contents/Resources/codex`, Mach-O arm64,
`codex-cli 0.155.0-alpha.16`. SHA-256:
`2f76d9cb0acab786dbb1cbf1020e8001d0e6d4de7b3c87a5d5769a4d03480f13`.
Local help marks App Server experimental. Version-specific schemas were
generated with `app-server generate-json-schema --experimental`; they remain
scratch artifacts, not a duplicate CEVRA semantic schema.

No executable, SDK or upstream source was downloaded, installed, modified or
redistributed. Invocation of the user's installed official executable is not
a completed license/entitlement/retention review for commercial embedding.
The official documentation links the open-source App Server implementation;
this task does not assert that every bundled alpha component has identical
redistribution terms. Product commercialization remains a later explicit gate.

The programming session's exact model/effort were not verified through these
child-process metadata calls; the user prompt did not change that session.
The separate analyzer preference was **gpt-5.6-sol / medium**. `model/list`
confirmed both are available, but no model/effort was exercised by inference.
`account/read` confirmed **ChatGPT** mode without reading or copying auth files.
The available weekly usage window reported 19% used at discovery; this is
account-wide, time-varying metadata, not measured PoC cost or unlimited access.
No reset, credits, API key or billing change was used.

## Containment preflight: facts versus missing proof

Each diagnostic process used stdio and a newly owned temporary cwd outside the
repo. It inherited a small environment allow-list, not API-key environment
variables. CLI overrides changed only the child process, not user config.

| Observation | Actual result | Interpretation |
|---|---|---|
| `--strict-config`, explicit overrides | accepted for 25 disabled feature flags | verifies those config values, not complete native-tool removal |
| approval / sandbox / web search | `never` / `read-only` / `disabled` | deliberately insufficient as sole isolation proof |
| shell, exec, image/browser/apps/plugins/hooks/memories/subagents and discovery features | false; host skill discovery skipped | no assertion of a complete model-visible inventory |
| project document bytes / custom instruction fields | 0 / empty in effective config | thread instruction sources were NOT observed because no thread was authorized |
| `mcp_servers={}` | two inherited entries, one enabled | empty table did not clear merged configuration |
| individual inherited MCP `enabled=false` overrides | zero enabled entries on second process | corrected metadata configuration without global writes or MCP tool calls |
| plugin configuration entries | eleven retained, feature disabled | retained entries do not mean those plugins executed |
| `modelProvider/capabilities/read` | namespace tools, image generation, web search supported | provider support flags, NOT effective enabled-tool attestation |
| `thread/start.environments=[]` in installed schema | documented to disable environment access for turns without override | relevant control, but no pre-thread full native-tool/instruction-source proof established |
| `allow_remote_control=false` as CLI override | rejected by strict config as unknown | managed-reference fields cannot be assumed valid process config |

The generated `ToolsV2` configuration exposes web-search configuration, not a
verified blanket native read/edit/patch deny-all switch. `dynamicTools=[]`
specifies additional tools and is not proof that native tools vanish. The
installed feature listing marks `apply_patch_freeform` as removed; it was not
treated as an active security control. No prompt saying “do not use tools” was
substituted. No thread was created merely to inspect its instruction sources.

Metadata-only probes also observed `remoteControl/status/changed`, a known
notification in the installed schema. It is counted and discarded, not used to
authorize execution. The diagnostic initially stopped on that unknown event
until it was matched to the schema; a malformed per-server override also caused
an initialization EOF before the bare-key override was corrected. These were
preflight failures, with zero inference turns; no arbitrary event wildcard was
added. The subsequent metadata run completed and returned the blocked verdict.

**First material missing proof:** an officially supported, effective,
pre-thread configuration/attestation removing *all* native tool access and
unrelated instruction discovery for this exact build. Individual toggles and
empty environment selection did not establish the complete condition in this
investigation. The user explicitly requires stopping when this cannot be proved.

Inference network traffic from the official runtime is conceptually distinct
from browser/network tools exposed to a model. Neither was exercised here as
an analyzer; only official auth/model/config/usage discovery was requested.
No transcript, brief, repository, media, private project, canary or chat history
was sent as model input. Normal official account/discovery metadata exchanges
are not claimed to be zero network activity.

## Reproduction and deterministic validation

Use the exact existing binary; do not update it automatically:

```sh
node scripts/semantic-codex-preflight.mjs /Applications/ChatGPT.app/Contents/Resources/codex
npm run test:semantic-codex-preflight
```

The diagnostic checks the executable hash before spawn and deliberately exits
2 with `BLOCKED — CONTAINMENT` on completed metadata discovery. A different
binary requires renewed review, not a silent pin update. Config/account values
are held only long enough to summarize booleans/counts; no email, account ID,
auth URL, tokens, personal instructions or full config are printed or committed.
Required paths and local schema generation remain reproducible through the
official executable. Temporary runtime-owned state is not committed or removed
by broad cleanup commands.

Twelve deterministic tests passed on Node 24.19.0 / macOS arm64: UTF-8/JSONL
fragmentation, line/total/event limits, malformed/partial EOF, forbidden methods,
request correlation/duplicates, unexpected approvals/tools/input, known notices,
stderr overflow, process death, timeout/owned-child escalation, error redaction
and safe config summaries. These are fake-process metadata-transport tests,
not tests of a completed analyzer adapter or a hostile model.

Bounds: 1 MiB per JSONL line before parse; 8 MiB stdout per metadata process;
256 messages; 64 KiB stderr counted and discarded; 20-second process deadline;
SIGTERM followed by SIGKILL after one second only for the owned child. The
final hardened discovery reported 39,061 stdout bytes, zero stderr bytes and
two known notifications. These are metadata transport bytes, not semantic
payload, tokens, latency or cost measurements. No provider reasoning was saved.

Local and remote regression results are recorded below after execution; normal
CI runs the fake tests without Codex, auth or inference. No manual FFmpeg build
or ML model download is part of this branch.

Local build (`npm run build`, as part of `npm run ci`) passed, including the
frontend. The first full `npm run ci` returned failure: 567/569 Node tests
passed, and two unchanged Desktop Host runtime-presence tests used system
Python 3.9.6 and returned `runtime-invalid`. The targeted Desktop rerun with
the already installed Python 3.12.14 passed **74/74**, without changing any
assertion or product code. Final per-suite evidence is therefore **569/569
across the initial run and targeted rerun**, not a claim that the first full
command passed: preflight 12, Desktop Host 74, Application 210, contracts 21,
i18n 2, Project IR 53, Store 11, Transcript Cache 12, Alignment 33, Media Node
91 and Transcription 50. `npm audit --omit=dev` reported zero vulnerabilities.
Local Rust/Python unit suites and native catalogs were not rerun for this
metadata-script-only change; applicable normal CI is recorded separately.

## Real matrix — NOT RUN

| Case | Real turns | Result |
|---|---:|---|
| PT-BR / EN-US semantic fixtures | 0 | blocked before thread |
| scoped textual continuation | 0 | NOT RUN |
| hostile transcript / synthetic canary | 0 | NOT RUN |
| real cancellation | 0 | NOT RUN; owned fake-process timeout tested separately |
| structural CEVRA return validation | 0 | NOT RUN through this provider |
| editorial fidelity / human acceptance | 0 | NOT RUN / pending |

The Application service, analyzer port and projection were not edited.
No semantic response, token usage, real inference latency or per-turn cost
exists to report. No D2/D3/D4/D5/I1/I5 acceptance case was marked complete;
the existing catalog requires no duplicate ID. Slice A's historic tests remain
boundary evidence only. There was no provider-output schema/playbook/rubric
execution, production adapter, Desktop exposure or fallback analysis.

## Next action and review scope

FIX NOW prerequisite: establish an official exact-version deny-all-tools and
instruction-source containment mechanism, including how to verify it before
thread creation. A runtime change or a materially different isolation design
requires explicit review; none was installed or selected here. No new login is
currently indicated, and paying for API access would not solve this proof.

Do not proceed by allowing read-only tools, by detecting calls after execution,
or by prompting the model to behave. Do not build another layer of unused
adapter scaffolding in place of this gate. After containment is established,
fix the rubric and bounded transport/real-case plan before any of the eight
authorized turns; revalidate entitlement and model availability then.

Focused review is limited to the metadata diagnostic, bounded fake transport,
sanitization, zero-thread/turn invariant and accuracy of the missing proof.
No real semantic answer is available for review. Director impact: compatible
I1/I2/I5 feasibility research, no new authority. Product integration, remote
retention/commercial terms, editorial homologation and transport-layer real
turn handling remain unproved, not implicitly delivered or silently deferred.
