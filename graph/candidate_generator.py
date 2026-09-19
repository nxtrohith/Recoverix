"""
Generate raw piggyback candidates from a RecoveryContext.

CANDIDATE GENERATION layer — not scoring, not selection.

A candidate represents one potentially feasible vehicle-based recovery
opportunity.  Pickup is always the shipment **actual** hub.

Classification (prefer existing movements over diversions):

  1. ``at_node``      — vehicle is already at the pickup node
  2. ``pass_through`` — pickup lies on the vehicle's **existing active route**
                        toward a compatible destination (not merely a shortest
                        path that happens to visit the hub)
  3. ``detour``       — vehicle must divert from its current position/route to
                        collect the shipment, then continue to destination

A mathematically valid ``shortest_path(vehicle → pickup → destination)`` is
**not** automatically a piggyback opportunity.  When ``Vehicle.currentRoute``
is present, that route's ordered stops drive ``pass_through`` detection.

The scoring engine (`graph.recovery_scorer`) ranks and selects; this module
only enumerates candidates and records path / capacity / deadline facts.
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
    (avg_distance_km, avg_time_min) or from the vehicle's existing route
    geometry when used as the movement.  Deadline compatibility is a rough
    estimate — the scorer applies the hard deadline filter.
    """

    # Identity
    shipment_id: str
    vehicle_id: str
    vehicle_number: str
    vehicle_type: str

    # Driver identity (no separate Driver entity — vehicle handle)
    driver_id: str | None
    driver_name: str | None

    # Node positions (graph node IDs = hub_name in telangana_nodes)
    shipment_current_node: str | None   # pickup / actual node
    vehicle_current_node: str
    destination_node: str
    pickup_node: str | None             # alias of shipment_current_node

    # How the vehicle reaches the shipment
    pickup_case: PickupCase       # "at_node" | "pass_through" | "detour"

    # Existing active route (when Vehicle.currentRoute is set)
    existing_route_id: str | None = None
    existing_route_code: str | None = None
    existing_route_nodes: list[str] = field(default_factory=list)

    # Vehicle → shipment pickup location
    vehicle_to_pickup_path: list[str] = field(default_factory=list)
    vehicle_to_pickup_km: float | None = None
    vehicle_to_pickup_min: float | None = None

    # After pickup → destination (or full vehicle→dest for pass_through)
    vehicle_to_destination_path: list[str] = field(default_factory=list)
    vehicle_to_destination_km: float | None = None
    vehicle_to_destination_min: float | None = None

    # Explicit aliases for explainability
    pickup_path: list[str] = field(default_factory=list)
    destination_path: list[str] = field(default_factory=list)
    detour_distance_km: float | None = None

    # Capacity
    available_weight: float = 0.0
    available_volume: float = 0.0
    shipment_weight: float = 0.0
    shipment_volume: float = 0.0
    capacity_feasible: bool = False

    # Shipment constraints
    shipment_priority: str = ""
    shipment_deadline: datetime | None = None

    # Rough deadline estimate
    estimated_total_min: float | None = None
    estimated_delivery_at: datetime | None = None
    deadline_feasible: bool | None = None


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
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    return est <= deadline


def _remaining_route(
    route_nodes: list[str], vehicle_node: str | None
) -> list[str]:
    """
    Slice the vehicle's planned route from its current hub onward.

    If the vehicle is not on the logged route, return the full planned
    sequence (still useful for pass-through detection).
    """
    if not route_nodes:
        return []
    if vehicle_node and vehicle_node in route_nodes:
        return list(route_nodes[route_nodes.index(vehicle_node) :])
    return list(route_nodes)


def _segment_on_route(
    route_nodes: list[str], start: str, end: str
) -> list[str]:
    """Inclusive sub-sequence start→end along an ordered route, or []."""
    if start not in route_nodes or end not in route_nodes:
        return []
    i = route_nodes.index(start)
    j = route_nodes.index(end)
    if i > j:
        return []
    return list(route_nodes[i : j + 1])


def _route_compatible_with_destination(
    remaining: list[str],
    pickup: str,
    shipment_dest: str,
    route_dest: str | None,
) -> bool:
    """True when the existing movement continues toward the shipment dest."""
    if pickup not in remaining:
        return False
    after = remaining[remaining.index(pickup) :]
    if shipment_dest in after:
        return True
    return route_dest is not None and route_dest == shipment_dest


def _path_via_route_or_graph(
    G: nx.DiGraph,
    route_nodes: list[str],
    src: str,
    dst: str,
) -> list[str]:
    """Prefer an on-route segment; fall back to graph shortest path."""
    on_route = _segment_on_route(route_nodes, src, dst)
    if on_route:
        return on_route
    return _shortest(G, src, dst)


