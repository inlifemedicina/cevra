# CEVRA Update Strategy v1

## End-user updates
Use signed application updates. Normal users should not uninstall/reinstall the application for routine upgrades.

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
