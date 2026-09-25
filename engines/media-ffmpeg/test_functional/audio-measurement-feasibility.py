#!/usr/bin/env python3
"""Bounded native-filter characterization, not a product measurement endpoint.

Run with an explicit binary; development and managed execution are separate.
Only fixed synthetic expressions below are accepted. No generated media retained.
"""
import argparse
import json
import math
import subprocess
import threading
import time


def characterize(binary, expression, duration, filters, rate=48000):
    command = [binary, "-hide_banner", "-nostdin", "-nostats", "-v", "error",
               "-filter_threads", "1", "-f", "lavfi", "-i",
               f"aevalsrc={expression}:s={rate}:d={duration}", "-af", filters,
               "-c:a", "pcm_f64le", "-f", "null", "-"]
    started = time.monotonic()
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    timer = threading.Timer(30, process.kill)
    timer.start()
    latest = {}
    lines = 0
    try:
        while True:
            line = process.stdout.readline(4097)
            if not line:
                break
            if len(line) > 4096:
                raise RuntimeError("oversized metadata line")
            lines += 1
            text = line.decode("ascii").strip()
            if text.startswith("lavfi.") and "=" in text:
                key, value = text.split("=", 1)
                latest[key] = value
                if len(latest) > 96:
                    raise RuntimeError("unexpected metadata cardinality")
        if process.wait() != 0:
            raise RuntimeError("native experiment failed or timed out")
    finally:
        timer.cancel()
        if process.poll() is None:
            process.kill()
        process.wait()
        process.stdout.close()
    return {"metadata": latest, "linesReduced": lines,
            "wallSeconds": round(time.monotonic() - started, 6)}


def run(binary):
    stats = ("astats=metadata=1:reset=0:measure_perchannel=Peak_level+RMS_level"
             ":measure_overall=Number_of_samples,ametadata=print:file=-")
    original = "aformat=sample_fmts=dbl,ebur128=metadata=1:peak=true:dualmono=false," + stats
    oversampled = "aformat=sample_fmts=dbl,aresample=192000:resampler=swr," + stats
    cases = {}
    for name, expression, duration in [
        ("headroom", "2*sin(2*PI*1000*t)", 4),
        ("silence", "0", 4),
        ("below-gate", "0.00001*sin(2*PI*1000*t)", 4),
        ("short", "0.5*sin(2*PI*1000*t)", 0.05),
        ("tail-impulse", "if(eq(n\\,4799)\\,1\\,0)", 0.1),
        ("intersample", "0.8*sin(2*PI*12000*t+PI/4)", 4),
    ]:
        cases[name] = characterize(binary, expression, duration, original)
    peak = float(cases["headroom"]["metadata"]["lavfi.astats.1.Peak_level"])
    rms = float(cases["headroom"]["metadata"]["lavfi.astats.1.RMS_level"])
    assert abs(peak - 20 * math.log10(2)) < 0.000002
    assert abs(rms - 20 * math.log10(math.sqrt(2))) < 0.000002
    assert cases["silence"]["metadata"]["lavfi.astats.1.RMS_level"] == "-inf"
    assert cases["below-gate"]["metadata"]["lavfi.r128.I"] == "-70.000"
    assert "lavfi.r128.I" not in cases["short"]["metadata"]
    # Characterize rather than bless the candidate's missing tail/precision.
    tail = cases["tail-impulse"]["metadata"]
    cases["native-drained-tail"] = characterize(binary, "if(eq(n\\,4799)\\,1\\,0)", 0.1, oversampled)
    drained = float(cases["native-drained-tail"]["metadata"]["lavfi.astats.1.Peak_level"])
    assert drained > -0.01, "native drain lost the unit tail impulse"
    summary = {
        "binaryVersion": subprocess.check_output([binary, "-version"], text=True).splitlines()[0],
        "status": "CHARACTERIZED",
        "ebur128TailPeakLinear": tail.get("lavfi.r128.true_peak"),
        "actualTailSamplePeakDb": tail["lavfi.astats.1.Peak_level"],
        "drainedOversampledTailPeakDb": drained,
        "limitations": ["ebur128 metadata rounds linear peaks to 0.001",
                        "absent short-window metadata is not a valid loudness value",
                        "-70 integrated and -120.691 short-term can be sentinels"],
        "cases": cases,
    }
    print(json.dumps(summary, sort_keys=True, allow_nan=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--ffmpeg", required=True)
    run(parser.parse_args().ffmpeg)
