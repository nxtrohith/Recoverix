"""
Generate raw piggyback candidates from a RecoveryContext.

CANDIDATE GENERATION layer — not scoring, not selection.

A candidate represents one potentially feasible vehicle-based recovery
opportunity.  Three cases are captured:

  1. Vehicle is already at the shipment's current node  (pickup_case = "at_node")
  2. Vehicle passes through the shipment's current node on its way to dest
     (pickup_case = "pass_through")
  3. Vehicle can make a detour to reach the shipment's current node, then
     continue to the destination  (pickup_case = "detour")

The scoring engine (`graph.recovery_scorer`) ranks and selects; this module
only filters physically impossible options and records path data for scoring.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Literal

import networkx as nx

from graph.recovery_context import RecoveryContext
from graph.vehicle_state import VehicleState


PickupCase = Literal["at_node", "pass_through", "detour", "none"]


@dataclass
class RecoveryCandidate:
    """
    One potential piggyback recovery option.

    All path distances / times come from NetworkX edge attributes
    (avg_distance_km, avg_time_min).  Deadline compatibility is a rough
    estimate — the optimizer should refine it with real schedule data.
    """

    # Identity
    shipment_id: str
    vehicle_id: str
    vehicle_number: str
    vehicle_type: str

    # Node positions (graph node IDs = hub_name in telangana_nodes)
    shipment_current_node: str | None
    vehicle_current_node: str
    destination_node: str

    # How the vehicle reaches the shipment
    pickup_case: PickupCase       # "at_node" | "pass_through" | "detour"

    # Vehicle → shipment pickup location
    vehicle_to_pickup_path: list[str]
    vehicle_to_pickup_km: float | None
    vehicle_to_pickup_min: float | None

    # Vehicle → final destination (after pickup)
    vehicle_to_destination_path: list[str]
    vehicle_to_destination_km: float | None
    vehicle_to_destination_min: float | None

    # Capacity
    available_weight: float
    available_volume: float
    shipment_weight: float
    shipment_volume: float
    capacity_feasible: bool

    # Shipment constraints
    shipment_priority: str
    shipment_deadline: datetime | None

    # Rough deadline estimate
    estimated_total_min: float | None       # vehicle_to_pickup + to_destination
    estimated_delivery_at: datetime | None  # now + estimated_total_min
    deadline_feasible: bool | None          # None = cannot compute


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _path_weight(
    G: nx.DiGraph, path: list[str], weight: str
) -> float | None:
    """nx.path_weight wrapper; returns None on any error."""
    if len(path) < 2:
        return 0.0 if len(path) == 1 else None
    try:
        return nx.path_weight(G, path, weight=weight)
    except Exception:
        return None


def _shortest(
    G: nx.DiGraph, src: str, dst: str, weight: str = "avg_distance_km"
) -> list[str]:
    """Return shortest path or [] on failure."""
    try:
        return nx.shortest_path(G, src, dst, weight=weight)
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return []


def _deadline_feasible(
    deadline: datetime | None, total_min: float | None
) -> bool | None:
    if deadline is None or total_min is None:
        return None
    est = datetime.now(tz=timezone.utc) + timedelta(minutes=total_min)
    # Make deadline tz-aware if it's naive
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    return est <= deadline


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_candidates(
    G: nx.DiGraph,
    context: RecoveryContext,
    *,
    max_detour_ratio: float = 3.0,
) -> list[RecoveryCandidate]:
    """
    Enumerate recovery candidates from a RecoveryContext.

    Parameters
    ----------
    G : nx.DiGraph
        The NetworkX logistics graph (telangana_nodes + telangana_edges).
    context : RecoveryContext
        Assembled operational + graph context for the distressed shipment.
    max_detour_ratio : float
        Maximum allowed ratio of (detour distance) / (direct vehicle→dest distance).
        Keeps candidate count reasonable without being too strict at this stage.

    Returns
    -------
    list[RecoveryCandidate]
        All candidates that are not physically impossible.  Not sorted or scored.
    """
    shipment = context.shipment
    dest_node = context.destination_node
    curr_node = context.current_node

    if dest_node is None or dest_node not in G:
        # Cannot route to destination — no candidates possible.
        return []

    candidates: list[RecoveryCandidate] = []

    for vehicle in context.relevant_vehicles:
        v_node = vehicle.current_node
        assert v_node is not None  # filtered upstream

        if v_node not in G:
            continue

        # ------------------------------------------------------------------
        # 1. Path: vehicle's current position → destination
        # ------------------------------------------------------------------
        v_to_dest_path = _shortest(G, v_node, dest_node)
        if not v_to_dest_path:
            continue  # vehicle cannot reach destination through graph

        v_to_dest_km = _path_weight(G, v_to_dest_path, "avg_distance_km")
        v_to_dest_min = _path_weight(G, v_to_dest_path, "avg_time_min")

        # ------------------------------------------------------------------
        # 2. How does the vehicle pick up the shipment?
        # ------------------------------------------------------------------
        pickup_case: PickupCase = "none"
        v_to_pickup_path: list[str] = []
        v_to_pickup_km: float | None = None
        v_to_pickup_min: float | None = None

        if curr_node is None:
            # Shipment node unknown — we can still flag the vehicle as a
            # potential candidate (destination reachable) but pickup is open.
            pickup_case = "none"
            v_to_pickup_path = []
        elif curr_node == v_node:
            # Vehicle is already at the shipment's location.
            pickup_case = "at_node"
            v_to_pickup_path = [v_node]
            v_to_pickup_km = 0.0
            v_to_pickup_min = 0.0
        elif curr_node in G and curr_node in v_to_dest_path:
            # Shipment's node is already on the vehicle's route — no detour.
            pickup_case = "pass_through"
            idx = v_to_dest_path.index(curr_node)
            v_to_pickup_path = v_to_dest_path[: idx + 1]
            v_to_pickup_km = _path_weight(G, v_to_pickup_path, "avg_distance_km")
            v_to_pickup_min = _path_weight(G, v_to_pickup_path, "avg_time_min")
        elif curr_node in G:
            # Vehicle must detour to pick up shipment.
            detour_path = _shortest(G, v_node, curr_node)
            if not detour_path:
                continue  # cannot reach shipment node

            detour_km = _path_weight(G, detour_path, "avg_distance_km")

            # Reject excessively long detours.
            if (
                v_to_dest_km is not None
                and detour_km is not None
                and v_to_dest_km > 0
                and detour_km > max_detour_ratio * v_to_dest_km
            ):
                continue

            pickup_case = "detour"
            v_to_pickup_path = detour_path
            v_to_pickup_km = detour_km
            v_to_pickup_min = _path_weight(G, detour_path, "avg_time_min")
        else:
            # curr_node not in graph at all — skip detour case.
            continue

        # Candidates with pickup_case == "none" carry limited info but are
        # still useful when destination is known; include them.

        # ------------------------------------------------------------------
        # 3. Capacity check
        # ------------------------------------------------------------------
        cap_ok = (
            vehicle.available_weight >= shipment.weight
            and vehicle.available_volume >= shipment.volume
        )

        # ------------------------------------------------------------------
        # 4. Rough deadline estimate
        # ------------------------------------------------------------------
        total_min: float | None = None
        if v_to_pickup_min is not None and v_to_dest_min is not None:
            total_min = v_to_pickup_min + v_to_dest_min
        elif v_to_dest_min is not None:
            total_min = v_to_dest_min  # best case: no extra time to pickup

        est_delivery: datetime | None = None
        deadline_ok: bool | None = None
        if total_min is not None:
            est_delivery = datetime.now(tz=timezone.utc) + timedelta(
                minutes=total_min
            )
            deadline_ok = _deadline_feasible(shipment.deadline, total_min)

        # ------------------------------------------------------------------
        # Build candidate
        # ------------------------------------------------------------------
        candidates.append(
            RecoveryCandidate(
                shipment_id=shipment.shipment_id,
                vehicle_id=vehicle.vehicle_id,
                vehicle_number=vehicle.vehicle_number,
                vehicle_type=vehicle.vehicle_type,
                shipment_current_node=curr_node,
                vehicle_current_node=v_node,
                destination_node=dest_node,
                pickup_case=pickup_case,
                vehicle_to_pickup_path=v_to_pickup_path,
                vehicle_to_pickup_km=v_to_pickup_km,
                vehicle_to_pickup_min=v_to_pickup_min,
                vehicle_to_destination_path=v_to_dest_path,
                vehicle_to_destination_km=v_to_dest_km,
                vehicle_to_destination_min=v_to_dest_min,
                available_weight=vehicle.available_weight,
                available_volume=vehicle.available_volume,
                shipment_weight=shipment.weight,
                shipment_volume=shipment.volume,
                capacity_feasible=cap_ok,
                shipment_priority=shipment.priority,
                shipment_deadline=shipment.deadline,
                estimated_total_min=total_min,
                estimated_delivery_at=est_delivery,
                deadline_feasible=deadline_ok,
            )
        )

    return candidates
