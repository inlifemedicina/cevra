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
