from __future__ import annotations

import subprocess
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Optional, Sequence


@dataclass
class ActiveJob:
    job_id: str
    cancelled: threading.Event = field(default_factory=threading.Event)
    process: Optional[subprocess.Popen[Any]] = None
    artifacts: dict[Path, bool] = field(default_factory=dict)


_LOCK = threading.RLock()
_ACTIVE: Optional[ActiveJob] = None


def begin_job(job_id: str) -> None:
    global _ACTIVE
    with _LOCK:
        if _ACTIVE is not None:
            raise RuntimeError(f"media worker is busy with job {_ACTIVE.job_id}")
        _ACTIVE = ActiveJob(job_id=job_id)


def active_job_id() -> Optional[str]:
    with _LOCK:
        return _ACTIVE.job_id if _ACTIVE else None


def is_cancelled(job_id: str) -> bool:
    with _LOCK:
        return bool(_ACTIVE and _ACTIVE.job_id == job_id and _ACTIVE.cancelled.is_set())


def register_artifacts(paths: Iterable[str]) -> None:
    with _LOCK:
        if _ACTIVE is None:
            return
        for raw in paths:
            if not raw or raw == "-" or raw.startswith("pipe:") or raw.startswith("-"):
                continue
            path = Path(raw).absolute()
            try:
                metadata = path.lstat()
            except FileNotFoundError:
                existed_before = False
            else:
                if path.is_symlink():
                    raise RuntimeError(f"media output path must not be a symlink: {path}")
                if not path.is_file():
                    raise RuntimeError(f"media output path must be a regular file or absent: {path}")
                existed_before = True
            _ACTIVE.artifacts.setdefault(path, existed_before)


def attach_process(process: subprocess.Popen[Any], artifact_paths: Iterable[str] = ()) -> None:
    with _LOCK:
        if _ACTIVE is None:
            raise RuntimeError("media subprocess started without an active job")
        _ACTIVE.process = process
        cancelled = _ACTIVE.cancelled.is_set()
    if cancelled:
        _terminate(process)


def detach_process(process: subprocess.Popen[Any]) -> None:
    with _LOCK:
        if _ACTIVE and _ACTIVE.process is process:
            _ACTIVE.process = None


def cancel(job_id: str) -> bool:
    with _LOCK:
        if _ACTIVE is None or _ACTIVE.job_id != job_id:
            return False
        _ACTIVE.cancelled.set()
        process = _ACTIVE.process
    if process is not None:
        _terminate(process)
    return True


def finish_job(job_id: str) -> bool:
    global _ACTIVE
    with _LOCK:
        if _ACTIVE is None or _ACTIVE.job_id != job_id:
            return False
        job = _ACTIVE
        _ACTIVE = None
    if job.process is not None and job.process.poll() is None:
        _terminate_and_reap(job.process)
    if job.cancelled.is_set():
        _cleanup_created_artifacts(job)
    return job.cancelled.is_set()


def run(
    args: Sequence[str],
    *,
    stdout: Any = None,
    stderr: Any = None,
    text: bool = False,
    timeout: Optional[float] = None,
    check: bool = False,
    artifact_paths: Iterable[str] = (),
    **kwargs: Any,
) -> subprocess.CompletedProcess[Any]:
    register_artifacts(artifact_paths)
    kwargs.setdefault("stdin", subprocess.DEVNULL)
    process = subprocess.Popen(list(args), stdout=stdout, stderr=stderr, text=text, **kwargs)
    attach_process(process, artifact_paths)
    try:
        try:
            output, errors = process.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            process.kill()
            output, errors = process.communicate()
            raise subprocess.TimeoutExpired(args, timeout, output=output, stderr=errors)
    finally:
        detach_process(process)
    completed = subprocess.CompletedProcess(list(args), process.returncode, output, errors)
    if check and completed.returncode:
        raise subprocess.CalledProcessError(completed.returncode, args, output=output, stderr=errors)
    return completed


def popen(args: Sequence[str], *, artifact_paths: Iterable[str] = (), **kwargs: Any) -> subprocess.Popen[Any]:
    register_artifacts(artifact_paths)
    kwargs.setdefault("stdin", subprocess.DEVNULL)
    process = subprocess.Popen(list(args), **kwargs)
    attach_process(process, artifact_paths)
    return process


def _terminate(process: subprocess.Popen[Any]) -> None:
    if process.poll() is not None:
        return
    try:
        process.terminate()
    except OSError:
        return

    def force_kill() -> None:
        if process.poll() is None:
            try:
                process.kill()
            except OSError:
                pass

    timer = threading.Timer(2.0, force_kill)
    timer.daemon = True
    timer.start()


def _terminate_and_reap(process: subprocess.Popen[Any]) -> None:
    _terminate(process)
    try:
        process.wait(timeout=3.0)
    except subprocess.TimeoutExpired:
        try:
            process.kill()
        except OSError:
            pass
        process.wait(timeout=1.0)


def _cleanup_created_artifacts(job: ActiveJob) -> None:
    for path, existed_before in job.artifacts.items():
        if existed_before:
            continue
        try:
            if path.is_file() or path.is_symlink():
                path.unlink()
        except OSError:
            pass
