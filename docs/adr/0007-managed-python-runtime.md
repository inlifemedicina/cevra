# ADR 0007 — Managed Python Runtime

## Status
Accepted.

## Context
CEVRA uses Python-based local components including the audited FFmpeg skill layer and transcription tooling such as faster-whisper and WhisperX. Requiring users to install and maintain a global Python environment would create setup friction, version drift and support problems.

## Decision
Desktop releases of CEVRA will use a private, application-managed CPython 3.12.x runtime.

- Python is a required internal runtime for desktop, not a manual prerequisite for end users.
- CEVRA must not modify, replace or depend on the user's system Python.
- The runtime is stored in an application-controlled location and invoked only by CEVRA-managed components.
- CPython 3.12.x is the initial compatibility baseline because it is supported by the approved Python media/transcription stack while avoiding unnecessary adoption of newer interpreter versions before ML dependencies are proven compatible.
- Runtime, Python packages and model-facing dependencies are version-pinned per CEVRA release.
- The installer may bundle the runtime directly; if a component is downloaded separately, it must be checksum/signature verified and managed by the same CEVRA update system.
- Routine CEVRA updates can replace/upgrade the private runtime without requiring a separate Python uninstall/reinstall.
- Existing system Python installations are ignored except in explicit developer mode.
- Mobile does not require the desktop Python runtime; Python-heavy work can be delegated to a trusted paired desktop node.

## Packaging source
The preferred packaging source is a pinned redistributable CPython build suitable for Windows/macOS, currently evaluated through Astral `python-build-standalone`. Release engineering must audit the exact binary bundle and preserve all applicable Python/dependency license notices before redistribution.

## Consequences
### Benefits
- one CEVRA installation for end users;
- deterministic Python version and dependencies;
- supports FFmpeg skill helpers, faster-whisper and WhisperX in one managed environment;
- fewer PATH, venv and package-conflict problems;
- runtime updates remain under CEVRA release control.

### Costs / risks
- larger desktop installer/update payload;
- release pipeline must build/test platform-specific runtime bundles;
- redistributed CPython and bundled native libraries require third-party license notices and provenance tracking.

## Rejected alternatives
- Require users to install Python manually: rejected for usability/support reasons.
- Reuse arbitrary system Python: rejected because versions and packages are not deterministic.
- Remove Python solely to simplify packaging: rejected because it would force premature rewrites of mature permissively licensed local tooling.
