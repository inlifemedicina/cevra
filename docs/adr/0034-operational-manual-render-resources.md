# ADR 0034 — Operational resources for manual sequence rendering

Status: **IMPLEMENTED / BOUNDED OFFLINE VALIDATION PASS / REVIEW AND PACKAGE GATES OPEN**

Date: 2026-10-06

## Approval and scope

At 10:38:21 UTC the Product Owner approved proceeding with the proposed
operational controls: reserve logical space before writing and interrupt a
render after observing excessive memory. The initial 512 MiB aggregate renderer
RSS and 2 GiB owned temporary-file budgets are validation settings, not proved
commercial limits or instantaneous physical guarantees. Material changes to
these values require an explicit recommendation before product adoption.

This supersedes the pending resource-contract choice in the G1 feasibility
record. It does not reinterpret earlier failed strict-ceiling evidence as PASS.
The scope is the existing manual-sequence preview/final pipeline, its private
job workspace, existing Host resource supervision and recovery. Project IR,
History, output quality, original sources, typed operations and engine/provider
boundaries remain unchanged. No new engine, dependency, persistence system,
automatic replay, real AI call or merge is authorized.

## Decision and feasible mechanisms

Maintain an exclusive in-memory ledger for the existing single active manual
render. Reserve logical bytes before each source copy, instruction file, native
segment, PCM, concatenated video and mux candidate. Count each simultaneously
retained filename, including the candidate/accounting hardlink overlap. Settle
completed producers against their actual regular-file size and release unused
reservations only after the producer has stopped. Known fixed-size allocations
must fit before expensive work; unknown encoded sizes receive a bounded
reservation rather than assuming the bitrate target is a maximum.

Closed Python writers check their reservation before writes. Native file
producers run through the same managed-Python process owner, using a fresh
exec wrapper that applies a per-file `RLIMIT_FSIZE` before the approved native
program starts. This does not apply a process-global limit to the persistent
worker. Avoid `preexec_fn` in the threaded worker. Disable inherited FFmpeg
report-file output and bind permitted temporary-file placement to the issued
workspace. The caller/UI cannot supply raw commands or budget overrides.

Python documents [per-process resource limits](https://docs.python.org/3.12/library/resource.html)
and the [threading hazard of preexec_fn](https://docs.python.org/3.12/library/subprocess.html#subprocess.Popen).
The file-size limit is one component of the logical admission mechanism; it is
not an aggregate filesystem block quota or a physical memory bound.
Reservations cover the closed pipeline's declared output files. The wrapper
does not intercept every possible framework/OS temporary write; live observation
and complete quiescent workspace admission remain required. Encoder inventory
is an exact internal read-only command, not a producer reservation.

Retain POSIX-group RSS and logical/allocated-file observation. Abort and retire
the captured worker generation after observed excess or unprovable observation.
Record sampled peaks, scan duration/actual intervals and observed overshoot.
The 100 ms scheduling delay follows observation and is not a maximum detection
or termination latency. RSS covers observed group members, not all GPU/framework
memory or processes outside that group. Allocated blocks remain measured and
checked at quiescent publication, without a no-overshoot quota claim.

Before publication, retain the existing identity-bound final/accounting checks.
Budget failures remain recoverable without an export journal entry or automatic
retry. Cancellation and failure clean only issued private intermediates after
producer retirement; uncertain public publication retains the destination and
accounting evidence for the existing recovery path. Preserve original media,
foreign replacements, retained History and already committed exports.

## Validation and limits

Use representative synthetic media and explicitly authorized fixtures only.
Exercise ordinary and constrained-budget jobs, admission before producer start,
partial writes, native file-size enforcement, multi-source/repeated segments,
PCM/mux overlap, sampled RSS abort, observation/cleanup failures and recovery.
Measure output picture/audio counts, hashes and quality alongside resource
peaks; do not silently reduce quality to fit a budget.

The operational gate closes only for the demonstrated workload/platform envelope
after tests, independent review, exact-head CI and a current isolated package.
The broader native/human/perceptual and release gates remain separate. Historical
strict instantaneous physical limits remain unproved and are outside this
operational contract. Windows native resource enforcement is not implied by
POSIX evidence. Director impact is a compatible internal execution extension:
resource failures supply bounded outcomes, not new planning or state authority.
Progress stays 55%; F-A02 remains exhausted at 1/1.

## Measured checkpoint

The current sealed R5 derivative retains the approved Python 3.12.14, FFmpeg
9.0.1 and runtime/worker protocol version 0.3.4, with new worker-file hashes.
Manifest SHA-256: `72384edf213936bc93bf891dbc8729110ac9521d4cf2e8206179a22c81cb2898`.
The exact release-mode manual catalog passed with CFR24/B-frames, NTSC, VFR,
repeated ranges, one-frame joins, offset stereo audio and 60-second preview/final.
A separate 60-second 1920×1080 moving synthetic pattern passed the same final
application/Host path: 1800 decoded pictures, 2880000 effective audio samples per
channel, 25.702 s wall time, 171507712 B peak sampled group RSS, 627486319 B peak
logical owned files and 633491456 B peak allocated blocks. Whole-program decoded
original/final PSNR was 52.512757 dB. Originals and History/archive reopen/Undo/Redo
were verified without render replay. This is objective synthetic evidence, not
subjective perceptual approval or an arbitrary-source envelope.

The real synthetic aggregate-memory fault observed 623886336 B before abort:
87015424 B above the initial 536870912 B budget. Its measured maximum observation
duration was 15.565 ms and completed-sample interval 115.577 ms. These are observed
values, not guaranteed bounds. Exact 2-GiB accounting observation rejected an
owned sparse file plus retained names; a scaled real 4096-byte producer limit
also interrupted a partial native writer without changing the parent's limit.
136 Python and 142 Media tests passed, including closed RPC errors, retirement,
restart, mandatory pre-write refusal and cleanup ownership. Host172/UI157 passed.

`peakReservedBytes` is reservation capacity, not measured disk consumption;
unknown encoded outputs may reserve all remaining capacity then settle smaller.
These workloads give no measured reason to change the initial numeric budgets.
No new commercial value is adopted. Independent review, exact published-head CI,
current package and relevant native/human variants remain explicit gates.
