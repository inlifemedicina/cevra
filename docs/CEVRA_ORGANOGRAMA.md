# CEVRA ORBIT — ORGANOGRAMA ATUAL

**Updated:** 2026-09-29
**Authority:** compact sequencing reference; `docs/CEVRA_MASTER_CONTEXT.md`, `docs/ARCHITECTURE_V1.md` and accepted ADRs remain the detailed authorities.
**Current global weighted roadmap progress:** 55%.

```text
CEVRA VIDS
│
├─ 1. CLOSED / PRESERVED FOUNDATIONS
│   ├─ Media Runtime / Architecture Canon / EDVID parity
│   ├─ Project IR + transcript architecture
│   ├─ Desktop shell/runtime integration
│   ├─ persistence / recovery
│   ├─ forced alignment
│   └─ ProjectHistory Scalability V2
│
├─ 2. CORRECTNESS / PARALLEL RUNTIME GATES
│   ├─ pre-editorial correctness prerequisites [CLOSED]
│   ├─ approved coordinated Media Runtime adjustment gate [ACTIVE IN PARALLEL]
│   │   ├─ MR-V01 Durable Source Technical Descriptor V1 [IMPLEMENTED / CLOSED]
│   │   ├─ Slice 5A Native Windows Media Runtime / h264_mf feasibility [IMPLEMENTED / CLOSED]
│   │   └─ Slice 5B Windows H.264 product enablement [NOT STARTED / DECISION GATE]
│   └─ Transcript Cache V1 [IMPLEMENTED / CLOSED]
│
├─ 3. EDITORIAL INTELLIGENCE [ACTIVE]
│   ├─ Editorial Transcript Projection V1 [IMPLEMENTED / CLOSED]
│   ├─ Semantic Editorial Analysis V1
│   │   ├─ Slice A validated analysis boundary [IMPLEMENTED / CLOSED]
│   │   └─ real-agent semantic round-trip [ACTIVE / CODEX BLOCKED-CONTAINMENT / CLAUDE BLOCKED-INIT-PLUGINS]
│   ├─ strategy
│   ├─ take selection
│   └─ cut planning
│
├─ 4. DETERMINISTIC EDIT EXECUTION
│   ├─ missing typed Project IR edit commands
│   ├─ Cut Compiler
│   └─ Numeric QA / correction loop
│
├─ 5. UX SURFACE CONTRACT
│   ├─ NORMAL
│   │   ├─ EDVID-level directness/simplicity
│   │   ├─ preview
│   │   ├─ visible directly editable timeline
│   │   ├─ contextual inspector
│   │   ├─ presets / visual choices
│   │   └─ natural-language CEVRA field
│   │
│   ├─ MORE CONTROLS
│   │   └─ contextual progressive disclosure
│   │
│   └─ ADVANCED
│       └─ full available editing complexity over the SAME project/timeline
│
├─ 6. NATIVE PREVIEW + SHARED LAYERED TIMELINE
│   └─ Normal and Advanced are exposure levels, not separate editors
│
├─ 7. PRESENTATION / COMPOSITION
│   ├─ captions / conventional audio
│   ├─ composition benchmark
│   ├─ shortform / longform
│   └─ B-roll / overlays / camera / music / SFX
│
├─ 8. CEVRA DIRECTOR / WORKFLOW PRESETS / AI ORCHESTRATION
│   ├─ AI decisions → validated typed plan
│   ├─ direct user intervention at any time
│   └─ one Project IR / one timeline
│
├─ 9. INTEGRATIONS / EXPANSION
│   ├─ agent protocol / external AI surfaces
│   ├─ remote desktop workflow
│   └─ mobile path later, without blocking desktop Vids
│
└─ 10. HARDENING / RELEASE
    ├─ cross-platform validation
    ├─ render/export correctness
    ├─ licensing / entitlement / distribution
    └─ release gate
```

## Product rule

```text
POWER INSIDE
↓
SIMPLE BY DEFAULT
↓
DIRECT MANUAL CONTROL AVAILABLE
↓
FULL COMPLEXITY WHEN THE USER ASKS FOR IT
```

## Change introduced on 2026-09-19

The dependency roadmap was **not reset**. The explicit new checkpoint is **UX Surface Contract**, inserted before Native Preview + Timeline is considered complete. This contract defines Normal, contextual More Controls and Advanced over the same underlying editor state.

## Reconciliation note — 2026-09-21

