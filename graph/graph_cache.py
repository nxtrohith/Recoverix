"""
In-memory NetworkX graph cache for the SH-205 recovery pipeline.

Builds the Telangana logistics graph once and reuses it across orchestrator
calls. Call ``refresh_graph()`` after network data changes in MongoDB.
"""

from __future__ import annotations

from dataclasses import dataclass
from threading import Lock
from typing import Any

import networkx as nx
from pymongo.database import Database

from graph.graph_builder import ValidationReport, build_graph, connect_mongo


@dataclass
class CachedGraph:
    graph: nx.DiGraph
    report: ValidationReport


_lock = Lock()
_cache: CachedGraph | None = None
_db: Database | None = None


def get_db() -> Database:
    """Lazy MongoDB connection shared by the recovery service process."""
    global _db
    if _db is None:
        _db = connect_mongo()
    return _db


def get_graph(*, force_rebuild: bool = False) -> CachedGraph:
    """
    Return the cached NetworkX graph, building it on first use.

    Parameters
    ----------
    force_rebuild :
        When True, discard the cache and rebuild from MongoDB.
    """
    global _cache
    with _lock:
        if _cache is not None and not force_rebuild:
            return _cache

        db = get_db()
        graph, report = build_graph(db)
        if report.errors and graph.number_of_nodes() == 0:
            raise RuntimeError(
                "Graph cannot be constructed: "
                + "; ".join(report.errors[:3])
            )
        if graph.number_of_nodes() == 0:
            raise RuntimeError(
                "Graph cannot be constructed: telangana_nodes is empty"
            )

        _cache = CachedGraph(graph=graph, report=report)
        return _cache


def refresh_graph() -> CachedGraph:
    """Force a rebuild from MongoDB (call after network data changes)."""
    return get_graph(force_rebuild=True)


def clear_graph_cache() -> None:
    """Drop the in-memory graph (next call rebuilds). Useful in tests."""
    global _cache
    with _lock:
        _cache = None


def cache_status() -> dict[str, Any]:
    """Lightweight status for health / debug endpoints."""
    with _lock:
        if _cache is None:
            return {"loaded": False, "nodeCount": 0, "edgeCount": 0}
        return {
            "loaded": True,
            "nodeCount": _cache.report.node_count,
            "edgeCount": _cache.report.edge_count,
            "skippedEdges": _cache.report.skipped_edges,
            "warningCount": len(_cache.report.warnings),
        }
