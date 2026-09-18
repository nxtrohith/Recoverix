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
import re
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


def normalize_phone_number(phone: str) -> str:
    """
    Normalize phone number to E.164 format.
    E.g. '+91 77806 45727', '7780645727', '07780645727' -> '+917780645727'
    """
    if not phone:
        raise ValueError("Phone number cannot be empty")

    cleaned = re.sub(r"[\s\-\(\)\.]", "", str(phone).strip())
    if not cleaned:
        raise ValueError("Phone number contains no digits")

    if cleaned.startswith("+"):
        digits = cleaned[1:]
        if not digits.isdigit() or len(digits) < 10 or len(digits) > 15:
            raise ValueError(f"Invalid international phone number: {phone}")
        return cleaned

    if cleaned.startswith("00"):
        digits = cleaned[2:]
        if not digits.isdigit() or len(digits) < 10:
            raise ValueError(f"Invalid international phone number: {phone}")
        return f"+{digits}"

    # 10 digit Indian number without country code
    if len(cleaned) == 10 and cleaned.isdigit():
        return f"+91{cleaned}"

    # 11 digit Indian number starting with 0
    if len(cleaned) == 11 and cleaned.startswith("0") and cleaned[1:].isdigit():
        return f"+91{cleaned[1:]}"

    # 12 digit Indian number starting with 91
    if len(cleaned) == 12 and cleaned.startswith("91") and cleaned.isdigit():
        return f"+{cleaned}"

    # General fallback if 10-15 digits
    if cleaned.isdigit() and 10 <= len(cleaned) <= 15:
        return f"+{cleaned}"

    raise ValueError(f"Cannot normalize phone number to E.164: {phone}")


def mask_phone(phone: str) -> str:
    """Mask phone number for safe logging (e.g. +91778****727)."""
    clean = str(phone).strip()
    if len(clean) > 7:
        return clean[:5] + "****" + clean[-3:]
    return clean


def build_telugu_recovery_message(
    *,
    shipment_id: str,
    pickup_hub: str,
    destination_hub: str,
    driver_name: str | None = None,
) -> str:
    """
    Build natural Telugu voice opening line for recovery call.
    Dynamically includes shipment ID, pickup hub, and final destination.
    """
    greeting = f"నమస్కారం {driver_name} గారు." if driver_name else "నమస్కారం."
    return (
        f"{greeting} మీకు ఒక ముఖ్యమైన రికవరీ అసైన్మెంట్ ఉంది. "
        f"షిప్మెంట్ {shipment_id} తప్పు హబ్లో ఉన్నట్లు గుర్తించబడింది. "
        f"మీరు {pickup_hub} కి వెళ్లి ఆ షిప్మెంట్ను తీసుకుని {destination_hub} కి తరలించాలి. "
        f"దయచేసి ఈ అసైన్మెంట్ను నిర్ధారించండి."
    )