ProjectHistory Scalability V2 is closed and preserved as a foundation after PR #30. The measured O(commits × transcript payload) failure was removed with compact snapshots and exact transcript blobs while preserving Project IR and V1 compatibility. The cross-platform/runtime correctness prerequisites are also closed. The current active gate remains the approved coordinated Media Runtime adjustment gate. Transcript Cache V1 is closed and remains separate from canonical history/storage.

MR-V01 is closed as the bounded Slice 4 implementation within that gate after
PR #46 and successful post-merge CI plus Exact Runtime. It keeps Project
IR/History/Package at V2, adds no migration and does not start Cut Compiler.
Transcript Cache V1 is implemented and closed by PR #24 on the current
MR-V01/ProjectHistory V2 baseline. Its final implementation binds cache identity
to the actually selected Transcription model, adds source anti-ABA continuity,
normalizes known optional `undefined` inputs without opening the schema, and
enforces adopted descriptor integrity independently of cache policy. Independent
review and post-merge CI plus Exact Runtime passed.

**Slice 5A — Native Windows Media Runtime / h264_mf feasibility — IMPLEMENTED /
CLOSED** by PR #49 and normal merge commit
`660f8cd13f11729d5663e1ff373e9eb91a4bffbb`. Native
run `36442497813` on `c17aea572e91cc1802e73dba5dad03c6b047f0cd` used the
pinned private Python, signed FFmpeg 9.0.1 and uniquely selected signed/static
zlib 1.3.2, schema/integrity-verified the private runtime, and passed the real
horizontal/vertical encode/decode/timing matrix plus sample-offset and
container-offset negative controls. Post-merge CI `36456056888` and Exact
Runtime `36456056825` passed. Windows product enablement remains a separate 5B
decision because typed allow-lists,
publication identity/lifecycle, Application/Desktop integration and
representative hardware acceptance are not delivered by 5A.
Slice 5B is **NOT STARTED**. The coordinated Media Runtime gate remains active
for downstream audio policy, Windows/HDR export, assembled-plan QA,
Composition/preview and release closure, but those residual consumers are not a
serial prerequisite for read-only transcript reasoning. The pre-editorial
correctness prerequisites are closed. **Editorial Transcript Projection V1 is
IMPLEMENTED / CLOSED** by PR #51 and normal merge commit
`56161b2af44c9e2de008bb33bc1706d4e2beaf7e`. Its bounded final remediation
tracks known speaker transitions through partial attribution and removes
quadratic prefix fitting while preserving the approved projection contract.
PR CI `36487114791`, PR Exact Runtime `36487114771`, post-merge CI
`36487922851` and post-merge Exact Runtime `36487922834` passed. **Semantic
Editorial Analysis Boundary V1 — Slice A is IMPLEMENTED / CLOSED** by PR #53
and normal merge commit `0cde0d29cfe3f3d417955e20e5ad672b3e02ceba`.
Independent review required F-1–F-6 changes and then approved the remediated
boundary with non-blocking notes. The closed slice uses exact enum/ID
validation, one entry-to-return deadline, per-source on-demand collection,
distributed initial evidence and a cumulative transmitted-envelope budget. It
still exchanges only bounded text projection evidence through a
provider-neutral Application port, validates untrusted structured responses
and returns no project mutation. PR CI `36575808711` and Exact Runtime
`36575808713` passed; post-merge CI `36576763557` and Exact Runtime
`36576763666` passed. Its scripted test analyzers are not a production AI
capability. A real-agent round-trip remains the next required gate and is not
delivered by these scripted fixtures. The preserved Codex App Server attempt is
blocked on containment with zero turns; the bounded Claude CLI attempt
now has official macOS arm64 Claude Code 2.1.280 installed and verified in a
versioned CEVRA-owned developer-tools directory outside the repo. The earlier
executable blocker is resolved and official subscription authentication now
passes (Claude.ai / first-party / Pro). The isolated adapter passed deterministic
fake-process tests. The first real canary failed an initialization containment
assertion without a retained field; the sole diagnostic follow-up identified
`INIT_PLUGINS_NONEMPTY`: two plugins reported, no tools/MCP/skills and no
bypass. Ledger 2/8, no accepted response. No plugin/tool execution or escape
is proven. Resolve the CLI init-field semantics before any further run;
containment remains closed.
Effective Opus/Medium, real transport and editorial matrix remain unproven.
Claude remains the next private proof candidate, not a replacement of the
provider-neutral core or an approved commercial integration. Complete Semantic
Editorial Analysis V1, strategy, take selection and cut planning remain not
delivered. Progress remains 55%.
Before future timeline/Cut Compiler workflows create many commits, remeasure
descriptor/source repetition and decide deduplication only if evidence warrants.
