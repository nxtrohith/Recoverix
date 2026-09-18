"""
Retrieve vehicles from MongoDB and compute their operational state.

Operational layer: answers "which vehicles are active, where are they, and
how much capacity do they have left?"  Does NOT touch the NetworkX graph.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from bson import ObjectId
from pymongo.database import Database


# Vehicle statuses considered operationally active.
ACTIVE_VEHICLE_STATUSES: frozenset[str] = frozenset(
    {"available", "in_transit", "loading"}
)


@dataclass
class VehicleState:
    """Operational snapshot of one vehicle, including capacity math."""

    # Identity
    vehicle_id: str
    vehicle_number: str
    vehicle_type: str
    status: str

    # Capacity (from Vehicle.capacity and Vehicle.currentLoad)
    capacity_weight: float   # kg  — total rated
    capacity_volume: float   # m³  — total rated
    current_load_weight: float
    current_load_volume: float
    available_weight: float  # capacity - load (floored at 0)
    available_volume: float

    # Current position
    current_location_id: str | None   # MongoDB ObjectId string
    current_location_name: str | None
    current_node: str | None          # Location.graphNodeKey → telangana_nodes hub_name

    # Assigned route (if any)
    current_route_id: str | None
    destination_node: str | None      # graphNodeKey of route's destination location


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _resolve_location(
    db: Database, location_id: Any
) -> tuple[str | None, str | None]:
    """Return (name, graphNodeKey) for a Location ObjectId."""
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


def _resolve_route_destination_node(db: Database, route_id: Any) -> str | None:
    """Return graphNodeKey of the Route's destination location."""
    if route_id is None:
        return None
    try:
        oid = (
            route_id
            if isinstance(route_id, ObjectId)
            else ObjectId(route_id)
        )
    except Exception:
        return None
    route = db["routes"].find_one({"_id": oid}, {"destination": 1})
    if route is None:
        return None
    _, node = _resolve_location(db, route.get("destination"))
    return node


def _doc_to_vehicle_state(db: Database, doc: dict[str, Any]) -> VehicleState:
    cap = doc.get("capacity") or {}
    load = doc.get("currentLoad") or {}

    cap_w = float(cap.get("weight") or 0)
    cap_v = float(cap.get("volume") or 0)
    load_w = float(load.get("weight") or 0)
    load_v = float(load.get("volume") or 0)

    curr_loc_id = doc.get("currentLocation")
    curr_loc_name, curr_node = _resolve_location(db, curr_loc_id)

    route_id = doc.get("currentRoute")
    dest_node = _resolve_route_destination_node(db, route_id)

    return VehicleState(
        vehicle_id=str(doc["_id"]),
        vehicle_number=doc.get("vehicleNumber", ""),
        vehicle_type=doc.get("type", ""),
        status=doc.get("status", ""),
        capacity_weight=cap_w,
        capacity_volume=cap_v,
        current_load_weight=load_w,
        current_load_volume=load_v,
        available_weight=max(0.0, cap_w - load_w),
        available_volume=max(0.0, cap_v - load_v),
        current_location_id=str(curr_loc_id) if curr_loc_id else None,
        current_location_name=curr_loc_name,
        current_node=curr_node,
        current_route_id=str(route_id) if route_id else None,
        destination_node=dest_node,
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_active_vehicles(db: Database) -> list[VehicleState]:
    """
    Return all vehicles whose status is available, in_transit, or loading.

    Each vehicle's currentLocation is resolved to a graph node key.
    """
    docs = list(
        db["vehicles"].find(
            {"status": {"$in": list(ACTIVE_VEHICLE_STATUSES)}}
        )
    )
    return [_doc_to_vehicle_state(db, doc) for doc in docs]


def filter_capable_vehicles(
    vehicles: list[VehicleState],
    weight_needed: float,
    volume_needed: float,
) -> list[VehicleState]:
    """
    Return only vehicles that can physically carry the shipment.

    Uses available (remaining) weight and volume, not total capacity.
    """
    return [
        v
        for v in vehicles
        if v.available_weight >= weight_needed
        and v.available_volume >= volume_needed
    ]