def build_telugu_test_message(shipment_id: str = "SHP-TEST-001") -> str:
    """Build short Telugu voice opening line for test call endpoint."""
    return (
        f"నమస్కారం. ఇది సర్వం వాయిస్ ఏజెంట్ టెస్ట్ కాల్. "
        f"షిప్మెంట్ {shipment_id} రికవరీ సిస్టమ్ పరీక్ష విజయవంతంగా ప్రారంభించబడింది. "
        f"ధన్యవాదాలు."
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

    language = _env("SARVAM_DEFAULT_LANGUAGE", "Telugu") or "Telugu"
    if language not in ALLOWED_LANGUAGES:
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
        language = aliases.get(language.lower(), "Telugu")

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
    Returns SarvamCallResult (does not raise).
    """
    config = load_sarvam_outbound_config()
    raw_phone = (user_phone_number or "").strip()
    if not raw_phone:
        return SarvamCallResult(
            ok=False,
            attempt_id=None,
            detail="No driver phone number provided",
        )

    try:
        phone = normalize_phone_number(raw_phone)
    except ValueError as err:
        return SarvamCallResult(
            ok=False,
            attempt_id=None,
            detail=f"Invalid phone number format: {err}",
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
            attempt_id = (
                data.get("attempt_id")
                or data.get("call_id")
                or data.get("id")
                if isinstance(data, dict)
                else None
            )
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
    except Exception as err:
        logger.warning("sarvam_outbound failed: %s", err)
        return SarvamCallResult(
            ok=False,
            attempt_id=None,
            detail=f"Sarvam outbound error: {err}",
        )


def call_driver(
    *,
    driver_phone: str,
    shipment_id: str,
    pickup_hub: str,
    destination_hub: str,
    driver_name: str | None = None,
    language: str = "Telugu",
    is_test: bool = False,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Clean service function to place an outbound phone call to a driver via Sarvam.

    Responsibilities:
      - Normalizes phone number to E.164.
      - Validates that the number is usable.
      - Builds recovery call context dynamically in Telugu (or test message).
      - Triggers Sarvam Voice Agent outbound calling.
      - Logs progress safely with masked phone number and no exposed credentials.
      - Returns structured status:
        { "success": bool, "call_id": str | None, "status": str, "error": str | None, "phone": str, "message": str }
    """
    raw_phone = (driver_phone or "").strip()
    logger.info("[SARVAM] call requested: shipment_id=%s, raw_phone=%s", shipment_id, mask_phone(raw_phone))

    try:
        norm_phone = normalize_phone_number(raw_phone)
    except ValueError as val_err:
        err_msg = f"Invalid driver phone number: {val_err}"
        logger.warning("[SARVAM] call failed: %s", err_msg)
        return {
            "success": False,
            "call_id": None,
            "status": "failed",
            "error": err_msg,
            "phone": raw_phone,
            "message": "",
            "detail": err_msg,
        }

    logger.info("[SARVAM] driver phone resolved: %s", mask_phone(norm_phone))

    if is_test:
        bot_message = build_telugu_test_message(shipment_id=shipment_id)
    else:
        bot_message = build_telugu_recovery_message(
            shipment_id=shipment_id,
            pickup_hub=pickup_hub,
            destination_hub=destination_hub,
            driver_name=driver_name,
        )

    call_meta = {
        "shipmentId": str(shipment_id),
        "pickupHub": str(pickup_hub),
        "destinationHub": str(destination_hub),
        "driverName": str(driver_name or ""),
        "isTest": str(is_test),
        **(metadata or {}),
    }

    result = place_instant_outbound_call(
        user_phone_number=norm_phone,
        initial_bot_message=bot_message,
        language=language,
        agent_variables=None,
        metadata=call_meta,
    )

    if result.ok:
        logger.info(
            "[SARVAM] outbound call initiated: call_id=%s, phone=%s",
            result.attempt_id,
            mask_phone(norm_phone),
        )
        return {
            "success": True,
            "call_id": result.attempt_id,
            "status": "initiated",
            "error": None,
            "phone": norm_phone,
            "message": bot_message,
            "detail": result.detail,
            "raw": result.raw,
        }

    logger.warning(
        "[SARVAM] call failed: %s (phone=%s)",
        result.detail,
        mask_phone(norm_phone),
    )
    return {
        "success": False,
        "call_id": None,
        "status": "failed",
        "error": result.detail,
        "phone": norm_phone,
        "message": bot_message,
        "detail": result.detail,
    }


def get_outbound_call_status(call_id: str) -> dict[str, Any]:
    """Query Sarvam outbound attempt status by call/attempt ID."""
    if not call_id:
        return {"ok": False, "status": "unknown", "error": "No call ID provided"}

    config = load_sarvam_outbound_config()
    if not config.ready:
        return {"ok": False, "status": "unknown", "error": "Sarvam not configured"}

    url = (
        f"{SARVAM_OUTBOUND_BASE}/v1/orgs/{config.org_id}"
        f"/workspaces/{config.workspace_id}/outbounds/{call_id}"
    )
    req = urllib.request.Request(
        url,
        method="GET",
        headers={
            "Accept": "application/json",
            "X-API-Key": config.api_key,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10.0) as resp:
            data = json.loads(resp.read().decode("utf-8") or "{}")
            call_status = data.get("status") or data.get("state") or "in_progress"
            return {
                "ok": True,
                "call_id": call_id,
                "status": str(call_status).lower(),
                "data": data,
            }
    except urllib.error.HTTPError as err:
        return {
            "ok": False,
            "call_id": call_id,
            "status": "unknown",
            "error": f"HTTP {err.code}: {err.reason}",
        }
    except Exception as err:
        return {
            "ok": False,
            "call_id": call_id,
            "status": "unknown",
            "error": str(err),
        }

