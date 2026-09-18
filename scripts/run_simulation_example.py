#!/usr/bin/env python3
"""Standalone example: Build graph from MongoDB, simulate truck routes with SimPy, and print JSON events."""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Add project root to sys.path so graph and backend packages are importable
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from backend.simulation import EventType, Truck, run_simulation
from graph.graph_builder import build_graph, connect_mongo


def main() -> None:
    print("1. Loading graph using existing graph builder...")
    try:
        db = connect_mongo()
        G, report = build_graph(db)
        print(f"   Successfully loaded graph: {report.node_count} nodes, {report.edge_count} edges.")
    except Exception as exc:
        print(f"   Notice: Could not connect to MongoDB ({exc}).")
        print("   Using local fallback graph for standalone demonstration...")
        import networkx as nx

        G = nx.DiGraph()
        G.add_node("HYD", hub_name="HYD", city="Hyderabad")
        G.add_node("WAR", hub_name="WAR", city="Warangal")
        G.add_node("KRM", hub_name="KRM", city="Karimnagar")
        G.add_edge("HYD", "WAR", avg_time_min=120.0, avg_distance_km=145.0)
        G.add_edge("WAR", "KRM", avg_time_min=80.0, avg_distance_km=75.0)

    # 2. Select route from the graph
    # If edges exist in G, pick real routes from edges
    if G.number_of_edges() >= 2:
        edges_list = list(G.edges())
        # Truck 1: edge 0
        u1, v1 = edges_list[0]
        # Look for a 2-hop route if possible
        v1_neighbors = list(G.successors(v1))
        if v1_neighbors:
            route_1 = [u1, v1, v1_neighbors[0]]
        else:
            route_1 = [u1, v1]

        # Truck 2: edge 1 (or another edge)
        u2, v2 = edges_list[1]
        route_2 = [u2, v2]
    else:
        route_1 = ["HYD", "WAR", "KRM"]
        route_2 = ["WAR", "KRM"]

    print(f"\n2. Configuring sample trucks:")
    print(f"   Truck 1 route: {' -> '.join(route_1)}")
    print(f"   Truck 2 route: {' -> '.join(route_2)}")

    trucks = [
        Truck(
            truck_id="TRUCK_101",
            shipment_id="SHIP_001",
            route=route_1,
            start_time=0.0,
            delays=[
                {"at_node": route_1[0], "duration": 15.0, "reason": "Dock loading delay"}
            ] if len(route_1) > 1 else [],
        ),
        Truck(
            truck_id="TRUCK_202",
            shipment_id="SHIP_002",
            route=route_2,
            start_time=30.0,  # Departs 30 minutes after simulation start
        ),
    ]

    print("\n3. Running SimPy simulation...")
    events = run_simulation(graph=G, trucks=trucks)
    print(f"   Simulation completed with {len(events)} events emitted.")

    print("\n4. Simulation Events (JSON):")
    json_output = json.dumps(events, indent=2)
    print(json_output)


if __name__ == "__main__":
    main()
