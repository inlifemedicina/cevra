# CEVRA Update Strategy v1

## End-user updates
Use signed application updates. Normal users should not uninstall/reinstall the application for routine upgrades.

## Managed runtime updates
- Desktop Python is a private CEVRA-managed runtime, not a system dependency.
- CPython and Python packages are pinned per CEVRA release.
- Runtime changes ship inside the platform-signed CEVRA application/update artifact. If a runtime is downloaded separately later, the signed CEVRA updater must authenticate that component; the runtime's internal manifest is only its consistency/integrity verifier.
- Never run uncontrolled `pip install --upgrade` against the user's system Python.
- Runtime/package upgrades are validated on each claimed release target before stable release. The current Media Runtime v1 release evidence is macOS arm64; Windows remains planned.
- Major interpreter or ML-stack changes require manual compatibility review.
- Rollback metadata must allow the previous known-good runtime bundle to be restored when an update fails health checks.

## Dependency updates
- Automated detection through repository tooling.
- Lockfiles committed.
- Updates arrive as pull requests, not silent production changes.
- CI executes contract, migration, engine, integration and UI tests.
- Major dependency updates always require manual review.

## Engine compatibility
Every adapter reports semantic version, health and capabilities. Unsupported functions are disabled or degraded gracefully rather than failing unpredictably.

## Project migrations
Opening an older project executes a deterministic tested migration path. A backup is retained before destructive/one-way migration.

## Release channels
Architecture reserves `stable`, `beta` and `dev` channels. Commercial users default to `stable`.
