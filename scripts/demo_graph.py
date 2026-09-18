#!/usr/bin/env python3
"""Demo: MongoDB → NetworkX Telangana logistics graph."""

from __future__ import annotations

import sys
from pathlib import Path

# Allow running without installing the package: python scripts/demo_graph.py
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from graph.graph_builder import build_graph, connect_mongo
from graph.graph_metrics import summary, top_hubs
from graph.graph_queries import shortest_path_details


def main() -> None:
    print("Connecting to MongoDB...")
    db = connect_mongo()

    print("Building graph from telangana_nodes + telangana_edges...")
    G, report = build_graph(db)

    print("\n=== Validation ===")
    print(f"Nodes: {report.node_count}")
    print(f"Edges: {report.edge_count}")
    print(f"Skipped edges: {report.skipped_edges}")
    if report.errors:
        print("Errors:")
        for e in report.errors:
            print(f"  - {e}")
    if report.warnings:
        print(f"Warnings: {len(report.warnings)}")
        for w in report.warnings[:10]:
            print(f"  - {w}")
        if len(report.warnings) > 10:
            print(f"  ... and {len(report.warnings) - 10} more")

    stats = summary(G)
    print("\n=== Graph summary ===")
    print(f"Node count: {stats['node_count']}")
    print(f"Edge count: {stats['edge_count']}")
    print(f"Weakly connected components: {stats['weakly_connected_components']}")
    print(f"Strongly connected components: {stats['strongly_connected_components']}")
    print(f"Largest weak component size: {stats['largest_weak_component_size']}")

    hubs = top_hubs(G, n=5)
    print("\n=== Top 5 most-connected nodes ===")
    for name, deg in hubs:
        print(f"  {name}: degree {deg}")

    # Pick a real edge's endpoints for a guaranteed reachable demo when possible
    print("\n=== Shortest path demo (weight=avg_distance_km) ===")
    if G.number_of_edges() == 0:
        print("No edges — cannot demo path.")
        return

    source, dest, _ = next(iter(G.edges(data=True)))
    # Prefer a multi-hop path if we can find one between top hubs
    if len(hubs) >= 2:
        candidate_src, candidate_dst = hubs[0][0], hubs[1][0]
        try:
            details = shortest_path_details(
                G, candidate_src, candidate_dst, weight="avg_distance_km"
            )
            source, dest = candidate_src, candidate_dst
        except Exception:
            details = shortest_path_details(G, source, dest, weight="avg_distance_km")
    else:
        details = shortest_path_details(G, source, dest, weight="avg_distance_km")

    print(f"From: {details['source']}")
    print(f"To:   {details['destination']}")
    print(f"Hops: {details['hop_count']}")
    print(f"Total {details['weight_attr']}: {details['total_weight']:.2f}")
    print("Path:")
    for i, node in enumerate(details["path"]):
        print(f"  {i}. {node}")


if __name__ == "__main__":
    main()
