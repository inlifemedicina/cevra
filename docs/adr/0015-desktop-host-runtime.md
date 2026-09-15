# ADR 0015 — Desktop Host Runtime

- Status: Accepted
- Date: 2026-09-14
- Scope: CEVRA Vids Desktop Runtime Integration V1

## Context

CEVRA Vids needs a real local desktop path for native media selection, canonical
Project IR ingest, optional local transcription, and ProjectHistory undo/redo.
The existing application services and engines are Node.js implementations and
must not be imported into the React WebView or rewritten in Rust.

## Decision

The desktop runtime uses this boundary:

```text
CEVRA Vids React/WebView
  -> narrow typed Tauri application commands
  -> Rust Desktop Host Supervisor
  -> private persistent Node.js desktop host
  -> existing CEVRA TypeScript Application Services
  -> ProjectHistory / Project IR
  -> Media / Transcription engines
```

The WebView is presentation-only. It requests high-level CEVRA operations and
never receives shell access, process spawning, generic filesystem access, raw
sidecar access, executable selection, or raw FFmpeg/Python/Node arguments.

Rust/Tauri is the trusted local gate. It owns the native file picker, launches
only the bundled private Node executable with the fixed desktop-host resource,
sanitizes the child environment, routes the closed operation set, supports
cancellation, and reaps the child. The shell and dialog plugins are used only
from Rust; the main WebView capability remains `permissions: []`.

The persistent Node desktop host owns the live application session: one
canonical `ProjectHistory`, existing application services, Media Runtime and
transcription adapters, capability reporting, and operation cancellation. It
opens no TCP port, HTTP server, WebSocket, or inbound network listener.

Host IPC is versioned JSON Lines over private stdin/stdout. Stdout is
protocol-only and logs go to stderr. Protocol V1 has an explicit switch over:

- `host.hello`
- `host.status`
- `host.shutdown`
- `project.snapshot`
- `media.ingestLocal`
- `transcription.transcribeSource`
- `history.undo`
- `history.redo`
- `operation.cancel`

Requests use bounded IDs, closed parameter objects, a fixed protocol version,
and a 32 MiB maximum line. There is no arbitrary method lookup or generic
frontend RPC. The Rust supervisor holds the child/stdin lock only for short
writes, routes responses through a pending-request map, and can therefore send
cancellation while another operation is active.

The private runtime is Node.js 22.23.2 LTS from checksummed official nodejs.org
archives. The executable is prepared into ignored build output and packaged as
the `cevra-node` Tauri external binary. The fixed CommonJS desktop-host bundle
is a resource. Packaged operation does not require user-installed Node.js.

An unexpected host exit rejects all pending requests and marks the session
unavailable. It is not automatically restarted: ProjectHistory is memory-only,
so restart would silently replace the user's session. Recovery after host crash
belongs to the future persistence milestone.

## Rejected designs

- rewriting application services in Rust;
- importing Node application or engine code into the browser/WebView;
- localhost HTTP or WebSocket servers;
- Electron;
- WebView-accessible shell or generic filesystem plugins;
- one Node process per UI request;
- arbitrary method invocation, executable paths, scripts, arguments, or
  environment supplied by React;
- Node Single Executable Applications (SEA) for V1.

Node SEA remains an active-development Node feature and is unnecessary for this
bounded supervised architecture.

## Consequences

Project IR remains the sole audiovisual source of truth. Rust and React receive
cloned projections only. File authorization is user-mediated and Rust-owned.
Release Media and Transcription runtimes remain explicit, validated, and
independently capability-gated. Model downloads remain disabled. Persistence,
preview playback, Director execution, preset execution, and export remain
deferred.
