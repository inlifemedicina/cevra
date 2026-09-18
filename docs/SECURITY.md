# CEVRA Security Baseline v1

- Store secrets in OS-backed secure storage.
- Never place API keys or signing keys in Project IR, source control or normal logs.
- Agent commands are typed and allow-listed.
- File access is scoped to user-selected projects/assets where practical.
- Updates and release artifacts are signed.
- Validate imported paths and external provider responses.
- Dependency provenance and integrity are tracked.
- Crash reports/telemetry are opt-in unless legally/operationally required and explicitly disclosed.
- Local project autosave must avoid leaking sensitive media to cloud providers without explicit user action.

- Stable installers must be core-complete: mandatory V1 runtimes, engines, assets and minimum required models cannot be omitted or silently fetched after installation without explicit approved bootstrap design.
- Production update artifacts and manifests are cryptographically verified; updater signing private keys remain outside source/binaries and have secure offline backup.
- Stable/release builds must not trust dev update keys, dev channels or development license bypasses.
- Behavioral telemetry is disabled by default in V1.
- Crash reporting is opt-in and allow-list based; redact paths, content, prompts, transcripts, media and secrets before transmission.
- Session/screen replay is prohibited in V1.
- Local diagnostics bundles are generated before upload and must exclude project/media content by default.