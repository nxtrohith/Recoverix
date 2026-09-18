"""
Driver communication integration point.

Places Sarvam Instant Outbound phone calls when configured; otherwise logs
the message (hackathon-safe fallback).

Two call kinds:
  - late_detection  → current/wrong vehicle driver (exception already outbound)
  - recovery_assign → recovery vehicle driver (after Assign)

Scripts are env-configurable:
  SARVAM_SCRIPT_LATE_DETECTION
  SARVAM_SCRIPT_RECOVERY_ASSIGN

Placeholders: {tracking} {shipment_id} {pickup_hub} {destination} {route}
              {vehicle_number} {required_action}
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv

from graph.services.sarvam_outbound import place_instant_outbound_call

logger = logging.getLogger(__name__)

_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_ROOT / ".env")

CallKind = Literal["late_detection", "recovery_assign"]

DEFAULT_SCRIPT_LATE_DETECTION = (
    "Hello, this is the SH-205 logistics recovery desk. "
    "Shipment {tracking} was detected on your vehicle {vehicle_number} but is not "
    "supposed to be on this route. The package appears outbound toward the wrong "
    "destination. Please confirm you have the shipment and be ready for recovery "
    "pickup instructions. Current hub context: {pickup_hub}. Destination on file: "
    "{destination}."
)

DEFAULT_SCRIPT_RECOVERY_ASSIGN = (
    "Hello, this is the SH-205 logistics recovery desk. "
    "Please pick up misplaced shipment {tracking} from {pickup_hub} and carry it "
    "toward {destination}. Recovery route: {route}. "
    "Required action: {required_action}."
)

DEFAULT_REQUIRED_ACTION = (
    "Retrieve the misplaced shipment from the recovery node and carry it "
    "using the selected piggyback movement"
)


@dataclass
class DriverNotificationResult:
    """Result of a driver notification / call attempt."""

    vehicle_id: str
    message: str
    channel: str
    delivered: bool
    sent_at: str
    detail: str | None = None
    attempt_id: str | None = None
    call_kind: str | None = None
    phone: str | None = None
    language: str | None = None
    simulated: bool = True


def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def resolve_driver_phone(
    *,
    vehicle_doc: dict[str, Any] | None = None,
    explicit_phone: str | None = None,
) -> str | None:
    """
    Resolve dial number: explicit → vehicle fields → SARVAM_DEMO_DRIVER_PHONE.
    Never hardcode a production number in source.
    """
    if explicit_phone and str(explicit_phone).strip():
        return str(explicit_phone).strip()

    if vehicle_doc:
        for key in ("phone", "driverPhone", "contactPhone", "mobile", "phoneNumber"):
            val = vehicle_doc.get(key)
            if val and str(val).strip():
                return str(val).strip()

    demo = _env("SARVAM_DEMO_DRIVER_PHONE")
    return demo or None


def _script_template(kind: CallKind) -> str:
    if kind == "late_detection":
        return (
            _env("SARVAM_SCRIPT_LATE_DETECTION")
            or DEFAULT_SCRIPT_LATE_DETECTION
        )
    return (
        _env("SARVAM_SCRIPT_RECOVERY_ASSIGN")
        or DEFAULT_SCRIPT_RECOVERY_ASSIGN
    )


def render_driver_script(
    kind: CallKind,
    *,
    shipment_tracking: str = "",
    shipment_id: str = "",
    pickup_hub: str | None = None,
    destination: str | None = None,
    recovery_route: list[str] | None = None,
    vehicle_number: str | None = None,
    required_action: str | None = None,
) -> str:
    """Render an env-configurable call script with safe placeholder substitution."""
    route = " → ".join(recovery_route) if recovery_route else "TBD"
    values = {
        "tracking": shipment_tracking or shipment_id or "unknown",
        "shipment_id": shipment_id or "unknown",
        "pickup_hub": pickup_hub or "unknown",
        "destination": destination or "unknown",
        "route": route,
        "vehicle_number": vehicle_number or "unknown",
        "required_action": required_action or DEFAULT_REQUIRED_ACTION,
    }
    template = _script_template(kind)
    try:
        return template.format(**values)
    except (KeyError, ValueError):
        # If operator puts bad braces in env script, fall back to defaults.
        fallback = (
            DEFAULT_SCRIPT_LATE_DETECTION
            if kind == "late_detection"
            else DEFAULT_SCRIPT_RECOVERY_ASSIGN
        )
        return fallback.format(**values)


def build_recovery_assignment_message(
    *,
    shipment_tracking: str,
    shipment_id: str,
    pickup_hub: str | None,
    destination: str | None,
    recovery_route: list[str] | None,
    required_action: str = DEFAULT_REQUIRED_ACTION,
    vehicle_number: str | None = None,
) -> str:
    """Compose recovery-assign driver message (also used as Sarvam opening line)."""
    return render_driver_script(
        "recovery_assign",
        shipment_tracking=shipment_tracking,
        shipment_id=shipment_id,
        pickup_hub=pickup_hub,
        destination=destination,
        recovery_route=recovery_route,
        vehicle_number=vehicle_number,
        required_action=required_action,
    )


def build_late_detection_message(
    *,
    shipment_tracking: str,
    shipment_id: str,
    pickup_hub: str | None,
    destination: str | None,
    vehicle_number: str | None = None,
) -> str:
    """Compose late-detection / wrong-vehicle driver message."""
    return render_driver_script(
        "late_detection",
        shipment_tracking=shipment_tracking,
        shipment_id=shipment_id,
        pickup_hub=pickup_hub,
        destination=destination,
        vehicle_number=vehicle_number,
    )


def send_driver_notification(
    vehicle_id: str,
    message: str,
    *,
    metadata: dict[str, Any] | None = None,
    call_kind: CallKind = "recovery_assign",
    phone: str | None = None,
    vehicle_doc: dict[str, Any] | None = None,
    language: str | None = None,
) -> DriverNotificationResult:
    """
    Notify a driver via Sarvam phone call when configured; otherwise log.

    Never raises — recovery workflow must continue even if telephony fails.
    """
    sent_at = _now_iso()
    meta = dict(metadata or {})
    dial = resolve_driver_phone(vehicle_doc=vehicle_doc, explicit_phone=phone)
    lang = (language or _env("SARVAM_DEFAULT_LANGUAGE") or "English").strip()

    # Prefer Sarvam when we have a phone to dial.
    # Do not send arbitrary agent_variables — Sarvam agents reject unknown keys (HTTP 422).
    # Opening line + language overrides carry the recovery context.
    if dial:
        call = place_instant_outbound_call(
            user_phone_number=dial,
            initial_bot_message=message,
            language=lang,
            agent_variables=None,
            metadata={
                "vehicleId": str(vehicle_id),
                "callKind": call_kind,
                **{k: str(v) for k, v in meta.items() if v is not None},
            },
        )
        if call.ok:
            logger.info(
                "driver_call kind=%s vehicle=%s attempt_id=%s phone=%s",
                call_kind,
                vehicle_id,
                call.attempt_id,
                dial,
            )
            return DriverNotificationResult(
                vehicle_id=str(vehicle_id),
                message=message,
                channel="sarvam_voice",
                delivered=True,
                sent_at=sent_at,
                detail=call.detail,
                attempt_id=call.attempt_id,
                call_kind=call_kind,
                phone=dial,
                language=lang,
                simulated=False,
            )
        # Fall through to log stub with Sarvam error detail
        logger.warning(
            "driver_call_failed kind=%s vehicle=%s detail=%s — falling back to log",
            call_kind,
            vehicle_id,
            call.detail,
        )
        fallback_detail = call.detail
    else:
        fallback_detail = "No driver phone — logged locally (set SARVAM_DEMO_DRIVER_PHONE)"

    logger.info(
        "driver_notification vehicle_id=%s channel=log kind=%s message=%r meta=%s",
        vehicle_id,
        call_kind,
        message,
        meta,
    )
    print(
        f"[driver_communication] NOTIFY kind={call_kind} vehicle={vehicle_id}\n{message}",
        flush=True,
    )
    return DriverNotificationResult(
        vehicle_id=str(vehicle_id),
        message=message,
        channel="log",
        delivered=True,
        sent_at=sent_at,
        detail=fallback_detail,
        attempt_id=None,
        call_kind=call_kind,
        phone=dial,
        language=lang,
        simulated=True,
    )
