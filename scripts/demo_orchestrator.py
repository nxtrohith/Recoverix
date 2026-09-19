#!/usr/bin/env python3
"""
Demo: end-to-end Recovery Orchestrator (Recoverix).

Usage
-----
  uv run python scripts/demo_orchestrator.py
  uv run python scripts/demo_orchestrator.py <shipment_id_or_tracking_number>
  uv run python scripts/demo_orchestrator.py --json

Does NOT insert fake data into MongoDB.  If shipments are empty, runs an
in-memory mock through RecoveryOrchestrator.analyze_from_state().
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from graph.graph_cache import get_db, get_graph
from graph.recovery_orchestrator import (
    RecoveryError,
    RecoveryOrchestrator,
    analyze_shipment_recovery,
    print_recovery_summary,
)
from graph.shipment_state import ShipmentState


def _mock_shipment(G) -> ShipmentState:
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


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--json"]
    dump_json = "--json" in sys.argv
    identifier = args[0] if args else None

    print("Warming graph cache...")
    cached = get_graph()
    print(f"  Graph: {cached.report.node_count} nodes, {cached.report.edge_count} edges")

    db = get_db()
    orchestrator = RecoveryOrchestrator()
    result = None

    if identifier:
        try:
            result = analyze_shipment_recovery(identifier)
        except RecoveryError as exc:
            print(f"ERROR [{exc.code}]: {exc.message}")
            sys.exit(1)
    else:
        doc = db["shipments"].find_one(
            {"status": {"$in": ["misplaced", "delayed"]}}
        ) or db["shipments"].find_one()
        if doc:
            sid = str(doc["_id"])
            print(f"Using shipment from MongoDB: {sid}")
            try:
                result = analyze_shipment_recovery(sid)
            except RecoveryError as exc:
                print(f"ERROR [{exc.code}]: {exc.message}")
                sys.exit(1)
        else:
            print(
                "Shipments collection is empty — "
                "running in-memory mock (MongoDB not modified)."
            )
            result = orchestrator.analyze_from_state(_mock_shipment(cached.graph))
            result["_mock"] = True

    print_recovery_summary(result)

    if dump_json:
        print("\n--- JSON ---")
        printable = {k: v for k, v in result.items() if not str(k).startswith("_")}
        print(json.dumps(printable, indent=2, default=str))


if __name__ == "__main__":
    main()
