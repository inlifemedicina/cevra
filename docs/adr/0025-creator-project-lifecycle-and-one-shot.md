# ADR 0025 — Creator local project lifecycle and one-shot fast path

Status: Accepted

Date: 2026-09-22

## Context

CEVRA Creator must preserve EDVID-level simplicity when starting from a folder or directly supplied media, while keeping Project IR / ProjectHistory as canonical audiovisual state and remaining resumable across hosts and sessions.

Short one-shot edits must not pay a material model-context penalty merely because CEVRA maintains robust local project state.

## Decision

Creator creates or opens a local CEVRA project automatically by default, without a mandatory setup wizard.

Supported initiation patterns include:

- user opens an agent in a folder containing media and asks CEVRA to edit it;
- user supplies one or more media files directly to the compatible host/workflow;
- user reopens a folder/workspace containing an existing CEVRA project and asks to continue.

The conversation/session is never the project. Canonical audiovisual state remains in CEVRA-owned Project IR / ProjectHistory and compatible local project storage.

Projects are resumable across compatible hosts and surfaces. A project created through Claude Code can later be continued through Codex, another compatible host, Creator Full visual workspace or optional Vids handoff without reconstructing state from prior chat history.

## One-shot fast path

For short edits that begin and finish in one interaction/session, Creator uses a token-efficient one-shot path while preserving the same underlying canonical semantics.

Principles:

- local project creation itself does not require large model context;
- the host receives only a compact project summary and the minimum evidence needed for the task;
- no whole-project Project IR dump is sent to the host by default;
- no prior conversation transcript is required to preserve edit state;
- revision/delta references are preferred to repeated full-state transfer;
- deterministic local analysis/cache may be reused without retransmission;
- the same typed command/history path is used, avoiding a separate disposable editing engine;
- temporary derived artifacts may be cleaned after successful export according to later lifecycle policy, while canonical project state and user-visible exports follow retention rules.

Therefore, robustness of Project IR/history must not create a material token penalty for simple one-shot editing.

## User-facing simplicity

The ordinary flow remains:

```text
media or folder
→ natural-language request
→ automatic local CEVRA project
→ analyze / edit / preview
→ optional refinement
→ final local export
```

Internal project IDs, revision IDs, storage layout and schemas remain hidden in normal use.

## Storage and outputs

- original media remains immutable;
- project state/history are CEVRA-managed;
- caches, previews, proxies and intermediates are derived artifacts;
- final exports are placed in a predictable user-accessible location;
- exact directory names/layout are deferred to implementation design.

## Non-goals

This ADR does not yet freeze:

- exact folder names;
- retention duration;
- auto-clean policy;
- project naming UX;
- Creator Lite vs Full retention differences;
- cloud sync.
