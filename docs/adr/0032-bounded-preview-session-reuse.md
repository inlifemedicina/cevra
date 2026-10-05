# ADR 0032 — Bounded preview session reuse and admitted initial frame

**Status:** Owner-approved bounded evolution; IN DEVELOPMENT / NOT MERGED in Draft #85
**Date:** 2026-10-05

## Context and approval

Production-host measurements showed full-source inspection and encoding repeated
on unchanged selection. A real fractional-IN V1 also reproduced black paused
WKWebView canvas pixels despite current video data and two rendering callbacks.
The existing typed extraction primitive produced the first admitted frame from
the verified derivative. Following feasibility and independent architecture
review, the owner approved two stages: exact-range derivative reuse with an
ephemeral PNG, then reuse of verified range-independent source inspection.
This applies the measured FIX NOW gate in AGENTS rules 34–36. It does not replace
a bounded excerpt with a full Original proxy and an OUT pause.

## Decision

The Host owns a process-local LRU of at most four entries and 32 MiB, counting
video/PNG bytes and conservative metadata. Keys bind canonical source identity,
technical descriptor, exact IN/OUT, closed profile and verified runtime manifest.
Every hit freshly hashes the original and validates the current range/snapshot
and runtime identity. DTOs carry fresh current IDs. Private entry seals detect
corruption; invalid entries are evicted and regenerated. Entries become visible
only after full admission, worker settlement, owned temporary cleanup and final
state/cancellation checks. Close clears memory, rejects new requests and prevents
a finishing operation from repopulating the cache.

The existing typed `extract-frame` runs at movie time zero on the admitted
derivative. Its no-follow regular-file descriptor remains open through extraction;
publication identity and stable file state are rechecked. PNG publication must
match device/inode, header and admitted dimensions, longest side ≤720 px and
size ≤2 MiB. Video remains ≤8 MiB. FD close cannot mask the primary failure.
The initial-frame DTO is ephemeral transport data, never a source, durable
execution or Project IR asset. Its timestamp is the first admitted source frame,
which can follow fractional logical IN; the movie remains paused at zero.

The UI validates and decodes the PNG, binds it to the current URL and requires
matching image dimensions plus validated video metadata/current-frame readiness
before Play. Either decoding order is valid. Stale responses/events cannot unlock
a replacement. Play, seek, leaving IN, failure and disposal hide or release the
image. There is no autoplay, time advancement or brightness gate; legitimate
black content remains valid. Transport base64 is removed from retained React
metadata after creating the Blob/image.

Media Runtime 0.3.4 owns an inspection LRU of at most four entries and 1 MiB of
conservatively counted resident Python objects. Only complete range-independent
facts are retained: validated metadata, decoded frame PTS/durations/rotation and
decoded audio origin/count. Keys use a freshly hashed source digest/size, tool
paths and inspection version. Source change/cancellation during inspection
publishes nothing. Seals and detached copies protect retained facts; corruption
evicts and rescans. Each derivative still receives complete output probe,
decoded-frame/audio, publication and hash admission plus fresh initial/final
source hashes. Shutdown clears facts after job retirement. Frame scans use two
decoder threads; functional frame oracles verify preserved semantics.

## Boundaries and verification

Caches disappear at close; eviction or reopening regenerates. First inspection
and encoding remain substantive work, and hits still hash/transport/decode.
Retained-byte budgets are not total process RSS or transient JSON/decoder bounds.
Host timing must not be presented as full UI latency.

No IR/History/Package migration, durable cache, new command, WebView permission,
dependency, provider or license is added. Originals and final-quality policy
remain under ADR 0013; typed execution, source bounds, PTS/audio/orientation and
strong admission remain authoritative. Director impact is a compatible execution
consumer extension, with unchanged proposal/context/permission/provider authority.

Regressions cover exact-range undo/redo, changed identities, corruption, LRU/byte
limits, cancellation, stale images, publication attacks, failed extraction and
shutdown. Exact-runtime oracles cover CFR/VFR/fractional-IN first-frame identity,
black content, audio and rotated/color output. Measurements and acceptance gates
are recorded in [Manual Timeline Trim V1](../CEVRA_MANUAL_TIMELINE_TRIM_V1.md#approved-preview-fluency-and-admitted-png--2026-10-05).
Technical PASS cannot promote the owner V1 first-frame FAIL. Recheck only that
frame; preserve accepted compact/tabs/fields/scroll and real Take
orientation/voice/content/save/reopen. Composition/export/release and broader
provider acceptance remain separate gates.
