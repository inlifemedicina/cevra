# CEVRA Agent Rules

These rules are authoritative for Codex, Claude Code, and any other coding agent working in this repository.

1. Read `docs/ARCHITECTURE_V1.md` before making architectural changes.
2. `packages/project-ir` is the canonical editable project model. UI and engines are never sources of truth.
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
