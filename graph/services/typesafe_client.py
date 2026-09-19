"""
Thin sync wrapper around TypeSafe System One (Jev).

Hard logistics rules stay in code; this client only asks typed questions when
``TYPESAFE_API_KEY`` is set and TypeSafe is enabled. Failures return ``None``
so the recovery pipeline can fall back to deterministic explanations.
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

_client: Any | None = None
_client_failed = False


def typesafe_enabled() -> bool:
    """True when a key is present and TYPESAFE_ENABLED is not false."""
    key = (os.getenv("TYPESAFE_API_KEY") or "").strip()
    if not key:
        return False
    flag = (os.getenv("TYPESAFE_ENABLED") or "true").strip().lower()
    return flag not in {"0", "false", "no", "off"}


def _get_client() -> Any | None:
    global _client, _client_failed
    if _client_failed:
        return None
    if _client is not None:
        return _client
    if not typesafe_enabled():
        return None
    try:
        from typesafe_sdk import TypeSafeClient

        model = (os.getenv("TYPESAFE_DEFAULT_MODEL") or "jev-latest").strip()
        _client = TypeSafeClient(model=model)
        return _client
    except Exception as exc:
        logger.warning("[TYPESAFE] client init failed: %s", exc)
        _client_failed = True
        return None


def ask_system_one(
    state: dict[str, Any] | str,
    questions: dict[str, Any],
    *,
    timeout: float = 8.0,
) -> Any | None:
    """
    Run a System One request. Returns the SDK response object, or ``None``.

    ``questions`` values should be Choice / Noul / Score instances (or raw
    dicts accepted by the SDK).
    """
    client = _get_client()
    if client is None:
        return None
    try:
        from typesafe_sdk import RetryPolicy

        return client.system_one(
            state,
            questions,
            retry=RetryPolicy(max_retries=1, backoff_max=0.3, timeout=timeout),
        )
    except Exception as exc:
        logger.warning("[TYPESAFE] system_one failed: %s", exc)
        return None


def judgment_from_choice(response: Any, question_id: str) -> dict[str, Any] | None:
    """Normalize a Choice answer into a JSON-safe judgment dict."""
    if response is None:
        return None
    try:
        answer = response.choices[question_id]
    except Exception:
        return None
    probs: dict[str, float] = {}
    try:
        dist = getattr(answer, "distribution", None) or getattr(
            answer, "probabilities", None
        )
        if isinstance(dist, dict):
            probs = {str(k): float(v) for k, v in dist.items()}
        elif dist is not None and hasattr(dist, "items"):
            probs = {str(k): float(v) for k, v in dist.items()}
    except Exception:
        probs = {}
    confidence = getattr(answer, "confidence", None)
    try:
        confidence_f = float(confidence) if confidence is not None else None
    except (TypeError, ValueError):
        confidence_f = None
    return {
        "questionId": question_id,
        "kind": "choice",
        "value": str(getattr(answer, "choice", answer)),
        "confidence": confidence_f,
        "probabilities": probs or None,
    }


def judgment_from_noul(response: Any, question_id: str) -> dict[str, Any] | None:
    if response is None:
        return None
    try:
        answer = response.nouls[question_id]
    except Exception:
        return None
    noul = getattr(answer, "noul", None)
    try:
        value = float(noul) if noul is not None else None
    except (TypeError, ValueError):
        value = None
    return {
        "questionId": question_id,
        "kind": "noul",
        "value": value,
        "confidence": None,
        "probabilities": None,
    }


def judgment_from_score(response: Any, question_id: str) -> dict[str, Any] | None:
    if response is None:
        return None
    try:
        answer = response.scores[question_id]
    except Exception:
        return None
    confidence = getattr(answer, "confidence", None)
    try:
        confidence_f = float(confidence) if confidence is not None else None
    except (TypeError, ValueError):
        confidence_f = None
    return {
        "questionId": question_id,
        "kind": "score",
        "value": getattr(answer, "score", None),
        "confidence": confidence_f,
        "probabilities": None,
    }
