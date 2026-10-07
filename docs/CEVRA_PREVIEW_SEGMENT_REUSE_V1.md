# Guarded preview segment reuse — V1

Status: **implemented, local validation PASS, unmerged; native/Owner gates open**.
Exact-head CI and independent-review status is recorded on the implementation Draft.
Date: 2026-10-07. Base: `278627ec4463a3a69d6c3b0adcbd8ff9cf1f914d` / Draft #90.
Decision: [ADR 0035](adr/0035-preview-segment-memory-reuse.md), Owner approved.
This is the canonical implementation/evidence record for the approved
[latency proposal](CEVRA_VIDS_USABILITY_AUDIT.md#2-alternativas-e-proposta-para-aprovação).

## Result and boundary

Manual CFR30 preview retains immutable, fully admitted H.264 segments and grid
receipts in the existing worker. Reordering/removing occurrences reuses their
segments; an unseen trim regenerates its exact interval. The current complete
program, AAC/PCM endpoints, source integrity and publication are still admitted
on every render. The final-export path continues to derive from originals.

The worker LRU shares **32 MiB / 64 entries across committed and pending
objects**, including conservative object/key/receipt overhead. This is stricter
than the proposal's initial payload-only wording. It consumes the existing
**512 MiB aggregate worker/process-group RSS** allowance. Restore reserves the
complete byte size before opening its writer inside the existing **2 GiB**
logical ledger. Admission never adds a second allowance.

Keys include original SHA/size, complete source video metadata/stream,
orientation/colour, exact IN/OUT, grid/sampler/profile/dimensions, encoder
arguments and current worker/tool/manifest hashes. A hit verifies immutable bytes,
exact receipt, an ephemeral private integrity seal and the restored file hash.
Pending bytes promote only after complete-program admission, successful cleanup
and cancellation checks. Corruption evicts/regenerates; cancellation/failure,
restart, configure and shutdown discard retention.

Only a live captured transport resource lease supplies the private marker;
operation/UI input cannot enable it. The current admitted preview's single
first-frame extraction receives the same resource limits and counts its own
temporary root, preserving segments through PNG delivery. Other worker operations
release retention before running without this supervision.

Host source/snapshot/Journal and UI current-media/readiness checks remain
authoritative. Original viewing, export, typed state, History, package/schema,
permissions and providers retain their established roles. Director impact is a
**compatible derived-preview extension**. No dependency, durable cache, source
authority or user cache setting is introduced.

## Measurements

One execution per case on the same macOS arm64 machine, synthetic A/B originals:
12 unique five-second intervals / 1,800 frames / 60 s; reorder reverses them,
trim advances one IN by one frame; removal deletes two occurrences. All cached
worker and Host outputs match uncached original-derived references for **every
decoded picture and every decoded PCM sample**. Sources retain their SHA-256.

| Case | Worker + adapter/guard | Host child + JSON + PNG | Actual packet → React/Blob/PNG DOM |
| --- | ---: | ---: | ---: |
| Cold | 9.625 s, 12 misses | 11.128 s | 165.8 ms |
| Warm, same program | 1.715 s, 12 segment hits | 77.8 ms, existing whole-program Host cache | 152.1 ms |
| Reorder | 1.675 s, 12 hits | 2.148 s | 152.2 ms |
| Trim one frame | 2.383 s, 11 hits / 1 miss | 2.794 s | 154.0 ms |
| Remove two occurrences | 1.574 s, 10 hits | 1.747 s | 122.6 ms |

The matching uncached worker references took 7.407–8.849 s. These are
individual measurements with normal OS caches, not a latency SLA or dedicated
benchmark; the cold worker sample overlapped a local build. Host warm is the
previously admitted complete-program cache, not evidence of a new segment render.
The receipt's generic `includes` text originally also described render/PNG for
that warm row; this distinction is authoritative and the harness label is fixed.

The UI column measures real Host payload validation, base64/Blob allocation and
React DOM attributes using jsdom. It is a separately timed handoff, **not**
continuous edit-to-native-frame readiness. No native decoder/paint events are
invented: Play stays disabled. A late prior-snapshot response creates no Blob
and cannot replace the current PNG/media. WKWebView decode, paint, perceived
waiting/continuity/audio and Owner acceptance remain **NOT EXECUTED**.

Observed real-render peak RSS was 121,372,672 bytes with 13 retained entries
charged at 4,111,087 bytes. Synthetic byte pressure using the actual production
cache objects reached 33,546,976 charged bytes, evicted at the 32-MiB limit and
at entry 65, under the same 512-MiB native RSS observer. Those pressure bytes are
not admitted media. Sampled RSS/disk evidence and logical reservations do not
prove an unsampled instantaneous physical cap.

## Verification and preserved failures

- Media Python **151**, Transcription **11**, Alignment **11** tests PASS.
  Fourteen cache cases cover corruption/forged digest/receipt/key, identity,
  grid/profile/runtime changes, pending/shared bounds, LRU/oversize, cancellation,
  epoch/abort, unsafe/changed files and reserve-before-write.
- Host guard tests bind only the current output/first-frame/root with the
  existing budgets. Transport tests prove caller markers cannot enable reuse.
  The real pressure test covers shared native RSS, byte and entry eviction.
- Exact sealed-runtime CFR24/B-frames, NTSC/late source clock, VFR, repeated and
  single-frame intervals, 44.1-kHz offset/stereo, 60-s preview/final, independent
  frame/PCM clocks and audited original-master export catalog PASS.
- New release-runtime catalog verifies actual segment hits, all-picture/PCM
  equality, confirmed live-job cancellation, worker restart and actual Host
  cold/warm/reorder/trim/removal. The CI also exercises generated synthetic inputs
  and the actual UI packet consumer.
- Full offline monorepo **1,485 PASS** (UI236, Host184, Media145 and inert
  Claude-PoC391 included); one gated actual-packet UI catalog is skipped by
  default and passed separately for A/B and generated CI fixtures. Build PASS.
  Private Python 3.12 and the native observer are explicit. Generated CI fixtures
  also passed the release-runtime/Host comparison and cancellation/restart gates.

Earlier evidence is preserved. Python 3.9 caused two model-presence fixtures to
report runtime-invalid; explicit private 3.12 passed all three focused cases.
The containment fixture lacked the worker's new keyword, so its parent waited
without publishing a PID. The old SIGTERM failure and the later 60-s timeout
remain failures; the corrected signature and bounded 15-s PID wait pass both
containment cases. No real model loading or inference occurs in these fixtures.

Two native RSS tests failed closed inside the sandbox because observation was
unavailable; their native-authorized rerun passed. Bytecode generated by isolated
Python probes changed the owned runtime tree: sealed verification correctly
rejected it. Test Python is now separate and the owned runtime was cleaned of
generated bytecode and resealed. The first measurement harness used raw stored
clip order after reorder; the Host correctly rejected the mismatched source
request. Using the canonical timeline projection passed. None of these prior
failures is silently overwritten or relabeled PASS.

External technical receipts are retained outside Git; no media, logs, private
paths or source projects are committed. Useful SHA-256 anchors:

- Segment/Host receipt: `81700736d5f866f42bd19ad4e277a08029a6355884110f8732ea44836b930a24`.
- Actual-packet UI handoff: `5f24a1dabcf0757e0386e093651ed24e4e0caa131c504cf81cb8ac3d42c8a21d`.
- Original-master runtime catalog: `5077bdcc7d73cced7492ba92ab15a1acaab19c312eac4fed3bc81e75c4e9b7d7`.

## Remaining coordinated gates

Exact new-head CI and an independent review must finish before a new grouped
native test package is prepared. Continue the
[single G1 catalog](CEVRA_PRODUCT_OWNER_ACCEPTANCE_TESTS.md#single-grouped-g1-script):
I4-T1, X-T1/T7 and X-T6 cover edited preview, fields/focus/shortcuts, export and
close/reopen together. No new per-field acceptance round or current human-app
operation is authorized here.

The measured improvement does not establish immediate updates or subjective
acceptance. Progress stays **55%**; **F-A02 exhausted 1/1** and full G1 unaccepted
remain. No merge, human app/session/device operation, AI call or issue #88 body
publication is included.
