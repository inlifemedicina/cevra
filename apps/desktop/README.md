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

The Tauri capability attached to the main window remains `permissions: []`.
Shell and dialog plugins are used only by trusted Rust commands. React has no
generic shell, filesystem, network, sidecar, dialog-plugin, or host-RPC surface.
The CSP remains explicit and closed.
