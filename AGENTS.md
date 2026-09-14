# CEVRA Agent Rules

These rules are authoritative for Codex, Claude Code, and any other coding agent working in this repository.

1. Read `docs/ARCHITECTURE_V1.md` before making architectural changes.
2. `packages/project-ir` is the canonical editable audiovisual project model. UI and engines are never sources of truth.
3. Do not add or replace a framework, engine, database, persistence model, update mechanism, or architectural pattern without an ADR and explicit product-owner approval.
4. Agents may invoke only typed, validated editing operations. Do not expose arbitrary shell commands or arbitrary FFmpeg filtergraphs from the end-user editing surface.
5. Every user-visible string must be internationalized. PT-BR and EN-US are mandatory and feature-parity must be maintained.
6. Desktop and mobile must share domain types, Project IR, design tokens and terminology where practical.
7. External engines and providers must be accessed behind stable CEVRA interfaces/adapters.
8. Project schemas are versioned. Backwards compatibility is preserved by explicit tested migrations.
9. Audit licenses before adding dependencies. Prefer Apache-2.0, MIT and BSD. LGPL/GPL/AGPL/proprietary/UNLICENSED require explicit review before implementation.
10. EDVID MIT code may be reused with required attribution. Auroq or other proprietary/UNLICENSED code may be studied for behavior and architecture but must be independently reimplemented unless a compatible license is obtained.
11. Never commit secrets, API keys, access tokens, signing keys or private model credentials.
12. CEVRA-owned source is proprietary unless a file explicitly states otherwise. Third-party notices belong in `THIRD_PARTY_LICENSES.md` and `NOTICE`.
13. Every editing mutation must generate an auditable journal entry and recoverable state/snapshot.
14. Before a material architectural change, present the proposal, benefit, risk and impact for product-owner approval.
15. Do not silently replace approved engines: Media, Composition, Transcription, QA, Agent Bridge, Persistence, Update or Secure Storage.
16. External dependency updates are never blindly applied. Validate compatibility and run tests before release.
17. Preserve a clean adapter boundary so future OpenCut, Premiere, Resolve, cloud providers or local generation engines can be added without changing Project IR.
18. The application must remain usable without an AI agent for manual editing/review tasks supported by the UI.
19. Content Intelligence is a separate optional domain within CEVRA Orbit. Do not store source records, signals, ideas, briefs, scripts, performance observations or content memory in Project IR merely to associate them with an audiovisual project.
20. Instagram, YouTube, TikTok, publishing services, analytics vendors, AI vendors and similar systems are always provider/adapter implementations. Provider-native schemas must not become core domain models.
21. CEVRA Vids must remain functional without Content Intelligence, Marketplace, unimplemented Orbit services, paid AI APIs or external agents/providers.
22. Specialized content profiles (for example health/medical, business or creator) belong in versioned configuration/skill/policy packs, not in generic Content Intelligence core logic.
23. Code from external content-intelligence products may be reused only after exact license/provenance audit confirms compatibility with CEVRA's proprietary commercial distribution. Otherwise use independent/clean-room implementation.
24. Workflow / Production Presets are declarative application-level orchestration. They may resolve only to typed, validated CEVRA commands/providers and must never embed arbitrary code, shell commands, raw FFmpeg arguments/filtergraphs or credentials.
25. Built-in and user-created presets use the same versioned schema, capability checks and privilege boundary. Presets never replace Project IR or bypass journal/history.
26. CEVRA Orbit is the ecosystem boundary. CEVRA Vids and future products remain independent domains; shared Orbit services must not become a monolithic product core.
27. The public MIT EDVID project is the initial Vids functional baseline. Reuse requires exact provenance and attribution; branding and trade dress must not be copied. Intentional behavior changes are documented as `DIVERGÊNCIA EDVID` with parity or superiority evidence.
28. HyperFrames, Remotion and future composition engines remain behind `CompositionEngineAdapter`. A default requires the benchmark defined by ADR 0012; no engine is mandatory before parity evidence exists.
29. Future packages are signed, versioned and capability-limited. Third-party packages receive no arbitrary shell, network or filesystem access by default.
