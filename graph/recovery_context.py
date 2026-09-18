"""
Assemble a full RecoveryContext for a given shipment.

This module is the bridge between the operational data layer (MongoDB) and
the graph layer (NetworkX).  It answers:

  GRAPH:         Can something travel from A to B?
  OPERATIONAL:   Where is the shipment / vehicle right now?
  CONTEXT:       Gather everything the candidate generator needs.

Does NOT generate candidates, score them, or choose the best one.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import networkx as nx
from pymongo.database import Database

from graph.shipment_state import ShipmentState, get_shipment_state
from graph.vehicle_state import (
    VehicleState,
    filter_capable_vehicles,
    get_active_vehicles,
)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class GraphContext:
    """
    Graph-layer facts about the direct journey from current_node → destination_node.

    Only populated when both nodes exist in the graph.
    """
    current_node_in_graph: bool
    destination_node_in_graph: bool
    direct_path_exists: bool
    direct_path: list[str]             # hub_name sequence
    direct_distance_km: float | None
    direct_time_min: float | None
    hop_count: int                     # len(path) - 1; 0 if same node or no path


@dataclass
class RecoveryContext:
    """
    Everything the candidate generator needs to enumerate recovery options.

    shipment            — full operational state of the distressed shipment
    current_node        — actual / last-confirmed hub (recovery pickup node)
    destination_node    — graph node the shipment must reach (may be None)
    relevant_vehicles   — active vehicles with enough capacity + a known graph node
    relevant_routes     — active routes touching the shipment's actual hub
    graph_context       — direct-path analysis between actual and destination nodes

    Note: expectedNode lives on ``shipment.expected_node`` and is used for
    misplaced detection, not as the pickup location.
    """
    shipment: ShipmentState
    current_node: str | None
    destination_node: str | None
    relevant_vehicles: list[VehicleState]
    relevant_routes: list[dict[str, Any]]
    graph_context: GraphContext


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _build_graph_context(
    G: nx.DiGraph,
    current_node: str | None,
    destination_node: str | None,
) -> GraphContext:
    curr_in = current_node is not None and current_node in G
    dest_in = destination_node is not None and destination_node in G

    path: list[str] = []
    dist_km: float | None = None
    time_min: float | None = None
    hop_count = 0

    if curr_in and dest_in and current_node != destination_node:
        try:
            path = nx.shortest_path(
                G, current_node, destination_node, weight="avg_distance_km"
            )
            dist_km = nx.path_weight(G, path, weight="avg_distance_km")
            hop_count = len(path) - 1
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            path = []

        if path:
            try:
                time_min = nx.path_weight(G, path, weight="avg_time_min")
            except Exception:
                pass  # avg_time_min may be missing on some edges

    return GraphContext(
        current_node_in_graph=curr_in,
        destination_node_in_graph=dest_in,
        direct_path_exists=len(path) > 0,
        direct_path=path,
        direct_distance_km=dist_km,
        direct_time_min=time_min,
        hop_count=hop_count,
    )


def _get_relevant_routes(
    db: Database, current_node: str | None
) -> list[dict[str, Any]]:
    """
    Return active routes whose origin or destination is the shipment's
    actual / recovery hub (matched via graphNodeKey).

    Keeps it simple: useful for showing the planner what traffic passes
    through the misplaced pickup hub.
    """
    if current_node is None:
        return []

    # Resolve graphNodeKey → Location _id
    loc_doc = db["locations"].find_one(
        {"graphNodeKey": current_node}, {"_id": 1}
    )
    if loc_doc is None:
        return []

    loc_oid = loc_doc["_id"]
    routes = list(
        db["routes"].find(
            {
                "status": {"$in": ["scheduled", "in_progress"]},
                "$or": [
                    {"origin": loc_oid},
                    {"destination": loc_oid},
                ],
            },
            {
                "routeCode": 1,
                "origin": 1,
                "destination": 1,
                "status": 1,
                "scheduledDeparture": 1,
                "scheduledArrival": 1,
                "vehicle": 1,
                "distanceKm": 1,
                "capacity": 1,
                "currentLoad": 1,
            },
        ).limit(20)
    )

    result = []
    for r in routes:
        cap = r.get("capacity") or {}
        load = r.get("currentLoad") or {}
        result.append(
            {
                "route_id": str(r["_id"]),
                "route_code": r.get("routeCode", ""),
                "status": r.get("status", ""),
                "scheduled_departure": r.get("scheduledDeparture"),
                "scheduled_arrival": r.get("scheduledArrival"),
                "vehicle_id": str(r["vehicle"]) if r.get("vehicle") else None,
                "distance_km": r.get("distanceKm"),
                "available_weight": max(
                    0.0,
                    float(cap.get("weight") or 0) - float(load.get("weight") or 0),
                ),
                "available_volume": max(
                    0.0,
                    float(cap.get("volume") or 0) - float(load.get("volume") or 0),
                ),
            }
        )
    return result


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_recovery_context(
    db: Database,
    G: nx.DiGraph,
    identifier: str,
) -> RecoveryContext | None:
    """
    Build a full RecoveryContext for a shipment.

    identifier — ObjectId string or trackingNumber.
    Returns None if the shipment is not found in MongoDB.
    """
    shipment = get_shipment_state(db, identifier)
    if shipment is None:
        return None

    # Pickup / recovery hub = actualNode (last-confirmed), never expectedNode.
    pickup_node = shipment.actual_node or shipment.current_node

    # Vehicles: active + can carry the shipment + have a known graph node.
    all_active = get_active_vehicles(db)
    capable = filter_capable_vehicles(all_active, shipment.weight, shipment.volume)
    relevant_vehicles = [v for v in capable if v.current_node is not None]

    relevant_routes = _get_relevant_routes(db, pickup_node)

    graph_context = _build_graph_context(
        G, pickup_node, shipment.destination_node
    )

    return RecoveryContext(
        shipment=shipment,
        current_node=pickup_node,
        destination_node=shipment.destination_node,
        relevant_vehicles=relevant_vehicles,
        relevant_routes=relevant_routes,
        graph_context=graph_context,
    )


def get_recovery_context_from_state(
    db: Database,
    G: nx.DiGraph,
    shipment: ShipmentState,
) -> RecoveryContext:
    """
    Build a RecoveryContext from an already-loaded ShipmentState.

    Use this when the shipment was constructed in-memory (e.g. mock/test mode).
    Pickup is always ``actual_node`` (physical last-confirmed hub).
    """
    pickup_node = shipment.actual_node or shipment.current_node

    all_active = get_active_vehicles(db)
    capable = filter_capable_vehicles(all_active, shipment.weight, shipment.volume)
    relevant_vehicles = [v for v in capable if v.current_node is not None]

    relevant_routes = _get_relevant_routes(db, pickup_node)

    graph_context = _build_graph_context(
        G, pickup_node, shipment.destination_node
    )

    return RecoveryContext(
        shipment=shipment,
        current_node=pickup_node,
        destination_node=shipment.destination_node,
        relevant_vehicles=relevant_vehicles,
        relevant_routes=relevant_routes,
        graph_context=graph_context,
    )
