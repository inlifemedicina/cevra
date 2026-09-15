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
from Rust. Plugin/core capabilities remain ungranted to the WebView. The main
window has an explicit application-command ACL containing only the six typed
`desktop_*` commands; adding a registered command without matching manifest and
capability review fails the regression guard. A future window/WebView receives
none of these commands unless it is explicitly included in a reviewed capability.

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

An unexpected host exit originally rejected all pending requests and marked the
memory-only session unavailable. ADR 0016 now narrowly supersedes that lifecycle
consequence: once a durable Project Store checkpoint exists, one bounded restart
may restore it. ADR 0015 protocol/identity failures remain terminal, and no
interrupted operation is automatically replayed.

On cooperative shutdown the host aborts active application operations, waits
for their existing engine cleanup, closes the Media Runtime client, and exits.
On abnormal Node termination, Rust can only force-kill the direct Node child; it
does not claim process-tree reaping. Descendant containment is instead explicit:
the transcription worker keeps a parent-liveness stdin pipe and exits immediately
on EOF, while the persistent Media worker's existing EOF cleanup cancels and
reaps its active subprocess. Native-process tests exercise both chains with real
PIDs. A malformed protocol or non-settling mutation permanently fails the
active session; ADR 0016 does not classify those integrity failures as a
recoverable process loss.

The transcription worker protocol is one request with an explicit stdin-lifetime
contract: the parent starts the worker, writes exactly one request, keeps the
stdin pipe open as the parent-liveness channel, reads the result, waits for the
worker to exit, and only then lets the pipe close. Stdin EOF is not a normal
request terminator; EOF while the worker is active means parent loss or a contract
violation. The watchdog blocks directly on raw file descriptor 0 so normal
CPython shutdown never contends with buffered stdin finalization.

Control requests use bounded timeouts. A long mutation timeout triggers its
operation cancellation and awaits settlement; after a cancelled/error settlement
the supervisor requests a fresh canonical snapshot and returns it as reconciliation
metadata. If settlement cannot be proven, the supervisor kills the host and makes
the session unusable, preventing an invisible late mutation in a still-usable UI.

Desktop Runtime Integration V1 redistributes the pinned private Node runtime and
the fixed transcription worker script, but it does **not** yet redistribute a
Media Runtime bundle, private Python distribution, transcription dependency
environment, or model cache. Consequently, release import/transcription remain
capability-gated unavailable unless future packaging supplies their fixed trusted
resources; internal debug operation may use only the Rust-side allow-listed
configuration documented for development. Model downloads remain disabled. The
model-cache directory check is only a cheap snapshot-presence gate; the existing
transcription adapter healthcheck is authoritative and fails closed on unusable
runtime/model state. Full model artifact inventory belongs to the model-manager
milestone.

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
