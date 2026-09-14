# CEVRA Vids Desktop

Tauri 2 + React presentation shell for the CEVRA Vids desktop editor. The
current `DemoDesktopBackend` is an isolated, non-persistent presentation
adapter. Import, Director execution, preset orchestration, AI Change Set apply,
preview rendering, and export are intentionally unavailable until a future
typed desktop-host integration replaces that adapter.

## Run the native window

Prerequisites: Node.js 22.22.2 or newer, npm, the Tauri platform prerequisites,
and the Rust toolchain.

From the repository root:

```sh
npm ci
npm run desktop:dev
```

Build the native executable without packaging an installer:

```sh
npm run desktop:build
```

Frontend-only development and verification:

```sh
npm run dev -w @cevra/desktop
npm run build -w @cevra/desktop
npm run test -w @cevra/desktop
```

The Tauri capability attached to the main window grants zero host permissions.
There is no shell, network, filesystem, sidecar, or arbitrary command surface.
