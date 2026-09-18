"""Simple graph queries for future recovery logic."""

from __future__ import annotations

from typing import Any

import networkx as nx


def shortest_path(
    G: nx.DiGraph,
    source: str,
    destination: str,
    weight: str = "avg_distance_km",
) -> list[str]:
    """
    Shortest path between two hubs.

    Pass weight explicitly: "avg_distance_km" | "avg_time_min"
    (cost is not in the DB yet). NetworkX uses the named edge attribute.
    """
    return nx.shortest_path(G, source, destination, weight=weight)


def shortest_path_details(
    G: nx.DiGraph,
    source: str,
    destination: str,
    weight: str = "avg_distance_km",
) -> dict[str, Any]:
    """Path plus total weight along that path."""
    path = nx.shortest_path(G, source, destination, weight=weight)
    total = nx.path_weight(G, path, weight=weight)
    return {
        "source": source,
        "destination": destination,
        "weight_attr": weight,
        "path": path,
        "total_weight": total,
        "hop_count": len(path) - 1,
    }


def get_neighbors(G: nx.DiGraph, node_id: str) -> dict[str, list[str]]:
    """Outgoing (successors) and incoming (predecessors) neighbors."""
    if node_id not in G:
        raise KeyError(f"Unknown node: {node_id}")
    return {
        "successors": list(G.successors(node_id)),
        "predecessors": list(G.predecessors(node_id)),
    }


def get_node_connectivity(G: nx.DiGraph, node_id: str) -> dict[str, int]:
    """In-degree, out-degree, and total degree for a node."""
    if node_id not in G:
        raise KeyError(f"Unknown node: {node_id}")
    return {
        "in_degree": G.in_degree(node_id),
        "out_degree": G.out_degree(node_id),
        "degree": G.degree(node_id),
    }
