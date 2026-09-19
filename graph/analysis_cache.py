"""
In-memory recovery analysis cache for demo / jury responsiveness.

The full pipeline (context → candidates → score → optional TypeSafe Jev →
persist) is expensive. For a stable demo network, caching the last successful
analysis per shipment makes re-open / re-analyze / explanationTrace backfill
near-instant.

Invalidate on shipment state changes (simulate / assign / pickup / resolve).
Disable with RECOVERY_ANALYSIS_CACHE_TTL_SEC=0.
"""

from __future__ import annotations

import copy
import os
import time
from threading import Lock
from typing import Any


_lock = Lock()
# key → (expires_at_monotonic, payload)
_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def _ttl_seconds() -> float:
    raw = (os.getenv("RECOVERY_ANALYSIS_CACHE_TTL_SEC") or "600").strip()
    try:
        return max(0.0, float(raw))
    except ValueError:
        return 600.0


def cache_keys_for_result(result: dict[str, Any], identifier: str | None) -> list[str]:
    """Stable keys so ObjectId and trackingNumber lookups share one entry."""
    keys: list[str] = []
    ship = result.get("shipment") or {}
    for value in (
        identifier,
        ship.get("id"),
        ship.get("trackingNumber"),
    ):
        if value is None:
            continue
        text = str(value).strip()
        if text and text not in keys:
            keys.append(text)
    return keys


def get_cached_analysis(identifier: str) -> dict[str, Any] | None:
    """Return a deep copy of a non-expired cached analysis, or None."""
    key = (identifier or "").strip()
    if not key or _ttl_seconds() <= 0:
        return None
    now = time.monotonic()
    with _lock:
        entry = _cache.get(key)
        if entry is None:
            return None
        expires_at, payload = entry
        if expires_at <= now:
            _cache.pop(key, None)
            return None
        return copy.deepcopy(payload)


def put_cached_analysis(
    result: dict[str, Any],
    *,
    identifier: str | None = None,
) -> None:
    """Store analysis under all known shipment identifiers."""
    ttl = _ttl_seconds()
    if ttl <= 0 or not isinstance(result, dict):
        return
    keys = cache_keys_for_result(result, identifier)
    if not keys:
        return
    expires_at = time.monotonic() + ttl
    payload = copy.deepcopy(result)
    with _lock:
        for key in keys:
            _cache[key] = (expires_at, payload)


def invalidate_analysis_cache(identifier: str | None = None) -> None:
    """
    Drop cached analyses.

    When ``identifier`` is set, remove that key and any sibling keys that share
    the same cached payload. When omitted, clear the entire cache.
    """
    key = (identifier or "").strip() if identifier is not None else ""
    with _lock:
        if not key:
            _cache.clear()
            return
        entry = _cache.pop(key, None)
        if entry is None:
            return
        payload = entry[1]
        siblings = cache_keys_for_result(payload, key)
        for sibling in siblings:
            _cache.pop(sibling, None)


def analysis_cache_status() -> dict[str, Any]:
    """Debug / health helper."""
    ttl = _ttl_seconds()
    now = time.monotonic()
    with _lock:
        alive = sum(1 for exp, _ in _cache.values() if exp > now)
        return {
            "enabled": ttl > 0,
            "ttlSeconds": ttl,
            "entries": alive,
        }
