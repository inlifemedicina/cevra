# ADR 0008 — Persistent Media Worker Lifecycle and Cancellation

## Status

Accepted.

## Context

The CEVRA Media Runtime uses a private managed CPython process to execute typed media tools. A synchronous request loop cannot receive cancellation while FFmpeg is running, while terminating the whole worker for each cancellation defeats the persistent-runtime decision and may leave partial output or orphaned processes.

## Decision

Each desktop Media Runtime instance owns one persistent `cevra-media-worker` with the following lifecycle:

- one media job executes per worker at a time;
- the control loop remains responsive while that job runs;
- Python tools execute serially and in-process inside the private managed CPython runtime;
- the worker records the active `jobId`, cancellation state, media subprocess and output artifacts;
- cancellation addresses a `jobId` and terminates only that job's active media subprocess;
- cancellation removes only partial artifacts created by that operation; pre-existing files are never deleted by cancellation cleanup;
- after cleanup, the worker remains healthy and accepts the next job;
- close cancels and drains the active job before the worker exits;
- an unexpected worker exit rejects in-flight work; the transport starts a fresh worker for a later request;
- internal concurrent tool execution is not supported in this version.

If parallel media execution is required later, orchestration will allocate multiple workers above this layer. It will not introduce concurrent Python tool execution within one worker.

## Consequences

The JSON-RPC transport may deliver responses out of request order because control messages continue while the serialized media job runs. Media jobs require stable unique `jobId` values. The process wrapper must use argument arrays without a shell and must retain enough state to terminate, reap and clean up a cancelled operation safely on Windows and Unix-like systems.

The lifecycle remains behind `MediaEngineAdapter`. This decision does not change Project IR, the media engine choice, persistence, mobile architecture or end-user editing contracts.
