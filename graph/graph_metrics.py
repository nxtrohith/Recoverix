"""Lightweight NetworkX metrics for the Telangana logistics graph."""

from __future__ import annotations

from typing import Any

import networkx as nx


def summary(G: nx.DiGraph) -> dict[str, Any]:
    """Node/edge counts and connected-component info."""
    weak = list(nx.weakly_connected_components(G))
    strong = list(nx.strongly_connected_components(G))
    return {
        "node_count": G.number_of_nodes(),
        "edge_count": G.number_of_edges(),
        "weakly_connected_components": len(weak),
        "strongly_connected_components": len(strong),
        "largest_weak_component_size": max((len(c) for c in weak), default=0),
        "largest_strong_component_size": max((len(c) for c in strong), default=0),
    }


def top_hubs(G: nx.DiGraph, n: int = 5) -> list[tuple[str, int]]:
    """Most-connected nodes by total degree (in + out)."""
    return sorted(G.degree(), key=lambda x: x[1], reverse=True)[:n]


def centrality(G: nx.DiGraph) -> dict[str, dict[str, float]]:
    """
    Degree and betweenness centrality.

    Betweenness is fine for this hackathon graph (~90 nodes). For much larger
    graphs, callers should sample or skip betweenness.
    """
    result: dict[str, dict[str, float]] = {
        "degree_centrality": nx.degree_centrality(G),
    }
    if G.number_of_nodes() > 500:
        # Keep the API simple: empty dict signals "skipped"
        result["betweenness_centrality"] = {}
    else:
        result["betweenness_centrality"] = nx.betweenness_centrality(G, weight=None)
    return result
