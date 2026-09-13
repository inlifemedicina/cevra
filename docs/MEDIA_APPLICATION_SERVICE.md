# Media application service

`@cevra/application` is the application-layer boundary for real media operations.
UI and agent surfaces call this service with a typed `MediaOperation` and a typed
Project IR effect. The service invokes a `MediaEngineAdapter`; it does not depend
on FFmpeg, the Python worker, desktop paths, Workflow Presets or Content OS.

## Transaction boundary

For an output-producing operation, the service:

1. validates the media operation and its declared Project IR effect;
2. records the requested attempt and the current Project IR revision/snapshot;
3. uses non-following filesystem metadata and refuses regular pre-existing files,
   valid symlinks, dangling symlinks and non-file outputs;
4. records engine identity/version provenance and invokes the adapter with a stable
   per-attempt `jobId`;
5. verifies that the expected output exists, has an A/V stream and matches the
   resolved container/codec delivery and effective encoder profile;
6. verifies that Project IR did not change while the engine ran;
7. commits `source.add` or `export.add` through `ProjectHistory`;
8. records the resulting journal entry, revision and snapshot references.

The desktop composition root can supply `NodeMediaArtifactStore` from
`@cevra/media-ffmpeg`; other platforms provide the same small artifact port with
their native storage APIs.

The file is never an editable state model. A successful source or export becomes
visible to the project only through its typed command and Project IR snapshot.
Read-only probe and silence-detection operations are recorded but create no Project
IR mutation. They do not fail solely because another command advances the Project
IR revision while they run; mutating operations retain the revision/snapshot guard.

## Failure, cancellation and recovery

Failures and cancellations do not commit the declared Project IR mutation. The
service removes only outputs that did not exist before that attempt and records
removed and failed-cleanup paths. Pre-existing filesystem entries are rejected
before engine execution and are always preserved. Cleanup also protects media URIs
referenced by any retained Project History snapshot, including snapshots reachable
through redo.

`MediaExecutionRepository` stores application orchestration records: request,
attempts, results, output paths, cancellation/failure, cleanup evidence, engine
provenance and references to the authoritative Project IR journal/snapshots. It
does not contain Project IR state and does not replace or duplicate
`ProjectHistory`. A persistence adapter may archive these records outside the
Media Runtime. `recoverPending()` marks interrupted attempts, safely removes their
new partial outputs and retries them with a new worker `jobId`. A two-phase
`committing` record lets recovery recognize a Project IR command that was already
committed before a process stopped, preventing duplicate execution or deletion of
the committed output.

## Internationalization

Application errors expose stable `MEDIA_*` codes separately from localized text.
Public messages use translation keys from `@cevra/i18n`; PT-BR and EN-US catalogs
are checked for exact key parity. Raw worker/FFmpeg messages are retained only as
technical execution evidence and are not returned as the user-facing message.
