"""Bounded line reduction using the existing single-active-job process owner."""
from __future__ import annotations

import subprocess
import threading
from typing import Callable, Sequence

import cevra_job_control as jobs


def reduce_lines(command: Sequence[str], consume: Callable[[str], None], *, timeout: float | None,
                 maximum_line_bytes: int = 4096) -> None:
    job_id = jobs.active_job_id()
    if job_id is None:
        raise RuntimeError("measurement requires an active media job")
    if jobs.is_cancelled(job_id):
        raise RuntimeError("measurement cancelled")
    process = jobs.popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    expired = threading.Event()

    def expire() -> None:
        expired.set()
        if process.poll() is None:
            try:
                process.kill()
            except ProcessLookupError:
                pass

    timer = threading.Timer(timeout, expire) if timeout is not None else None
    if timer is not None:
        timer.daemon = True
        timer.start()
    try:
        assert process.stdout is not None
        while True:
            raw = process.stdout.readline(maximum_line_bytes + 1)
            if not raw:
                break
            if len(raw) > maximum_line_bytes:
                raise RuntimeError("measurement metadata line exceeds collection boundary")
            if jobs.is_cancelled(job_id):
                raise RuntimeError("measurement cancelled")
            consume(raw.decode("utf-8", errors="strict").rstrip("\r\n"))
        code = process.wait()
        if expired.is_set():
            raise TimeoutError("measurement process exceeded its execution timeout")
        if jobs.is_cancelled(job_id):
            raise RuntimeError("measurement cancelled")
        if code != 0:
            raise RuntimeError(f"measurement process failed (exit {code}); no valid report")
    finally:
        if timer is not None:
            timer.cancel()
        if process.poll() is None:
            process.kill()
        process.wait(timeout=3)
        if process.stdout is not None:
            process.stdout.close()
        jobs.detach_process(process)
