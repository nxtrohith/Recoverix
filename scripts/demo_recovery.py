#!/usr/bin/env python3
"""
Demo: Shipment state + Vehicle state + Recovery candidate generation.

Usage
-----
  uv run python scripts/demo_recovery.py
  uv run python scripts/demo_recovery.py <shipment_id_or_tracking_number>

If the shipments collection is empty (as in the current prototype stage),
the script uses a synthetic in-memory ShipmentState built from real graph
nodes and queries real vehicles from MongoDB so the full pipeline runs.

Pipeline demonstrated
---------------------
  MongoDB → NetworkX graph
           → ShipmentState   (where is it? where does it need to go?)
           → VehicleState    (which vehicles are active and capable?)
           → RecoveryContext (graph-aware assembly)
           → RecoveryCandidates (raw piggyback opportunities)
           → scoring / optimizer  (see scripts/demo_scoring.py)
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from graph.graph_builder import build_graph, connect_mongo
from graph.shipment_state import ShipmentState, get_shipment_state
from graph.vehicle_state import filter_capable_vehicles, get_active_vehicles
from graph.recovery_context import get_recovery_context, get_recovery_context_from_state
from graph.candidate_generator import RecoveryCandidate, generate_candidates


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _section(title: str) -> None:
    print(f"\n{'='*62}")
    print(f"  {title}")
    print("=" * 62)


def _fmt_km(v: float | None) -> str:
    return f"{v:.1f} km" if v is not None else "N/A"


def _fmt_min(v: float | None) -> str:
    if v is None:
        return "N/A"
    h, m = divmod(int(v), 60)
    return f"{h}h {m}m" if h else f"{m}m"


def _mock_shipment(G) -> ShipmentState:
    """
    Build a synthetic misplaced shipment using real graph nodes.

    Demonstrates expected ≠ actual: planned next hub vs last-confirmed hub.
    """
    nodes = list(G.nodes())
    if len(nodes) < 2:
        raise RuntimeError("Graph has fewer than 2 nodes — cannot mock shipment.")

    import networkx as nx

    # Prefer the demo narrative hubs when present in the graph.
    hyd = "Hyderabad_Shamshbd_H (Telangana)"
    expected = "Medchal_MROoffce_D (Telangana)"
    dest = "Karimnagar_KamnHbRD_I (Telangana)"
    actual = "Kamareddy_Devenply_I (Telangana)"

    if all(n in G for n in (hyd, expected, dest, actual)):
        origin_node, expected_node, destination_node, current_node = (
            hyd,
            expected,
            dest,
            actual,
        )
        planned = [hyd, expected, dest]
    else:
        current_node = nodes[0]
        destination_node = nodes[-1]
        for src in nodes[:10]:
            for dst in reversed(nodes[-10:]):
                if src != dst:
                    try:
                        path = nx.shortest_path(G, src, dst, weight="avg_distance_km")
                        if len(path) >= 2:
                            current_node = src
                            destination_node = dst
                            break
                    except (nx.NetworkXNoPath, nx.NodeNotFound):
                        continue
                break
        origin_node = current_node
        expected_node = destination_node
        planned = [origin_node, destination_node]
        # Force a mismatch for the mock when possible
        for alt in nodes:
            if alt not in (origin_node, destination_node) and alt in G:
                current_node = alt
                break

    return ShipmentState(
        shipment_id="MOCK-SHIPMENT-001",
        tracking_number="MOCK-TRK-001",
        status="misplaced",
        priority="high",
        deadline=datetime.now(tz=timezone.utc) + timedelta(hours=18),
        weight=300.0,       # kg — fits most trucks
        volume=1.5,         # m³
        package_count=3,
        fragile=False,
        special_handling=None,
        origin_name=origin_node,
        destination_name=destination_node,
        current_location_name=current_node,
        expected_location_name=expected_node,
        origin_node=origin_node,
        destination_node=destination_node,
        current_node=current_node,
        actual_node=current_node,
        expected_node=expected_node,
        planned_route_nodes=planned,
        latest_event_type="misplaced",
        latest_event_time=datetime.now(tz=timezone.utc),
        is_misplaced=True,
        is_delayed=False,
        needs_recovery=True,
        expected_from_route=True,
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    identifier = sys.argv[1] if len(sys.argv) > 1 else None

    # ------------------------------------------------------------------
    # 1. Connect and build graph
    # ------------------------------------------------------------------
    print("Connecting to MongoDB...")
    db = connect_mongo()

    print("Building NetworkX graph from telangana_nodes + telangana_edges...")
    G, report = build_graph(db)
    print(
        f"  Graph: {report.node_count} nodes, {report.edge_count} edges"
        + (f", {report.skipped_edges} skipped edges" if report.skipped_edges else "")
    )
    if report.errors:
        print(f"  ERRORS: {report.errors[:3]}")

    # ------------------------------------------------------------------
    # 2. Shipment state
    # ------------------------------------------------------------------
    shipment: ShipmentState | None = None
    using_mock = False

    if identifier:
        print(f"\nLooking up shipment: {identifier!r}")
        shipment = get_shipment_state(db, identifier)
        if shipment is None:
            print(f"  Not found: {identifier!r}")

    if shipment is None:
        # Try any misplaced/delayed shipment in the DB.
        doc = db["shipments"].find_one({"status": {"$in": ["misplaced", "delayed"]}})
        if doc:
            shipment = get_shipment_state(db, str(doc["_id"]))
            print(f"\nFound misplaced/delayed shipment: {doc.get('trackingNumber')}")

    if shipment is None:
        # Fall back to any shipment.
        doc = db["shipments"].find_one()
        if doc:
            shipment = get_shipment_state(db, str(doc["_id"]))
            if shipment:
                print(f"\nUsing first available shipment: {shipment.tracking_number}")

    if shipment is None:
        print("\nShipments collection is empty — using synthetic in-memory shipment.")
        shipment = _mock_shipment(G)
        using_mock = True

    _section("SHIPMENT STATE" + ("  [MOCK]" if using_mock else ""))
    print(f"  ID               : {shipment.shipment_id}")
    print(f"  Tracking         : {shipment.tracking_number}")
    print(f"  Status           : {shipment.status}")
    print(f"  Priority         : {shipment.priority}")
    print(f"  Deadline         : {shipment.deadline}")
    print(f"  Weight / Volume  : {shipment.weight} kg / {shipment.volume} m³")
    print(f"  Fragile          : {shipment.fragile}")
    print(f"  Current location : {shipment.current_location_name}")
    print(f"  Actual node      : {shipment.actual_node}")
    print(f"  Expected node    : {shipment.expected_node}")
    if shipment.planned_route_nodes:
        print(f"  Planned route    : {' → '.join(shipment.planned_route_nodes)}")
    print(f"  Destination      : {shipment.destination_name}")
    print(f"  Destination node : {shipment.destination_node}")
    print(f"  Is misplaced     : {shipment.is_misplaced}")
    print(f"  Is delayed       : {shipment.is_delayed}")
    print(f"  Needs recovery   : {shipment.needs_recovery}")
    if shipment.latest_event_type:
        print(f"  Latest event     : {shipment.latest_event_type}  @  {shipment.latest_event_time}")

    # ------------------------------------------------------------------
    # 3. Vehicle state
    # ------------------------------------------------------------------
    _section("VEHICLE STATE")
    print("  Querying active vehicles from MongoDB...")
    all_active = get_active_vehicles(db)
    capable = filter_capable_vehicles(all_active, shipment.weight, shipment.volume)
    with_node = [v for v in capable if v.current_node is not None]

    print(f"  Total active vehicles    : {len(all_active)}")
    print(f"  Capacity-fit vehicles    : {len(capable)}")
    print(f"  With graph node          : {len(with_node)}")

    if with_node:
        print(f"\n  Sample (up to 5):")
        for v in with_node[:5]:
            print(
                f"    [{v.vehicle_number}] {v.vehicle_type:<10}  "
                f"@ {v.current_node:<35}  "
                f"avail: {v.available_weight:.0f} kg / {v.available_volume:.1f} m³  "
                f"status: {v.status}"
            )
        if len(with_node) > 5:
            print(f"    ... and {len(with_node) - 5} more")

    # ------------------------------------------------------------------
    # 4. Recovery context (graph integration)
    # ------------------------------------------------------------------
    _section("GRAPH CONTEXT")
    curr_in_graph = (
        shipment.current_node is not None and shipment.current_node in G
    )
    dest_in_graph = (
        shipment.destination_node is not None and shipment.destination_node in G
    )
    print(f"  current_node     : {shipment.current_node!r}")
    print(f"    → in graph     : {curr_in_graph}")
    print(f"  destination_node : {shipment.destination_node!r}")
    print(f"    → in graph     : {dest_in_graph}")

    import networkx as nx

    if curr_in_graph and dest_in_graph:
        try:
            path = nx.shortest_path(
                G, shipment.current_node, shipment.destination_node,
                weight="avg_distance_km",
            )
            dist = nx.path_weight(G, path, "avg_distance_km")
            try:
                t = nx.path_weight(G, path, "avg_time_min")
                time_str = _fmt_min(t)
            except Exception:
                time_str = "N/A"
            print(
                f"\n  Direct path      : {len(path) - 1} hops  "
                f"| {_fmt_km(dist)}  | ~{time_str}"
            )
            print(f"  Path             : {' → '.join(path)}")
        except nx.NetworkXNoPath:
            print("\n  Direct path      : NO PATH EXISTS in graph")
    else:
        print("\n  Cannot compute path (one or both nodes not in graph)")

    # ------------------------------------------------------------------
    # 5. Candidate generation
    # ------------------------------------------------------------------
    _section("RECOVERY CANDIDATES")

    context = get_recovery_context_from_state(db, G, shipment)
    print(f"  Relevant vehicles : {len(context.relevant_vehicles)}")
    print(f"  Relevant routes   : {len(context.relevant_routes)}")

    if context.relevant_routes:
        print("\n  Routes at current hub:")
        for r in context.relevant_routes[:3]:
            print(
                f"    [{r['route_code']}] {r['status']}  "
                f"dep: {r['scheduled_departure']}  "
                f"avail: {r['available_weight']:.0f} kg"
            )

    candidates = generate_candidates(G, context)
    print(f"\n  Candidates generated : {len(candidates)}")

    if not candidates:
        print(
            "\n  No candidates found.\n"
            "  This is expected when:\n"
            "    • No active vehicles have a graph-connected location, OR\n"
            "    • No vehicle can reach the destination from its current node.\n"
            "  Check that Location.graphNodeKey is populated and matches"
            " telangana_nodes.hub_name."
        )
    else:
        # Summarise by pickup_case
        from collections import Counter
        cases = Counter(c.pickup_case for c in candidates)
        feasible = sum(1 for c in candidates if c.capacity_feasible)
        deadline_ok = sum(1 for c in candidates if c.deadline_feasible is True)
        print(f"  By pickup type    : {dict(cases)}")
        print(f"  Capacity-feasible : {feasible}")
        print(f"  Deadline-feasible : {deadline_ok}")

        # Show top 5 by estimated travel time (ascending)
        sorted_cands = sorted(
            candidates,
            key=lambda c: (c.estimated_total_min or float("inf")),
        )

        print(f"\n  Top candidates (sorted by estimated travel time):")
        for i, c in enumerate(sorted_cands[:5], 1):
            print(f"\n  ── Candidate #{i} ────────────────────────────────────")
            print(f"     Vehicle        : {c.vehicle_number} ({c.vehicle_type})")
            print(f"     Pickup case    : {c.pickup_case}")
            print(f"     Vehicle node   : {c.vehicle_current_node}")
            print(f"     Shipment node  : {c.shipment_current_node}")
            print(f"     Destination    : {c.destination_node}")
            print(
                f"     To pickup      : {_fmt_km(c.vehicle_to_pickup_km)}"
                f"  ~{_fmt_min(c.vehicle_to_pickup_min)}"
            )
            print(
                f"     To destination : {_fmt_km(c.vehicle_to_destination_km)}"
                f"  ~{_fmt_min(c.vehicle_to_destination_min)}"
            )
            print(
                f"     Total          : ~{_fmt_min(c.estimated_total_min)}"
                f"  |  est. delivery: {c.estimated_delivery_at}"
            )
            print(
                f"     Capacity OK    : {c.capacity_feasible}"
                f"  ({c.available_weight:.0f} kg / {c.available_volume:.1f} m³ avail)"
            )
            print(f"     Deadline OK    : {c.deadline_feasible}")
            if len(c.vehicle_to_destination_path) <= 8:
                print(
                    f"     Route          : {' → '.join(c.vehicle_to_destination_path)}"
                )
            else:
                head = c.vehicle_to_destination_path[:3]
                tail = c.vehicle_to_destination_path[-2:]
                print(
                    f"     Route          : {' → '.join(head)} → … → {' → '.join(tail)}"
                    f"  ({len(c.vehicle_to_destination_path)-1} hops)"
                )

    # ------------------------------------------------------------------
    # 6. Hand-off to scoring engine
    # ------------------------------------------------------------------
    _section("NEXT: SCORING ENGINE")
    print("  Candidates are ready for score_recovery_candidates().")
    print("  Run:  uv run python scripts/demo_scoring.py")
    print(f"  shipment_id     : {shipment.shipment_id}")
    print(f"  candidate_count : {len(candidates)}")


if __name__ == "__main__":
    main()
