"""Worker-local, disposable preview bytes. No paths, originals or durable state.

The Host's existing aggregate RSS lease includes committed entries, pending
admission and bounded read/write buffers. This accounting is a retention limit,
not a physical allocator or instantaneous process-memory guarantee.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import stat
import sys
import threading
from collections import OrderedDict
from pathlib import Path
from typing import NamedTuple

import cevra_job_control as jobs

MAX_BYTES = 32 * 1024 * 1024
MAX_ENTRIES = 64
MAX_SEGMENT_BYTES = 8 * 1024 * 1024
BASE_BYTES = 4096


def encode(value: dict) -> bytes:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    if len(encoded) > 64 * 1024:
        raise ValueError("preview segment identity/receipt exceeds its bound")
    return encoded


class _Entry(NamedTuple):
    key: bytes
    payload: bytes
    digest: str
    receipt: bytes
    seal: str


class SegmentCache:
    def __init__(self, *, maximum_bytes: int = MAX_BYTES, maximum_entries: int = MAX_ENTRIES):
        if type(maximum_bytes) is not int or not 0 <= maximum_bytes <= MAX_BYTES or type(maximum_entries) is not int or not 0 <= maximum_entries <= MAX_ENTRIES:
            raise ValueError("invalid internal preview segment cache limits")
        self.maximum_bytes, self.maximum_entries = maximum_bytes, maximum_entries
        self._entries: OrderedDict[bytes, _Entry] = OrderedDict()
        self._pending: OrderedDict[bytes, _Entry] = OrderedDict()
        # Charges remain separate from the corruptible entry under test.
        self._charges: dict[bytes, int] = {}
        self._secret = os.urandom(32)
        self._lock = threading.RLock()
        self._epoch = 0
        self._stats = dict(hits=0, misses=0, corruptions=0, evictions=0, bypasses=0)

    def clear(self) -> None:
        with self._lock:
            self._entries.clear(); self._pending.clear(); self._charges.clear()
            self._epoch += 1

    def state(self) -> dict:
        with self._lock:
            return {"entries": len(self._entries), "pendingEntries": len(self._pending),
                    "retainedBytes": BASE_BYTES + sum(self._charges.values()) if self._charges else 0,
                    "maximumBytes": self.maximum_bytes, "maximumEntries": self.maximum_entries,
                    **self._stats}

    def transaction(self) -> SegmentTransaction:
        with self._lock:
            if self._pending:
                raise RuntimeError("preview segment admission already pending")
            return SegmentTransaction(self, self._epoch)

    def _forget(self, key: bytes) -> None:
        self._entries.pop(key, None); self._pending.pop(key, None); self._charges.pop(key, None)

    def _seal(self, key: bytes, digest: str, receipt: bytes) -> str:
        seal = hmac.new(self._secret, digestmod=hashlib.sha256)
        for part in (key, digest.encode(), receipt):
            seal.update(len(part).to_bytes(8, "big")); seal.update(part)
        return seal.hexdigest()


class SegmentTransaction:
    def __init__(self, cache: SegmentCache, epoch: int):
        self.cache, self.epoch = cache, epoch
        self.keys: set[bytes] = set()

    def _current(self) -> None:
        jobs.check_cancelled()
        if self.cache._epoch != self.epoch:
            raise InterruptedError("preview segment cache generation retired")

    def get(self, key: bytes, receipt: dict) -> bytes | None:
        expected = encode(receipt)
        with self.cache._lock:
            self._current()
            entry = self.cache._entries.get(key)
            if entry is not None:
                try:
                    valid = (type(entry.payload) is bytes and 0 < len(entry.payload) <= MAX_SEGMENT_BYTES
                             and entry.key == key and entry.receipt == expected
                             and hashlib.sha256(entry.payload).hexdigest() == entry.digest
                             and hmac.compare_digest(entry.seal, self.cache._seal(key, entry.digest, expected)))
                except (AttributeError, TypeError, ValueError):
                    valid = False
                if valid:
                    self.cache._entries.move_to_end(key); self.cache._stats["hits"] += 1
                    return entry.payload
                self.cache._forget(key); self.cache._stats["corruptions"] += 1
            self.cache._stats["misses"] += 1
            return None

    def stage(self, key: bytes, path: Path, receipt: dict, *, expected_digest: str | None = None) -> None:
        encoded = encode(receipt)
        initial = path.lstat()
        if not stat.S_ISREG(initial.st_mode) or not 0 < initial.st_size <= MAX_SEGMENT_BYTES:
            return
        # Conservative container/key/seal/digest/receipt overhead; payload uses
        # immutable bytes and is never copied on a hit.
        charge = initial.st_size + sys.getsizeof(b"") + 2 * sys.getsizeof(key) + sys.getsizeof(encoded) + 1024
        cache = self.cache
        with cache._lock:
            self._current()
            if not cache.maximum_entries or charge + BASE_BYTES > cache.maximum_bytes:
                cache._stats["bypasses"] += 1; return
            cache._forget(key)
            while cache._entries and (len(cache._charges) >= cache.maximum_entries or BASE_BYTES + sum(cache._charges.values()) + charge > cache.maximum_bytes):
                cache._forget(next(iter(cache._entries))); cache._stats["evictions"] += 1
            if len(cache._charges) >= cache.maximum_entries or BASE_BYTES + sum(cache._charges.values()) + charge > cache.maximum_bytes:
                cache._stats["bypasses"] += 1; return
            cache._charges[key] = charge
        try:
            descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            with os.fdopen(descriptor, "rb") as handle:
                stamp = lambda value: (value.st_dev, value.st_ino, value.st_mode, value.st_size, value.st_mtime_ns, value.st_ctime_ns)
                if stamp(os.fstat(handle.fileno())) != stamp(initial):
                    raise RuntimeError("preview segment changed before admission")
                payload = handle.read(initial.st_size + 1)
                if len(payload) != initial.st_size or stamp(os.fstat(handle.fileno())) != stamp(initial) or stamp(path.lstat()) != stamp(initial):
                    raise RuntimeError("preview segment changed during admission")
            digest = hashlib.sha256(payload).hexdigest()
            if expected_digest is not None and digest != expected_digest:
                raise RuntimeError("preview segment changed after grid validation")
            entry = _Entry(key, payload, digest, encoded, cache._seal(key, digest, encoded))
            with cache._lock:
                self._current(); cache._pending[key] = entry; self.keys.add(key)
        except BaseException:
            with cache._lock:
                if cache._epoch == self.epoch: cache._forget(key)
            raise

    def commit(self) -> None:
        with self.cache._lock:
            self._current()
            for key in tuple(self.cache._pending):
                if key not in self.keys: continue
                entry = self.cache._pending.pop(key)
                self.cache._entries[key] = entry
            self.keys.clear()

    def abort(self) -> None:
        self.cache.clear(); self.keys.clear()


CACHE = SegmentCache()