def _classify_pickup(
    G: nx.DiGraph,
    vehicle: VehicleState,
    pickup: str,
    dest: str,
    *,
    max_detour_ratio: float,
) -> tuple[PickupCase, list[str], list[str], float | None] | tuple[None, str]:
    """
    Decide at_node / pass_through / detour for one vehicle.

    Returns
    -------
    (case, pickup_path, destination_movement_path, detour_km)
        when the vehicle can participate, or
    (None, skip_reason)
        when it cannot (unreachable pickup / dest / excessive detour).

    ``destination_movement_path``:
      - at_node / detour: pickup → destination
      - pass_through: vehicle → … → pickup → … → destination (existing movement)
    """
    v_node = vehicle.current_node
    assert v_node is not None

    remaining = _remaining_route(vehicle.route_nodes, v_node)
    route_dest = vehicle.destination_node

    # ------------------------------------------------------------------
    # 1. Already at the misplaced / recovery hub
    # ------------------------------------------------------------------
    if v_node == pickup:
        dest_path = _path_via_route_or_graph(G, remaining or vehicle.route_nodes, pickup, dest)
        if not dest_path:
            return None, "At pickup hub but no path to destination"
        return "at_node", [pickup], dest_path, 0.0

    # ------------------------------------------------------------------
    # 2. Existing route already passes through pickup toward dest
    # ------------------------------------------------------------------
    if remaining and _route_compatible_with_destination(
        remaining, pickup, dest, route_dest
    ):
        # Vehicle must still be at or before the pickup on the planned route.
        if v_node in remaining and remaining.index(v_node) <= remaining.index(pickup):
            pickup_path = _segment_on_route(remaining, v_node, pickup)
            if dest in remaining and remaining.index(dest) >= remaining.index(pickup):
                full_movement = _segment_on_route(remaining, v_node, dest)
            else:
                # Compatible via route_dest == shipment dest
                to_end = list(remaining)
                if to_end[-1] != dest:
                    tail = _shortest(G, to_end[-1], dest)
                    if not tail:
                        full_movement = []
                    else:
                        full_movement = to_end + tail[1:]
                else:
                    full_movement = to_end

            if pickup_path and full_movement and pickup in full_movement:
                return "pass_through", pickup_path, full_movement, 0.0

    # ------------------------------------------------------------------
    # 3. Detour — divert from current position / route, then to dest
    # ------------------------------------------------------------------
    if pickup not in G or v_node not in G or dest not in G:
        return None, "Pickup, vehicle, or destination node missing from graph"

    to_pickup = _shortest(G, v_node, pickup)
    if not to_pickup:
        return None, "No graph path from vehicle to pickup hub"

    to_dest = _shortest(G, pickup, dest)
    if not to_dest:
        return None, "No graph path from pickup hub to destination"

    detour_km = _path_weight(G, to_pickup, "avg_distance_km")

    # Baseline for detour ratio: prefer existing route length, else V→dest.
    baseline_km: float | None = None
    if len(remaining) >= 2:
        baseline_km = _path_weight(G, remaining, "avg_distance_km")
    if baseline_km is None:
        direct = _shortest(G, v_node, dest)
        baseline_km = _path_weight(G, direct, "avg_distance_km") if direct else None

    if (
        baseline_km is not None
        and detour_km is not None
        and baseline_km > 0
        and detour_km > max_detour_ratio * baseline_km
    ):
        return (
            None,
            f"Detour ratio exceeds max ({max_detour_ratio:.1f}× baseline)",
        )

    return "detour", to_pickup, to_dest, detour_km


