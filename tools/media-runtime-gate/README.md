# Media Runtime coordinated-gate laboratory

This directory contains bounded, synthetic-media experiments for the proposed
Media Runtime coordinated plan. It is not a production package, is not imported
by CEVRA, and never accepts an arbitrary filtergraph.

The runner creates all media beneath an explicit owner-scoped output directory.
It records command identity, fixture hashes, wall/CPU time, peak child RSS,
output sizes, probe results, decoded timing evidence, and PASS/WARN/FAIL/NOT RUN
classifications in `results.json`.

The timing oracle uses machine-readable video flashes and audio clicks. It
decodes both output streams, compares their observed timestamps with explicit
source-to-timeline mappings, and reports the measured error against a tolerance
derived from one 30 fps frame interval plus one 48 kHz sample interval. The
intentionally wrong former B-picture mapping is a mandatory negative control.

## Run

```sh
python3 tools/media-runtime-gate/run_lab.py \
  --ffmpeg /absolute/path/to/ffmpeg \
  --ffprobe /absolute/path/to/ffprobe \
  --output-dir /owner/scoped/scratch/media-runtime-gate
```

Run the FFmpeg-independent classification, failure-injection and oracle
regressions separately:

```sh
python3 -m unittest discover -s tools/media-runtime-gate -p 'test_*.py' -v
```

The current CEVRA release-runtime build should be preferred. If another binary
is supplied, the report labels it as a laboratory binary and must not be used to
claim release-runtime parity.

The experiments are intentionally short. They cover:

- corrected A/V J-cut mapping plus a deliberately wrong negative control;
- decoded visual-flash/audio-click synchronization and unauthorized-overlap checks;
- a separate audio-only PCM prototype with trim, placement, gain, fade and resampling;
- a bounded 64-item audio-only workload and a separate A/V topology demonstration;
- video elementary-stream identity across `-c:v copy` audio mux;
- asserted SDR/PQ/HLG metadata, decode, rotation and actual VFR frame timestamps;
- output-exists, cancellation/partial-output and simulated permission/ENOSPC behavior;
- availability of the `zscale`, `tonemap`, and platform H.264 candidates.

`/usr/bin/time -lp` is used only on macOS. GNU `time -v` is used on Linux when
available. On other platforms the operations still run and wall time is
recorded, while unavailable CPU/RSS fields remain absent. Timeouts terminate
the owned process group/tree so a measurement wrapper cannot leave FFmpeg
running.

The mux experiment is evidence level A: a standalone FFmpeg laboratory
command. Its MPEG-4 Part 2 fixture is not in CEVRA's closed delivery matrix.
Exact pinned-binary, adapter/worker and Application-level mux evidence remain
separate and must not be inferred from this result.

Synthetic PQ/HLG ramps carry deliberate 10-bit signal code ramps and explicit
transfer/color tags. They are useful for metadata and decoded-signal checks, but
they are not substitutes for licensed/reference HDR footage or human visual
acceptance.
