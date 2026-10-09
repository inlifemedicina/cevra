from __future__ import annotations

import subprocess
import threading
import os
import signal
import sys
from contextlib import contextmanager
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
_FILE_BUDGET = threading.local()


class LogicalFileBudgetError(RuntimeError):
    """Closed resource failure; no native stderr or private path is exposed."""
    def __init__(self) -> None:
        super().__init__("MEDIA_RENDER_DISK_LIMIT")


def is_logical_file_budget_failure(error: BaseException) -> bool:
    cause, seen = error, set()
    while cause is not None and id(cause) not in seen:
        seen.add(id(cause))
        if isinstance(cause, LogicalFileBudgetError):
            return True
        cause = cause.__cause__
    return False


@dataclass
class NativeFileBudget:
    maximum_bytes: int
    directory: Path
    process: Optional[subprocess.Popen[Any]] = None

    def assert_not_exceeded(self) -> None:
        if self.process is not None and self.process.returncode == -signal.SIGXFSZ:
            raise LogicalFileBudgetError()


@contextmanager
def native_file_budget(maximum_bytes: int, directory: Path):
    """Thread-local scope; never set limits on the persistent multi-thread worker."""
    if os.name != "posix" or not isinstance(maximum_bytes, int) or isinstance(maximum_bytes, bool) or maximum_bytes < 1:
        raise RuntimeError("MEDIA_RENDER_RESOURCE_OBSERVATION_FAILED")
    scope = NativeFileBudget(maximum_bytes, directory)
    previous = getattr(_FILE_BUDGET, "scope", None)
    _FILE_BUDGET.scope = scope
    try:
        yield scope
    finally:
        _FILE_BUDGET.scope = previous


def _spawn(args: Sequence[str], **kwargs: Any) -> subprocess.Popen[Any]:
    scope = getattr(_FILE_BUDGET, "scope", None)
    command = list(args)
    # A caller-controlled FFREPORT would create an unregistered output file.
    supplied_environment = kwargs.pop("env", None)
    environment = dict(os.environ if supplied_environment is None else supplied_environment)
    environment.pop("FFREPORT", None)
    if scope is not None:
        environment["TMPDIR"] = str(scope.directory)
        environment["TMP"] = str(scope.directory)
        environment["TEMP"] = str(scope.directory)
        command = [sys.executable, "-I", "-B", str(Path(__file__).resolve()),
                   "--file-budget", str(scope.maximum_bytes), "--", *command]
    process = subprocess.Popen(command, env=environment, **kwargs)
    if scope is not None:
        scope.process = process
    return process


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


def check_cancelled() -> None:
    with _LOCK:
        cancelled = bool(_ACTIVE and _ACTIVE.cancelled.is_set())
    if cancelled:
        raise RuntimeError("media job cancelled")


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
    process = _spawn(args, stdout=stdout, stderr=stderr, text=text, **kwargs)
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
    process = _spawn(args, **kwargs)
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


def _exec_file_budget() -> None:
    """Internal exec-only entrypoint, retaining the job's PID/group and pipes."""
    import resource
    if len(sys.argv) < 5 or sys.argv[1] != "--file-budget" or sys.argv[3] != "--":
        raise RuntimeError("Invalid internal file budget invocation")
    limit = int(sys.argv[2])
    if limit < 1 or not Path(sys.argv[4]).is_absolute():
        raise RuntimeError("Invalid internal file budget invocation")
    _, inherited_hard = resource.getrlimit(resource.RLIMIT_FSIZE)
    if inherited_hard != resource.RLIM_INFINITY:
        limit = min(limit, inherited_hard)
    resource.setrlimit(resource.RLIMIT_FSIZE, (limit, limit))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    # Python ignores SIGXFSZ; native producers must receive the default action.
    signal.signal(signal.SIGXFSZ, signal.SIG_DFL)
    os.execv(sys.argv[4], sys.argv[4:])


if __name__ == "__main__":
    _exec_file_budget()
