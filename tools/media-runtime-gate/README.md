# Media Runtime coordinated-gate laboratory

This directory contains bounded, synthetic-media experiments for the proposed
Media Runtime coordinated plan. It is not a production package, is not imported
by CEVRA, and never accepts an arbitrary filtergraph.

The runner creates all media beneath an explicit owner-scoped output directory.
It records command identity, fixture hashes, wall/CPU time, peak child RSS,
output sizes, probe results, decoded timing evidence, and PASS/WARN/FAIL/NOT RUN
classifications in `results.json`.

## Run

```sh
python3 tools/media-runtime-gate/run_lab.py \
  --ffmpeg /absolute/path/to/ffmpeg \
  --ffprobe /absolute/path/to/ffprobe \
  --output-dir /owner/scoped/scratch/media-runtime-gate
```

The current CEVRA release-runtime build should be preferred. If another binary
is supplied, the report labels it as a laboratory binary and must not be used to
claim release-runtime parity.

The experiments are intentionally short. They cover:

- sequential A/V assembly versus a fixed two-input J-cut prototype;
- decoded tone-transition timing and output duration;
- video elementary-stream identity across `-c:v copy` audio mux;
- SDR, PQ, HLG, rotation, and variable-frame-rate probe evidence;
- output-exists, cancellation/partial-output, and permission-failure behavior;
- availability of the `zscale`, `tonemap`, and platform H.264 candidates.

Synthetic PQ/HLG ramps carry deliberate 10-bit signal code ramps and explicit
transfer/color tags. They are useful for metadata and decoded-signal checks, but
they are not substitutes for licensed/reference HDR footage or human visual
acceptance.

