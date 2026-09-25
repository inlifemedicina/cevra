# CEVRA ORBIT — ORGANOGRAMA ATUAL

**Updated:** 2026-09-24
**Authority:** compact sequencing reference; `docs/CEVRA_MASTER_CONTEXT.md`, `docs/ARCHITECTURE_V1.md` and accepted ADRs remain the detailed authorities.

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
├─ 2. CURRENT RECONCILIATION / CORRECTNESS GATES
│   ├─ small cross-platform/runtime correctness prerequisites [CLOSED]
│   ├─ approved coordinated Media Runtime adjustment gate [CURRENT ACTIVE GATE]
│   │   └─ MR-V01 Durable Source Technical Descriptor V1 [IN DEVELOPMENT / REVIEW PENDING]
│   └─ Transcript Cache V1 reconciliation/final closeout
│
├─ 3. EDITORIAL INTELLIGENCE
│   ├─ editorial transcript / analysis
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

ProjectHistory Scalability V2 is closed and preserved as a foundation after PR #30. The measured O(commits × transcript payload) failure was removed with compact snapshots and exact transcript blobs while preserving Project IR and V1 compatibility. The cross-platform/runtime correctness prerequisites are also closed. The current active gate is the approved coordinated Media Runtime adjustment gate, followed by Transcript Cache V1 reconciliation/final closeout. Revalidate the cache/history storage relationship during that later cache closeout; the two systems remain separate.

MR-V01 is the active bounded Slice 4 implementation within that gate. It keeps
Project IR/History/Package at V2, adds no migration and remains pending
independent review; it does not start Cut Compiler or reopen Transcript Cache.
