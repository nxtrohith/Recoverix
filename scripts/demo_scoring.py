#!/usr/bin/env python3
"""
Demo: Recovery scoring / optimization engine (SH-205).

Usage
-----
  uv run python scripts/demo_scoring.py
  uv run python scripts/demo_scoring.py <shipment_id_or_tracking_number>

Pipeline
--------
  MongoDB → NetworkX graph
           → ShipmentState
           → RecoveryContext
           → RecoveryCandidates
           → Feasibility filter
           → Weighted scoring
           → Selected recovery option + explanation

Does NOT insert fake data into MongoDB.  If shipments are empty, uses an
in-memory mock shipment (same approach as demo_recovery.py).
"""

from __future__ import annotations

import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from graph.graph_builder import build_graph, connect_mongo
from graph.shipment_state import ShipmentState, get_shipment_state
from graph.recovery_context import get_recovery_context_from_state
from graph.candidate_generator import generate_candidates
from graph.recovery_scorer import (
    DEFAULT_WEIGHTS,
    load_route_baselines,
    score_recovery_candidates,
)


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
    """Synthetic misplaced shipment: expected hub ≠ actual recovery hub."""
    import networkx as nx

    nodes = list(G.nodes())
    if len(nodes) < 2:
        raise RuntimeError("Graph has fewer than 2 nodes — cannot mock shipment.")

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
                if src == dst:
                    continue
                try:
                    path = nx.shortest_path(G, src, dst, weight="avg_distance_km")
                    if len(path) >= 2:
                        current_node = src
                        destination_node = dst
                        break
                except (nx.NetworkXNoPath, nx.NodeNotFound):
                    continue
            else:
                continue
            break
        origin_node = current_node
        expected_node = destination_node
        planned = [origin_node, destination_node]
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
        weight=300.0,
        volume=1.5,
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


