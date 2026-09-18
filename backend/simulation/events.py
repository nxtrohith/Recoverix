"""Simulation event types and event creator helper."""

from __future__ import annotations

from typing import Any


class EventType:
    """Standard simulation event types."""

    TRUCK_DEPARTURE = "TRUCK_DEPARTURE"
    TRUCK_ARRIVAL = "TRUCK_ARRIVAL"
    SHIPMENT_PICKUP = "SHIPMENT_PICKUP"
    SHIPMENT_DELIVERY = "SHIPMENT_DELIVERY"
    DELAY = "DELAY"
    RECOVERY = "RECOVERY"


_UNSET = object()


def create_event(
    time: float | int,
    event_type: str,
    truck_id: str,
    from_node: str | None = None,
    to_node: str | None = None,
    current_node: Any = _UNSET,
    next_node: Any = _UNSET,
    shipment_id: str | None = None,
    **extra: Any,
) -> dict[str, Any]:
    """
    Construct a JSON-serializable simulation event.

    Follows the standard format:
    {
      "time": 120,
      "type": "TRUCK_ARRIVAL",
      "truck_id": "TRUCK_101",
      "shipment_id": "SHIP_001",
      "from": "HYD",
      "to": "WAR",
      "current_node": "WAR",
      "next_node": "KRM"
    }
    """
    event: dict[str, Any] = {
        "time": round(float(time), 2),
        "type": event_type,
        "truck_id": truck_id,
        "shipment_id": shipment_id,
        "from": from_node,
        "to": to_node,
        "current_node": from_node if current_node is _UNSET else current_node,
        "next_node": to_node if next_node is _UNSET else next_node,
    }

    for key, value in extra.items():
        if value is not None:
            event[key] = value

    return event

