# ADR 0026 — Creator mobile and remote host experience

Status: Accepted

Date: 2026-09-23

## Context

Creator is intended to be usable not only from a desktop Claude Code session but also from mobile/remote agent surfaces when officially supported. As of the decision date, Claude mobile exposes a Code surface and official remote-control/session handoff mechanisms. These provider capabilities are dated evidence and must be revalidated at implementation/release time.

The Creator must remain provider-neutral and must not require Anthropic mobile infrastructure for basic operation.

## Decision

Treat **good mobile/remote host usability** as a Creator product requirement.

Initial preferred topology:

```text
phone / Claude Code mobile or compatible remote host
        ↓
official host session / remote-control transport
        ↓
Creator Skill
        ↓
standalone CEVRA Core running on the trusted desktop/local node
        ↓
project / preview / render / export
```

This preserves the approved Creator standalone architecture while keeping heavy audiovisual execution on the machine that owns the CEVRA runtime and media.

Mobile/remote use should support, when the host surface permits:

- starting or resuming a Creator session;
- natural-language requests and refinements;
- progress/status and cancellation;
- preview/result access appropriate to the host;
- selecting or referring to project/media through supported host transport;
- continuing the same canonical CEVRA project later from desktop or another compatible host.

## Cloud/mobile execution

A fully cloud-executed Creator session is optional future work. It may be supported only if CEVRA Core/runtime, media staging, permissions, privacy, cost, retention and export delivery are implemented explicitly. Cloud execution is not required for mobile control and must not become a silent dependency.

Repository/project-hosted Skills or account-synced Skills may be used when officially supported by the host, but CEVRA does not assume one provider-specific distribution mechanism as canonical.

## Provider neutrality

Claude Code mobile is the first concrete target experience, not an architectural dependency. Codex, local/self-hosted or future remote/mobile hosts should be able to use the same Agent Protocol and CEVRA Core contract when equivalent capabilities exist.

## Non-goals

This ADR does not freeze:

- a mobile-native CEVRA editor;
- cloud rendering;
- permanent cloud media storage;
- provider-specific remote-control APIs;
- final mobile preview UI;
- mobile pricing/entitlements.