def _resolve_shipment(db, G, identifier: str | None):
    shipment = None
    using_mock = False

    if identifier:
        shipment = get_shipment_state(db, identifier)
        if shipment is None:
            print(f"  Not found: {identifier!r}")

    if shipment is None:
        doc = db["shipments"].find_one({"status": {"$in": ["misplaced", "delayed"]}})
        if doc:
            shipment = get_shipment_state(db, str(doc["_id"]))

    if shipment is None:
        doc = db["shipments"].find_one()
        if doc:
            shipment = get_shipment_state(db, str(doc["_id"]))

    if shipment is None:
        print("Shipments collection is empty — using synthetic in-memory shipment.")
        shipment = _mock_shipment(G)
        using_mock = True

    return shipment, using_mock


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    identifier = sys.argv[1] if len(sys.argv) > 1 else None

    print("Connecting to MongoDB...")
    db = connect_mongo()

    print("Building NetworkX graph...")
    G, report = build_graph(db)
    print(f"  Graph: {report.node_count} nodes, {report.edge_count} edges")

    # ------------------------------------------------------------------
    # 1–2. Load shipment + generate candidates
    # ------------------------------------------------------------------
    shipment, using_mock = _resolve_shipment(db, G, identifier)

    _section("SHIPMENT" + ("  [MOCK]" if using_mock else ""))
    print(f"  ID          : {shipment.shipment_id}")
    print(f"  Tracking    : {shipment.tracking_number}")
    print(f"  Priority    : {shipment.priority}")
    print(f"  Deadline    : {shipment.deadline}")
    print(f"  Current     : {shipment.current_node}")
    print(f"  Expected    : {shipment.expected_node}")
    print(f"  Actual      : {shipment.actual_node}")
    print(f"  Destination : {shipment.destination_node}")
    print(f"  Weight/Vol  : {shipment.weight} kg / {shipment.volume} m³")

    context = get_recovery_context_from_state(db, G, shipment)
    candidates = generate_candidates(G, context)

    _section("CANDIDATE GENERATION")
    print(f"  Relevant vehicles : {len(context.relevant_vehicles)}")
    print(f"  Candidates        : {len(candidates)}")
    if candidates:
        print(f"  By pickup type    : {dict(Counter(c.pickup_case for c in candidates))}")

    # ------------------------------------------------------------------
    # 3. Route baselines for detour (only when DB has the data)
    # ------------------------------------------------------------------
    vehicle_ids = [c.vehicle_id for c in candidates]
    baselines = load_route_baselines(db, vehicle_ids)

    _section("ROUTE BASELINES (for detour)")
    print(f"  Vehicles with normal-route data : {len(baselines)} / {len(set(vehicle_ids))}")
    print(
        "  Detour metric is marked unavailable when a vehicle has no\n"
        "  currentRoute / distanceKm — the scorer does not invent routes."
    )

    # ------------------------------------------------------------------
    # 4–6. Feasibility + scoring + selection
    # ------------------------------------------------------------------
    _section("SCORING WEIGHTS")
    for k, v in DEFAULT_WEIGHTS.items():
        print(f"  {k:<14}: {v:.2f}")
    print("  (edit graph.recovery_scorer.DEFAULT_WEIGHTS to retune)")

    result = score_recovery_candidates(
        G,
        candidates,
        weights=DEFAULT_WEIGHTS,
        route_baselines=baselines,
    )

    feasible = [c for c in result.candidates if c.feasible]
    rejected = [c for c in result.candidates if not c.feasible]

    _section("FEASIBILITY FILTER")
    print(f"  Feasible : {len(feasible)}")
    print(f"  Rejected : {len(rejected)}")
    if rejected:
        reasons = Counter(c.rejection_reason for c in rejected)
        for reason, count in reasons.most_common():
            print(f"    • {reason}: {count}")

    _section("SCORED CANDIDATES")
    if not result.candidates:
        print("  (none)")
    else:
        show = result.candidates[:8]
        for i, c in enumerate(show, 1):
            print(f"\n  ── #{i}  {c.candidate_id}")
            print(f"     Vehicle     : {c.vehicle_number} ({c.pickup_case})")
            print(f"     Feasible    : {c.feasible}")
            if not c.feasible:
                print(f"     Rejected    : {c.rejection_reason}")
                continue
            print(f"     Score       : {c.score:.4f}")
            if c.breakdown:
                b = c.breakdown
                print(
                    "     Breakdown   : "
                    f"time={b.time:.2f}  cost={b.cost:.2f}  "
                    f"capacity={b.capacity:.2f}  deadline={b.deadline:.2f}"
                )
                print(
                    "                   "
                    f"priority={b.priority:.2f}  detour={b.detour:.2f}  "
                    f"connectivity={b.connectivity:.2f}"
                )
            if c.metrics:
                m = c.metrics
                cost_str = f"  cost≈{m.cost:.0f} INR" if m.cost is not None else ""
                print(
                    f"     Metrics     : {_fmt_km(m.distance_km)}  "
                    f"~{_fmt_min(m.travel_time_min)}{cost_str}"
                )
                buf = (
                    f"{int(m.deadline_buffer_min)} min"
                    if m.deadline_buffer_min is not None
                    else "N/A"
                )
                detour = (
                    f"{m.detour_distance_km:.1f} km"
                    if m.detour_available and m.detour_distance_km is not None
                    else "unavailable"
                )
                print(f"     Deadline buf: {buf}")
                print(f"     Detour      : {detour}")
                print(
                    f"     Connectivity: degree={m.connectivity_degree}  "
                    f"centrality={m.connectivity_centrality}"
                )
            print(f"     Helped      : {', '.join(c.factors_helped) or '—'}")
            print(f"     Hurt        : {', '.join(c.factors_hurt) or '—'}")
            print(f"     Explanation : {c.explanation}")
        if len(result.candidates) > len(show):
            print(f"\n  … and {len(result.candidates) - len(show)} more candidates")

    _section("SELECTED RECOVERY OPTION")
    if result.selected_option is None:
        print("  selectedOption = null")
        print(f"  {result.selection_explanation}")
    else:
        sel = result.selected_option
        print(f"  Vehicle     : {sel.vehicle_number} ({sel.vehicle_id})")
        print(f"  Score       : {sel.score:.4f}")
        print(f"  Pickup case : {sel.pickup_case}")
        if sel.path:
            if len(sel.path) <= 8:
                print(f"  Path        : {' → '.join(sel.path)}")
            else:
                print(
                    f"  Path        : {' → '.join(sel.path[:3])} → … → "
                    f"{' → '.join(sel.path[-2:])}  ({len(sel.path)-1} hops)"
                )
        print(f"\n  Why selected:\n  {result.selection_explanation}")

    # ------------------------------------------------------------------
    # Persistence note (no auto-write)
    # ------------------------------------------------------------------
    _section("PERSISTENCE NOTE")
    print(
        "  MongoDB collections inspected:\n"
        "    • recovery_candidates — DOES NOT EXIST as a collection\n"
        "      (only data/recovery_candidates.json sample file)\n"
        "    • recoveryoptions — EXISTS (Mongoose RecoveryOption), currently empty\n"
        "\n"
        "  Schema mismatch vs this scoring layer:\n"
        "    RecoveryOption.scores has: cost, deliveryTime, capacity,\n"
        "      deadline, priority, resourceUtilization\n"
        "    This engine produces: time, cost, capacity, deadline,\n"
        "      priority, detour, connectivity\n"
        "\n"
        "  → Not auto-persisting. Map fields (or extend the schema) before\n"
        "    writing scored options back to MongoDB."
    )


if __name__ == "__main__":
    main()
