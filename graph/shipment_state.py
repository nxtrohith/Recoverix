"""
Resolve a Shipment document from MongoDB into a graph-aware state object.

Operational layer: answers "where is the shipment, where does it need to go,
and is it in trouble?"  Does NOT touch the graph itself.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from bson import ObjectId
from pymongo.database import Database


# Statuses that mean the shipment requires active recovery.
MISPLACED_STATUSES: frozenset[str] = frozenset({"misplaced"})
DELAYED_STATUSES: frozenset[str] = frozenset({"delayed"})


@dataclass
class ShipmentState:
    """All relevant facts about a shipment, ready for recovery planning."""

    # Identity
    shipment_id: str
    tracking_number: str
    status: str
    priority: str

    # Constraints
    deadline: datetime | None
    weight: float          # kg
    volume: float          # m³
    package_count: int
    fragile: bool
    special_handling: str | None

    # Resolved location names (human-readable)
    origin_name: str | None
    destination_name: str | None
    current_location_name: str | None

    # Graph node keys (hub_name in telangana_nodes, via Location.graphNodeKey)
    origin_node: str | None
    destination_node: str | None
    current_node: str | None

    # Latest tracking event
    latest_event_type: str | None
    latest_event_time: datetime | None

    # Recovery flags
    is_misplaced: bool
    is_delayed: bool
    needs_recovery: bool


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _resolve_location(
    db: Database, location_id: Any
) -> tuple[str | None, str | None]:
    """
    Look up a Location by ObjectId.

    Returns (name, graphNodeKey).  Both are None if not found or if
    graphNodeKey is not set on that location document.
    """
    if location_id is None:
        return None, None
    try:
        oid = (
            location_id
            if isinstance(location_id, ObjectId)
            else ObjectId(location_id)
        )
    except Exception:
        return None, None

    doc = db["locations"].find_one({"_id": oid}, {"name": 1, "graphNodeKey": 1})
    if doc is None:
        return None, None
    return doc.get("name"), doc.get("graphNodeKey")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_shipment_state(db: Database, identifier: str) -> ShipmentState | None:
    """
    Fetch a shipment by ObjectId string or trackingNumber.

    Returns None if the shipment is not found.

    Resolves currentLocation / origin / destination into human-readable names
    and graph node keys via Location.graphNodeKey.
    """
    # Try ObjectId first; fall back to tracking-number string search.
    try:
        query: dict[str, Any] = {"_id": ObjectId(identifier)}
    except Exception:
        query = {"trackingNumber": identifier}

    doc = db["shipments"].find_one(query)
    if doc is None:
        return None

    shipment_id = str(doc["_id"])

    origin_name, origin_node = _resolve_location(db, doc.get("origin"))
    dest_name, dest_node = _resolve_location(db, doc.get("destination"))
    curr_name, curr_node = _resolve_location(db, doc.get("currentLocation"))

    # Most-recent shipment event (latest timestamp wins).
    latest_event = db["shipmentevents"].find_one(
        {"shipment": doc["_id"]},
        sort=[("timestamp", -1)],
    )
    latest_event_type: str | None = None
    latest_event_time: datetime | None = None
    if latest_event:
        latest_event_type = latest_event.get("type")
        latest_event_time = latest_event.get("timestamp")

    status: str = doc.get("status", "")
    is_misplaced = status in MISPLACED_STATUSES or latest_event_type == "misplaced"
    is_delayed = status in DELAYED_STATUSES
    needs_recovery = is_misplaced or is_delayed

    return ShipmentState(
        shipment_id=shipment_id,
        tracking_number=doc.get("trackingNumber", ""),
        status=status,
        priority=doc.get("priority", ""),
        deadline=doc.get("deadline"),
        weight=float(doc.get("weight") or 0),
        volume=float(doc.get("volume") or 0),
        package_count=int(doc.get("packageCount") or 0),
        fragile=bool(doc.get("fragile", False)),
        special_handling=doc.get("specialHandling"),
        origin_name=origin_name,
        destination_name=dest_name,
        current_location_name=curr_name,
        origin_node=origin_node,
        destination_node=dest_node,
        current_node=curr_node,
        latest_event_type=latest_event_type,
        latest_event_time=latest_event_time,
        is_misplaced=is_misplaced,
        is_delayed=is_delayed,
        needs_recovery=needs_recovery,
    )
