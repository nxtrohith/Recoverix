"""
Driver communication integration point (hackathon-safe).

Abstraction for notifying a recovery vehicle's driver after assignment.
No telephony / SMS provider is wired in this step — messages are logged
and returned so a future voice/phone integration can plug in here.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class DriverNotificationResult:
    """Result of a driver notification attempt."""

    vehicle_id: str
    message: str
    channel: str
    delivered: bool
    sent_at: str
    detail: str | None = None


def build_recovery_assignment_message(
    *,
    shipment_tracking: str,
    shipment_id: str,
    pickup_hub: str | None,
    destination: str | None,
    recovery_route: list[str] | None,
    required_action: str = "Pick up misplaced shipment and complete recovery route",
) -> str:
    """Compose a concise driver-facing recovery assignment message."""
    route = " → ".join(recovery_route) if recovery_route else "TBD"
    return (
        "SHIPMENT RECOVERY ASSIGNMENT\n"
        f"Shipment requiring recovery: {shipment_tracking or shipment_id}\n"
        f"Pickup hub: {pickup_hub or 'unknown'}\n"
        f"Destination: {destination or 'unknown'}\n"
        f"Recovery route: {route}\n"
        f"Required action: {required_action}"
    )


def send_driver_notification(
    vehicle_id: str,
    message: str,
    *,
    metadata: dict[str, Any] | None = None,
) -> DriverNotificationResult:
    """
    Send (or stub) a driver notification.

    Hackathon behaviour: log the message and return a structured result.
    Replace the body of this function when a real phone/voice channel exists.
    Do not hardcode phone numbers here.
    """
    sent_at = datetime.now(tz=timezone.utc).isoformat()
    meta = metadata or {}
    logger.info(
        "driver_notification vehicle_id=%s channel=log message=%r meta=%s",
        vehicle_id,
        message,
        meta,
    )
    print(
        f"[driver_communication] NOTIFY vehicle={vehicle_id}\n{message}",
        flush=True,
    )
    return DriverNotificationResult(
        vehicle_id=vehicle_id,
        message=message,
        channel="log",
        delivered=True,
        sent_at=sent_at,
        detail="Logged locally — telephony not configured",
    )
