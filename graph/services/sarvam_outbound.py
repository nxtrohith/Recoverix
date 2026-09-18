"""
Sarvam Instant Outbound client for driver phone calls.

Uses Sarvam Conversations Instant Outbound API:
  POST https://apps.sarvam.ai/api/outbounds/v1/orgs/{org}/workspaces/{ws}/outbounds

Auth header: X-API-Key (not Bearer).
Falls back gracefully when required config is missing.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

logger = logging.getLogger(__name__)

_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_ROOT / ".env")

SARVAM_OUTBOUND_BASE = "https://apps.sarvam.ai/api/outbounds"

ALLOWED_LANGUAGES = frozenset(
    {
        "Bengali",
        "Gujarati",
        "Kannada",
        "Malayalam",
        "Tamil",
        "Telugu",
        "Punjabi",
        "Sanskrit",
        "Odia",
        "Marathi",
        "Hindi",
        "English",
        "Assamese",
    }
)


@dataclass
class SarvamOutboundConfig:
    api_key: str
    org_id: str
    workspace_id: str
    app_id: str
    app_version: int
    connection_id: str
    agent_phone_number: str
    default_language: str

    @property
    def ready(self) -> bool:
        return bool(
            self.api_key
            and self.org_id
            and self.workspace_id
            and self.app_id
            and self.connection_id
            and self.agent_phone_number
        )

    @property
    def missing(self) -> list[str]:
        missing: list[str] = []
        if not self.api_key:
            missing.append("SARVAM_API_KEY")
        if not self.org_id:
            missing.append("SARVAM_ORG_ID")
        if not self.workspace_id:
            missing.append("SARVAM_WORKSPACE_ID")
        if not self.app_id:
            missing.append("SARVAM_APP_ID")
        if not self.connection_id:
            missing.append("SARVAM_CONNECTION_ID")
        if not self.agent_phone_number:
            missing.append("SARVAM_AGENT_PHONE_NUMBER")
        return missing


@dataclass
class SarvamCallResult:
    ok: bool
    attempt_id: str | None
    detail: str
    status_code: int | None = None
    raw: dict[str, Any] | None = None


def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


def load_sarvam_outbound_config() -> SarvamOutboundConfig:
    """Load Instant Outbound config from env (reload .env each call for hackathon ergonomics)."""
    load_dotenv(_ROOT / ".env", override=False)
    version_raw = _env("SARVAM_APP_VERSION", "1") or "1"
    try:
        app_version = int(version_raw)
    except ValueError:
        app_version = 1

    language = _env("SARVAM_DEFAULT_LANGUAGE", "English") or "English"
    if language not in ALLOWED_LANGUAGES:
        # Accept common aliases like "en" / "hi-IN"
        aliases = {
            "en": "English",
            "en-in": "English",
            "english": "English",
            "hi": "Hindi",
            "hi-in": "Hindi",
            "hindi": "Hindi",
            "te": "Telugu",
            "te-in": "Telugu",
            "telugu": "Telugu",
            "ta": "Tamil",
            "ta-in": "Tamil",
            "tamil": "Tamil",
        }
        language = aliases.get(language.lower(), "English")

    return SarvamOutboundConfig(
        api_key=_env("SARVAM_API_KEY"),
        org_id=_env("SARVAM_ORG_ID"),
        workspace_id=_env("SARVAM_WORKSPACE_ID"),
        app_id=_env("SARVAM_APP_ID"),
        app_version=app_version,
        connection_id=_env("SARVAM_CONNECTION_ID"),
        agent_phone_number=_env("SARVAM_AGENT_PHONE_NUMBER"),
        default_language=language,
    )


def place_instant_outbound_call(
    *,
    user_phone_number: str,
    initial_bot_message: str,
    language: str | None = None,
    agent_variables: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
    timeout_sec: float = 30.0,
) -> SarvamCallResult:
    """
    Place a Sarvam Instant Outbound call.

    Returns ok=False (does not raise) when config/phone is missing or the API errors,
    so recovery workflow can continue with a log fallback.
    """
    config = load_sarvam_outbound_config()
    phone = (user_phone_number or "").strip()
    if not phone:
        return SarvamCallResult(
            ok=False,
            attempt_id=None,
            detail="No driver phone number (set vehicle.phone or SARVAM_DEMO_DRIVER_PHONE)",
        )
    if not config.ready:
        missing = ", ".join(config.missing)
        return SarvamCallResult(
            ok=False,
            attempt_id=None,
            detail=f"Sarvam outbound not configured — missing: {missing}",
        )

    lang = (language or config.default_language).strip()
    if lang not in ALLOWED_LANGUAGES:
        lang = config.default_language

    url = (
        f"{SARVAM_OUTBOUND_BASE}/v1/orgs/{config.org_id}"
        f"/workspaces/{config.workspace_id}/outbounds"
    )
    payload: dict[str, Any] = {
        "app_config": {
            "app_id": config.app_id,
            "app_version": config.app_version,
            "connection_config": {
                "connection_id": config.connection_id,
                "agent_phone_number": config.agent_phone_number,
            },
            "app_overrides": {
                "initial_bot_message": initial_bot_message,
                "initial_language_name": lang,
            },
        },
        "user_config": {
            "user_phone_number": phone,
        },
    }
    if agent_variables:
        payload["app_config"]["agent_variables"] = agent_variables
    if metadata:
        payload["metadata"] = metadata

    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-API-Key": config.api_key,
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            raw_text = resp.read().decode("utf-8") or "{}"
            try:
                data = json.loads(raw_text)
            except json.JSONDecodeError:
                data = {"raw": raw_text}
            attempt_id = data.get("attempt_id") if isinstance(data, dict) else None
            return SarvamCallResult(
                ok=True,
                attempt_id=str(attempt_id) if attempt_id else None,
                detail="Sarvam outbound call placed",
                status_code=getattr(resp, "status", 200),
                raw=data if isinstance(data, dict) else None,
            )
    except urllib.error.HTTPError as err:
        err_body = err.read().decode("utf-8", errors="replace")
        logger.warning(
            "sarvam_outbound HTTP %s: %s",
            err.code,
            err_body[:500],
        )
        return SarvamCallResult(
            ok=False,
            attempt_id=None,
            detail=f"Sarvam outbound HTTP {err.code}: {err_body[:300]}",
            status_code=err.code,
        )
    except Exception as err:  # noqa: BLE001 — keep recovery flow alive
        logger.warning("sarvam_outbound failed: %s", err)
        return SarvamCallResult(
            ok=False,
            attempt_id=None,
            detail=f"Sarvam outbound error: {err}",
        )