def _build_candidate(
    shipment_id: str,
    shipment_weight: float,
    shipment_volume: float,
    shipment_priority: str,
    shipment_deadline: datetime | None,
    vehicle: VehicleState,
    pickup: str | None,
    dest: str,
    pickup_case: PickupCase,
    pickup_path: list[str],
    dest_movement: list[str],
    detour_km: float | None,
    G: nx.DiGraph,
) -> RecoveryCandidate:
    pickup_km = _path_weight(G, pickup_path, "avg_distance_km")
    pickup_min = _path_weight(G, pickup_path, "avg_time_min")
    dest_km = _path_weight(G, dest_movement, "avg_distance_km")
    dest_min = _path_weight(G, dest_movement, "avg_time_min")

    # Total travel time for the recovery movement (avoid double-counting).
    if pickup_case == "pass_through":
        # dest_movement already includes vehicle → pickup → dest
        total_min = dest_min
    elif pickup_case == "at_node":
        total_min = dest_min
    elif pickup_min is not None and dest_min is not None:
        total_min = pickup_min + dest_min
    else:
        total_min = dest_min if dest_min is not None else pickup_min

    est_delivery: datetime | None = None
    if total_min is not None:
        est_delivery = datetime.now(tz=timezone.utc) + timedelta(minutes=total_min)

    cap_ok = (
        vehicle.available_weight >= shipment_weight
        and vehicle.available_volume >= shipment_volume
    )

    return RecoveryCandidate(
        shipment_id=shipment_id,
        vehicle_id=vehicle.vehicle_id,
        vehicle_number=vehicle.vehicle_number,
        vehicle_type=vehicle.vehicle_type,
        driver_id=vehicle.driver_id or vehicle.vehicle_id,
        driver_name=vehicle.driver_name or vehicle.vehicle_number,
        shipment_current_node=pickup,
        vehicle_current_node=vehicle.current_node or "",
        destination_node=dest,
        pickup_node=pickup,
        pickup_case=pickup_case,
        existing_route_id=vehicle.current_route_id,
        existing_route_code=vehicle.route_code,
        existing_route_nodes=list(vehicle.route_nodes),
        vehicle_to_pickup_path=list(pickup_path),
        vehicle_to_pickup_km=pickup_km,
        vehicle_to_pickup_min=pickup_min,
        vehicle_to_destination_path=list(dest_movement),
        vehicle_to_destination_km=dest_km,
        vehicle_to_destination_min=dest_min,
        pickup_path=list(pickup_path),
        destination_path=list(dest_movement),
        detour_distance_km=detour_km if pickup_case == "detour" else 0.0,
        available_weight=vehicle.available_weight,
        available_volume=vehicle.available_volume,
        shipment_weight=shipment_weight,
        shipment_volume=shipment_volume,
        capacity_feasible=cap_ok,
        shipment_priority=shipment_priority,
        shipment_deadline=shipment_deadline,
        estimated_total_min=total_min,
        estimated_delivery_at=est_delivery,
        deadline_feasible=_deadline_feasible(shipment_deadline, total_min),
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

@dataclass
class CandidateGenerationResult:
    """Candidates plus per-vehicle skip audit for explainability."""

    candidates: list[RecoveryCandidate]
    skips: list[dict[str, str]] = field(default_factory=list)


def generate_candidates(
    G: nx.DiGraph,
    context: RecoveryContext,
    *,
    max_detour_ratio: float = 3.0,
) -> list[RecoveryCandidate]:
    """
    Enumerate piggyback recovery candidates from a RecoveryContext.

    Returns only the candidate list (backward compatible). Prefer
    ``generate_candidates_with_audit`` when skip reasons are needed.
    """
    return generate_candidates_with_audit(
        G, context, max_detour_ratio=max_detour_ratio
    ).candidates


def generate_candidates_with_audit(
    G: nx.DiGraph,
    context: RecoveryContext,
    *,
    max_detour_ratio: float = 3.0,
) -> CandidateGenerationResult:
    """
    Enumerate piggyback recovery candidates and record skip reasons.

    Parameters
    ----------
    G : nx.DiGraph
        The NetworkX logistics graph (telangana_nodes + telangana_edges).
    context : RecoveryContext
        Assembled operational + graph context. ``current_node`` must be the
        shipment **actual** / recovery pickup hub.
    max_detour_ratio : float
        Maximum allowed ratio of (detour to pickup) / (baseline route or
        vehicle→dest distance). Keeps extreme diversions out of the pool.
    """
    shipment = context.shipment
    dest_node = context.destination_node
    # Pickup is always the misplaced / actual hub — never expectedNode.
    pickup_node = context.current_node

    skips: list[dict[str, str]] = []

    if dest_node is None or dest_node not in G:
        return CandidateGenerationResult(
            candidates=[],
            skips=[{
                "vehicleId": "*",
                "vehicleNumber": "*",
                "reason": "Destination node missing or not in graph",
            }],
        )
    if pickup_node is None or pickup_node not in G:
        return CandidateGenerationResult(
            candidates=[],
            skips=[{
                "vehicleId": "*",
                "vehicleNumber": "*",
                "reason": "Pickup/actual node missing or not in graph",
            }],
        )

    candidates: list[RecoveryCandidate] = []

    for vehicle in context.relevant_vehicles:
        v_node = vehicle.current_node
        if v_node is None or v_node not in G:
            skips.append({
                "vehicleId": vehicle.vehicle_id,
                "vehicleNumber": vehicle.vehicle_number,
                "reason": "Vehicle current node missing or not in graph",
            })
            continue

        classified = _classify_pickup(
            G,
            vehicle,
            pickup_node,
            dest_node,
            max_detour_ratio=max_detour_ratio,
        )
        if classified[0] is None:
            skips.append({
                "vehicleId": vehicle.vehicle_id,
                "vehicleNumber": vehicle.vehicle_number,
                "reason": str(classified[1]),
            })
            continue

        pickup_case, pickup_path, dest_movement, detour_km = classified  # type: ignore[misc]

        candidates.append(
            _build_candidate(
                shipment_id=shipment.shipment_id,
                shipment_weight=shipment.weight,
                shipment_volume=shipment.volume,
                shipment_priority=shipment.priority,
                shipment_deadline=shipment.deadline,
                vehicle=vehicle,
                pickup=pickup_node,
                dest=dest_node,
                pickup_case=pickup_case,
                pickup_path=pickup_path,
                dest_movement=dest_movement,
                detour_km=detour_km,
                G=G,
            )
        )

    # Prefer listing existing compatible movements before detours (stable for demos).
    case_rank = {"at_node": 0, "pass_through": 1, "detour": 2, "none": 3}
    candidates.sort(
        key=lambda c: (
            case_rank.get(c.pickup_case, 9),
            c.vehicle_to_pickup_km if c.vehicle_to_pickup_km is not None else 1e18,
            c.vehicle_number,
        )
    )
    return CandidateGenerationResult(candidates=candidates, skips=skips)
