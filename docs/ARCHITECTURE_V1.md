# CEVRA Architecture Freeze v1

## 1. Goal

Build a commercial-ready, agent-assisted video editor with a simple modern interface, deterministic execution, reversible history, bilingual UX and stable extension points for local and cloud capabilities.

## 2. Architectural invariants

1. Project IR is the only source of truth for editable project state.
2. UI, agents, FFmpeg, HyperFrames, Whisper/faster-whisper/WhisperX, OpenTimelineIO and future editors are adapters around Project IR.
3. Engine-specific data must not leak into the stable Project IR core except under explicitly namespaced `extensions`.
4. Every mutating edit creates an auditable journal entry and recoverable state.
5. Engines expose typed capabilities, versions and health checks.
6. External providers implement a common lifecycle: configure/connect, healthcheck, capabilities, execute, disconnect.
7. Project schemas migrate forward explicitly and reversibly where practical.
8. Core editing works without paid OpenAI/Anthropic API usage.
9. Codex and Claude Code are interchangeable agent hosts through shared contracts and skills.
10. PT-BR and EN-US are mandatory for all user-visible surfaces.
11. Desktop and mobile share Project IR and UX vocabulary; heavy processing may be delegated to a trusted desktop node.
12. The application shell, Project IR and history system must remain independent of any single external video engine.
13. Desktop Python-based engines run only inside a private CEVRA-managed runtime; the product must not depend on or modify a user's global/system Python.

## 3. Approved target stack

### Application shell
- Tauri 2
- React + TypeScript
- Shared responsive design system

### Managed Python runtime
- Private CPython 3.12.x runtime managed by CEVRA desktop releases
- No manual Python installation required for normal users
- Runtime and packages pinned and updated through the CEVRA release/update process
- Preferred redistributable build source: audited pinned `python-build-standalone` artifact or equivalent compatible CPython distribution
- System Python ignored except in explicit developer mode

### Media Engine
- FFmpeg/ffprobe behind `MediaEngineAdapter`
- Typed validated operations only
- Evaluate/import compatible MIT capabilities from `ffmpeg-skill`
- No arbitrary agent-authored filtergraph in the stable execution path
- Python helpers execute inside the CEVRA-managed runtime

### Composition Engine
- HyperFrames behind `CompositionEngineAdapter`
- HTML/CSS/JS composition with compatible animation libraries
- No Remotion dependency in target architecture

### Transcription Engine
- faster-whisper for standard local transcription
- WhisperX for word-accurate alignment/diarization when needed
- Python dependencies installed only inside the CEVRA-managed runtime

### QA Engine
- Deterministic technical checks
- Optional agent-assisted visual/editorial review
- QA findings are evidence-bearing PASS/WARN/FAIL/UNKNOWN records

### Interchange
- OpenTimelineIO adapter for interchange
- Future OpenCut adapter reserved until upstream APIs stabilize
- Future Premiere/Resolve adapters must map through Project IR, not bypass it

### Generation
- Image generation provider contract prepared for permissively licensed local models such as FLUX.1 Schnell where license requirements remain compatible
- Video generation provider contract prepared for permissively licensed local models such as Wan 2.2 where license requirements remain compatible

## 4. Application layers

1. Presentation — UI, timeline, style controls, simple/manual modes.
2. Application — use-cases, project services, history, export orchestration.
3. Domain — Project IR, typed operations, validation, migrations, capabilities.
4. Infrastructure — media/composition/transcription engines, managed runtimes, filesystem, updater, secure storage and providers.
5. Agent Bridge — typed tools for Codex/Claude operating through application commands rather than direct engine access.

## 5. UX modes

### Simple mode
Natural-language editing plus high-level presets.

### Manual mode
Timeline and direct property controls without requiring an AI agent.

Both operate on the same Project IR and history system.

## 6. Desktop/mobile

Desktop is the complete local workstation. Mobile supports project browsing, preview, review, lightweight edits, presets and compatible local functions. Heavy functions may be delegated to a paired trusted desktop execution node. Domain code must never assume desktop-only filesystem paths. The desktop Python runtime is not a mobile requirement.

## 7. Updates and compatibility

- Signed application updates.
- The managed Python runtime and its pinned packages are versioned release components and update with CEVRA rather than through global `pip`/system package mutation.
- Dependency updates arrive through reviewed pull requests and CI.
- Major dependency updates require manual review.
- Project IR migrations protect older projects.
- Engine adapters isolate upstream breaking changes.
- Feature flags gate experimental capabilities.

## 8. Security

- Secrets live in OS-backed secure storage.
- No credentials in Project IR or logs.
- Agent tools are allow-listed typed actions.
- No arbitrary shell access from end-user editing surfaces.
- Update manifests and release artifacts must be signed.
- Managed runtime packages and separately downloaded runtime artifacts must be version-pinned and integrity-verified.

## 9. Licensing

- CEVRA-owned application code is proprietary by default.
- Permissive dependencies are tracked with source, version, license, modifications and notices.
- Redistributed CPython/runtime components require release-level provenance and bundled notices for Python and native dependencies.
- EDVID MIT code may be reused with attribution.
- Proprietary/UNLICENSED references are clean-room reimplementations unless separately licensed.

## 10. Stability policy

External libraries can change. The stable contracts are CEVRA Project IR, command API, history/journal model, provider interfaces, migration system, adapter interfaces and UX behavior. Upstream changes should require adapter/runtime-bundle changes rather than product rewrites.
