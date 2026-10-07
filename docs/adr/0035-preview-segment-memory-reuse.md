# ADR 0035 — Guarded preview segment memory reuse

Status: **OWNER APPROVED / IMPLEMENTED, LOCAL VALIDATION PASS / NOT MERGED**

Date: 2026-10-07

## Approval and scope

After the bounded worker feasibility proof in the Vids usability audit, the
Product Owner approved integrating segment reuse and confirmed proceeding after
the first implementation dispatch was cancelled before execution. This separate
delta starts at `278627e` / Draft #90. It extends ADR 0032 and ADR 0034 inside the
existing Media adapter, persistent worker and typed preview operations.

## Decision

Retain only immutable, fully admitted preview H.264 segment bytes and their
validated CFR30 grid receipts in a worker-local LRU. Candidate ceilings are
32 MiB of conservatively accounted resident entry objects and 64 entries.
Committed plus pending entries share that ceiling. They consume the existing
512 MiB aggregate renderer RSS allowance; no extra allowance is added. Every
restored segment reserves its complete logical size before writing inside the
existing issued 2 GiB workspace ledger. Originals, PCM, final exports and
full-resolution segments are never retained in this cache.

Keys bind freshly verified source digest/size, video stream and complete source
video metadata including orientation/colour, exact IN/OUT, sampler/grid,
preview dimensions/profile and complete encoder arguments, plus verified tool
and worker/runtime identity. A hit verifies immutable bytes, a private receipt
seal, exact grid/profile binding and the restored file hash. Full-program grid,
audio, publication and fresh original checks remain mandatory. Entries publish
only after successful whole-program admission, cleanup and cancellation checks.

The trusted process transport marks calls only while its captured resource lease
is active; callers cannot turn this on through operation arguments or supply
budget values. Other jobs and controls release segment retention before running
outside supervision. The admitted preview's first-frame extraction receives
its own same-budget scope, so it can preserve entries while counting its worker
and owned temporary files. Invalid bytes or metadata evict and regenerate;
failure/cancellation, shutdown and retired worker generations discard retention.

Current UI snapshot/media invalidation remains authoritative. A cached segment
never makes an old program current; the complete current program is assembled,
admitted and delivered before the existing readiness checks can enable Play.
There is no IR/History/Package change, user cache setting, persistent cache,
provider, dependency, alternate engine or final-export quality change.

## Gates and limits

Verify corruption, identity/profile/runtime changes, eviction/full-cache pressure,
pending admission, cancellation/restart, source integrity, restore reservations,
aggregate observed RSS, and release before unrelated work. Compare all decoded
pictures and PCM against uncached original-derived references, including CFR24,
NTSC/VFR, repeated ranges, audio offsets and 44.1-kHz sources.

Measure cold/warm/reorder/trim/removal separately at worker, Host and UI handoff.
Synthetic DOM/readiness timing does not prove WKWebView decode or real perceived
latency. Existing waits and full G1/human gates stay open until their appropriate
evidence; sampled RSS and logical reservations are not instantaneous physical caps.
Exact-head CI and independent review are required before a grouped test package.
No merge, app replacement, human session, phone/Take operation or AI call is part
of this implementation. Director impact is a compatible derived-preview
extension with unchanged context/permission/provider and typed state boundaries.
Progress remains 55%; F-A02 remains exhausted at 1/1.

## Implementation evidence

[Canonical record](../CEVRA_PREVIEW_SEGMENT_REUSE_V1.md) distinguishes worker,
actual Host/PNG/JSON delivery and actual-packet React DOM handoff, full-picture
and PCM equality, native cache pressure and preserved failed/incomplete runs.
Exact new-head CI and independent review remain required before a new package;
DOM delivery does not certify native decode, paint or Owner acceptance.
