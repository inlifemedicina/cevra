# CEVRA Vids Desktop Runtime V1

Tauri 2 + React desktop application backed by a private supervised Node host.
Normal Tauri runtime uses `TauriDesktopBackend`; browser-only visual development
uses the explicit, non-persistent `DemoDesktopBackend`.

## Run the native window

Development prerequisites: Node.js 22.23.2 or newer, npm, the Tauri platform
prerequisites, and the Rust toolchain.

From the repository root:

```sh
npm ci
npm run desktop:dev
```

Build the native executable without packaging an installer:

```sh
npm run desktop:build
```

Both root desktop commands build the CommonJS host bundle and prepare the
checksummed private Node.js 22.23.2 runtime before starting Tauri. A
user-installed Node is not required by the packaged application.

Frontend-only development and verification:

```sh
npm run dev -w @cevra/desktop
npm run build -w @cevra/desktop
npm run test -w @cevra/desktop
```

Media and transcription are independently capability-gated. Release operation
accepts only fixed, validated CEVRA runtime resources. Internal development may
set trusted process-side configuration before launching Tauri:

- `CEVRA_MEDIA_RUNTIME_ROOT` with `CEVRA_MEDIA_RUNTIME_MODE=development`;
- `CEVRA_TRANSCRIPTION_MODE=development`;
- `CEVRA_TRANSCRIPTION_PYTHON`;
- `CEVRA_TRANSCRIPTION_ENV_ROOT`;
- `CEVRA_TRANSCRIPTION_WORKER`;
- `CEVRA_TRANSCRIPTION_MODEL_CACHE`;
- optional allow-listed model, device, and compute profile values.

Debug Rust copies only this allow-list after `env_clear()`. React cannot set
runtime paths, executables, scripts, arguments, or child environment. Model
downloads remain disabled.

The Tauri capability attached to the main window grants only the six generated
application-command permissions for `desktop_get_state`, native pick-and-ingest,
transcription, undo, redo, and cancellation. No shell, dialog-plugin, filesystem,
HTTP, process, or sidecar permission is granted to the WebView. Shell and dialog
plugins are used only inside trusted Rust code. The CSP remains explicit and
closed, and a Rust regression guard keeps command registration, the build
manifest, and the capability ACL identical.

The current package prepares and redistributes the pinned private Node runtime
and fixed desktop-host/transcription-worker resources. It does not yet ship the
Media Runtime bundle, private Python runtime, transcription environment, or a
model cache. Therefore real ingest/transcription are unavailable in an ordinary
V1 package unless those fixed trusted resources are supplied by a later release;
the environment configuration above is debug/developer-only. A cache snapshot
directory is merely a presence gate—the existing adapter healthcheck remains the
authoritative fail-closed runtime/model validation. Model downloads stay off.

CI verifies both pinned Node archives and hashes, executes the host under the
Linux private runtime, checks the exact Tauri external-binary/resource map, and
executes a staged bundled-worker resolution probe. Native installer/signing
production remains platform-specific, so this slice uses the deterministic
resource contract plus Tauri `--no-bundle` compilation rather than claiming a
cross-platform signed installer.

Current pre-PR hardening validation passes 261 Node/TypeScript tests (including
38 desktop UI and 16 desktop-host tests), 22 Python tests, and 19 Rust tests.
The frontend production build, `cargo check --locked`, optimized Tauri
`--no-bundle` build, native descendant-containment tests, and private-Node
protocol smoke also pass locally.
