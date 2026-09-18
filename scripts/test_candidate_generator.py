#!/usr/bin/env python3
"""
Route-aware piggyback candidate generation checks.

Covers:
  1. Vehicle already at misplaced hub          → at_node
  2. Vehicle route passes through pickup       → pass_through
  3. Vehicle requiring diversion               → detour
  4. Vehicle unable to reach pickup            → omitted
  5. Vehicle reaches pickup but misses deadline → deadline_feasible=False
  6. Shortest-path-only visit is NOT pass_through without an existing route

Usage:
  uv run python scripts/test_candidate_generator.py
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import networkx as nx

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from graph.candidate_generator import generate_candidates
from graph.recovery_context import GraphContext, RecoveryContext
from graph.shipment_state import LOCATION_STATE_VALID, ShipmentState
from graph.vehicle_state import VehicleState

PASS = "\033[92m✓\033[0m"
FAIL = "\033[91m✗\033[0m"
_failures = 0

HYD = "Hyd"
SID = "Siddipet"
WGL = "Warangal"
KRM = "Karimnagar"
NZB = "Nizamabad"
ISOLATED = "IsolatedHub"


def check(cond: bool, label: str) -> None:
    global _failures
    if cond:
        print(f"  {PASS} {label}")
    else:
        _failures += 1
        print(f"  {FAIL} {label}")


def _build_graph() -> nx.DiGraph:
    """
    Tiny Telangana-like digraph for unit tests.

      Hyd ──► Siddipet ──► Warangal ──► Karimnagar
       │                      ▲              ▲
       └────► Nizamabad ──────┴──────────────┘
    """
    G = nx.DiGraph()
    edges = [
        (HYD, SID, 80, 90),
        (SID, WGL, 70, 80),
        (WGL, KRM, 60, 70),
        (HYD, NZB, 100, 110),
        (NZB, WGL, 90, 100),
        (NZB, KRM, 120, 130),
        (HYD, WGL, 140, 150),
        (SID, KRM, 130, 140),
    ]
    for u, v, km, mins in edges:
        G.add_edge(u, v, avg_distance_km=km, avg_time_min=mins)
    G.add_node(ISOLATED)
    return G


def _shipment(*, deadline_hours: float = 12.0) -> ShipmentState:
    return ShipmentState(
        shipment_id="ship-1",
        tracking_number="SHP-CAND",
        status="misplaced",
        priority="high",
        deadline=datetime.now(tz=timezone.utc) + timedelta(hours=deadline_hours),
        weight=100.0,
        volume=1.0,
        package_count=1,
        fragile=False,
        special_handling=None,
        origin_name=HYD,
        destination_name=KRM,
        current_location_name=NZB,
        expected_location_name=SID,
        origin_node=HYD,
        destination_node=KRM,
        current_node=NZB,
        actual_node=NZB,
        expected_node=SID,
        planned_route_nodes=[HYD, SID, KRM],
        is_misplaced=True,
        needs_recovery=True,
        location_state=LOCATION_STATE_VALID,
        expected_from_route=True,
    )


def _vehicle(
    *,
    vid: str,
    number: str,
    current: str,
    route_nodes: list[str] | None = None,
    route_dest: str | None = None,
    route_id: str | None = None,
    route_code: str | None = None,
) -> VehicleState:
    nodes = list(route_nodes or [])
    dest = route_dest
    if dest is None and nodes:
        dest = nodes[-1]
    return VehicleState(
        vehicle_id=vid,
        vehicle_number=number,
        vehicle_type="truck",
        status="in_transit",
        capacity_weight=5000,
        capacity_volume=30,
        current_load_weight=500,
        current_load_volume=2,
        available_weight=4500,
        available_volume=28,
        current_location_id=None,
        current_location_name=current,
        current_node=current,
        current_route_id=route_id,
        destination_node=dest,
        route_code=route_code,
        route_nodes=nodes,
        driver_id=vid,
        driver_name=number,
    )


def _context(vehicles: list[VehicleState], shipment: ShipmentState | None = None) -> RecoveryContext:
    ship = shipment or _shipment()
    pickup = ship.actual_node
    dest = ship.destination_node
    return RecoveryContext(
        shipment=ship,
        current_node=pickup,
        destination_node=dest,
        relevant_vehicles=vehicles,
        relevant_routes=[],
        graph_context=GraphContext(
            current_node_in_graph=True,
            destination_node_in_graph=True,
            direct_path_exists=True,
            direct_path=[pickup, dest] if pickup and dest else [],
            direct_distance_km=120.0,
            direct_time_min=130.0,
            hop_count=1,
        ),
    )


def test_at_node() -> None:
    print("\nCase: vehicle already at misplaced hub → at_node")
    G = _build_graph()
    v = _vehicle(
        vid="v1",
        number="TRK-01",
        current=NZB,
        route_nodes=[NZB, KRM],
        route_id="r1",
        route_code="NZB-KRM",
    )
    cands = generate_candidates(G, _context([v]))
    check(len(cands) == 1, f"one candidate ({len(cands)})")
    c = cands[0]
    check(c.pickup_case == "at_node", f"pickup_case={c.pickup_case}")
    check(c.pickup_node == NZB, "pickup_node = actual misplaced hub")
    check(c.driver_name == "TRK-01", "driver_name from vehicle")
    check(c.existing_route_code == "NZB-KRM", "existing_route present")
    check(c.destination_node == KRM, "destination_node = shipment dest")
    check(c.capacity_feasible, "capacity_feasible")
    check(c.deadline_feasible is True, "deadline_feasible")


def test_pass_through_on_existing_route() -> None:
    print("\nCase: existing route passes through pickup → pass_through")
    G = _build_graph()
    # Vehicle at Hyd on route Hyd → Nizamabad → Karimnagar
    v = _vehicle(
        vid="v2",
        number="TRK-PASS",
        current=HYD,
        route_nodes=[HYD, NZB, KRM],
        route_id="r2",
        route_code="HYD-NZB-KRM",
    )
    cands = generate_candidates(G, _context([v]))
    check(len(cands) == 1, "one candidate")
    c = cands[0]
    check(c.pickup_case == "pass_through", f"pickup_case={c.pickup_case}")
    check(NZB in c.existing_route_nodes, "pickup on existing_route_nodes")
    check(c.pickup_path[0] == HYD and c.pickup_path[-1] == NZB, "pickup_path along route")
    check(NZB in c.destination_path and c.destination_path[-1] == KRM, "movement continues to dest")
    check(c.detour_distance_km == 0.0, "no detour distance for pass_through")


def test_detour_when_route_misses_pickup() -> None:
    print("\nCase: route misses pickup → detour")
    G = _build_graph()
    # TRK-03 style: Hyd → Warangal → Karimnagar (must divert to Nizamabad)
    v = _vehicle(
        vid="v3",
        number="TRK-03",
        current=HYD,
        route_nodes=[HYD, WGL, KRM],
        route_id="r3",
        route_code="HYD-WGL-KRM",
    )
    cands = generate_candidates(G, _context([v]))
    check(len(cands) == 1, "one candidate")
    c = cands[0]
    check(c.pickup_case == "detour", f"pickup_case={c.pickup_case}")
    check(c.pickup_path[0] == HYD and c.pickup_path[-1] == NZB, "detour pickup_path")
    check(c.destination_path[0] == NZB and c.destination_path[-1] == KRM, "then to dest")
    check(
        c.detour_distance_km is not None and c.detour_distance_km > 0,
        f"detour_distance_km={c.detour_distance_km}",
    )
    check(c.existing_route_code == "HYD-WGL-KRM", "still records existing route")


def test_shortest_path_alone_is_not_pass_through() -> None:
    print("\nCase: mathematical V→pickup→dest without route is detour, not pass_through")
    G = _build_graph()
    # No currentRoute — shortest Hyd→… may visit NZB en route to KRM, but that
    # is NOT an existing piggyback movement.
    v = _vehicle(vid="v4", number="TRK-NOROUTE", current=HYD, route_nodes=[])
    cands = generate_candidates(G, _context([v]))
    check(len(cands) == 1, "still a candidate via detour reachability")
    check(cands[0].pickup_case == "detour", f"pickup_case={cands[0].pickup_case} (not pass_through)")


def test_unable_to_reach_pickup() -> None:
    print("\nCase: unable to reach pickup → omitted")
    G = _build_graph()
    v = _vehicle(
        vid="v5",
        number="TRK-STUCK",
        current=ISOLATED,
        route_nodes=[ISOLATED, KRM],
        route_dest=KRM,
    )
    # Isolated hub has no edges — cannot reach NZB
    cands = generate_candidates(G, _context([v]))
    check(len(cands) == 0, "no candidates when pickup unreachable")


def test_deadline_miss_still_emitted() -> None:
    print("\nCase: reaches pickup but misses deadline → deadline_feasible=False")
    G = _build_graph()
    v = _vehicle(
        vid="v6",
        number="TRK-LATE",
        current=HYD,
        route_nodes=[HYD, WGL, KRM],
        route_id="r6",
        route_code="HYD-WGL-KRM",
    )
    # Extremely tight deadline (1 minute) — travel needs hours
    ship = _shipment(deadline_hours=1 / 60)
    cands = generate_candidates(G, _context([v], shipment=ship))
    check(len(cands) == 1, "candidate still generated for scorer")
    check(cands[0].deadline_feasible is False, "deadline_feasible = False")
    check(cands[0].pickup_case == "detour", "classified as detour")


def test_mixed_priority_order() -> None:
    print("\nCase: prefer at_node / pass_through listing before detour")
    G = _build_graph()
    vehicles = [
        _vehicle(
            vid="vd",
            number="TRK-DETOUR",
            current=HYD,
            route_nodes=[HYD, WGL, KRM],
            route_code="DET",
        ),
        _vehicle(
            vid="va",
            number="TRK-AT",
            current=NZB,
            route_nodes=[NZB, KRM],
            route_code="AT",
        ),
        _vehicle(
            vid="vp",
            number="TRK-PASS",
            current=HYD,
            route_nodes=[HYD, NZB, KRM],
            route_code="PASS",
        ),
    ]
    cands = generate_candidates(G, _context(vehicles))
    cases = [c.pickup_case for c in cands]
    check(cases == ["at_node", "pass_through", "detour"], f"order={cases}")
    check(all(c.pickup_node == NZB for c in cands), "all pickups = actual node")


def main() -> int:
    print("=" * 62)
    print("  route-aware piggyback candidate generation")
    print("=" * 62)
    test_at_node()
    test_pass_through_on_existing_route()
    test_detour_when_route_misses_pickup()
    test_shortest_path_alone_is_not_pass_through()
    test_unable_to_reach_pickup()
    test_deadline_miss_still_emitted()
    test_mixed_priority_order()
    print()
    if _failures:
        print(f"{_failures} failure(s)")
        return 1
    print("All checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
