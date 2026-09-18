"""
Build an in-memory NetworkX graph from MongoDB telangana_nodes / telangana_edges.

Graph type: nx.DiGraph
  Observed route legs are directional (source_name -> destination_name).
  Live data has essentially no reverse edges for the same pair, so a directed
  graph matches the logistics semantics (FTL / Carting movement).

MongoDB remains the source of truth. The NetworkX graph is never persisted.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import networkx as nx
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.database import Database

# Project root (parent of graph/)
_ROOT = Path(__file__).resolve().parent.parent

# Valid coordinate ranges for India / Telangana-ish sanity checks
_LAT_MIN, _LAT_MAX = -90.0, 90.0
_LON_MIN, _LON_MAX = -180.0, 180.0


@dataclass
class ValidationReport:
    """Structured validation output from build_graph."""

    node_count: int = 0
    edge_count: int = 0
    skipped_edges: int = 0
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return len(self.errors) == 0


def connect_mongo(env_path: Path | None = None) -> Database:
    """
    Connect using the same .env vars as the Node.js layer:
    MONGODB_URI, MONGODB_DB_NAME (default: hackathon),
    optional MONGODB_USERNAME / MONGODB_PASSWORD.
    """
    load_dotenv(env_path or _ROOT / ".env")

    import os

    uri = (os.getenv("MONGODB_URI") or "").strip()
    if not uri:
        raise ValueError(
            "MONGODB_URI is missing. Copy .env.example to .env and set your Atlas URI."
        )

    db_name = (os.getenv("MONGODB_DB_NAME") or "hackathon").strip()
    user = (os.getenv("MONGODB_USERNAME") or "").strip()
    password = (os.getenv("MONGODB_PASSWORD") or "").strip()

    kwargs: dict[str, Any] = {}
    if user and password:
        kwargs["username"] = user
        kwargs["password"] = password

    client = MongoClient(uri, **kwargs)
    return client[db_name]


def _valid_coord(value: Any, lo: float, hi: float) -> bool:
    if value is None:
        return False
    try:
        v = float(value)
    except (TypeError, ValueError):
        return False
    return lo <= v <= hi


def build_graph(db: Database) -> tuple[nx.DiGraph, ValidationReport]:
    """
    Load telangana_nodes + telangana_edges and construct a directed NetworkX graph.

    Node id = hub_name (string), matching edge source_name / destination_name.
    Edge weights are kept as separate attributes (avg_distance_km, avg_time_min).
    There is no cost field in MongoDB yet — do not invent one.
    """
    report = ValidationReport()
    graph = nx.DiGraph()

    nodes = list(db["telangana_nodes"].find({}))
    edges = list(db["telangana_edges"].find({}))

    seen_names: set[str] = set()
    for doc in nodes:
        hub_name = doc.get("hub_name")
        if not hub_name or not isinstance(hub_name, str):
            report.errors.append(f"Node missing/invalid hub_name: {doc.get('_id')}")
            continue

        if hub_name in seen_names:
            report.errors.append(f"Duplicate hub_name: {hub_name}")
            continue
        seen_names.add(hub_name)

        lat = doc.get("latitude")
        lon = doc.get("longitude")
        if lat is not None and not _valid_coord(lat, _LAT_MIN, _LAT_MAX):
            report.warnings.append(f"Invalid latitude for {hub_name}: {lat}")
        if lon is not None and not _valid_coord(lon, _LON_MIN, _LON_MAX):
            report.warnings.append(f"Invalid longitude for {hub_name}: {lon}")
        if lat is None or lon is None:
            report.warnings.append(f"Missing coordinates for {hub_name}")

        graph.add_node(
            hub_name,
            _id=str(doc.get("_id", "")),
            hub_name=hub_name,
            city=doc.get("city") or "",
            facility_code=doc.get("facility_code") or "",
            hub_type=doc.get("hub_type") or "",
            state=doc.get("state") or "",
            latitude=float(lat) if _valid_coord(lat, _LAT_MIN, _LAT_MAX) else None,
            longitude=float(lon) if _valid_coord(lon, _LON_MIN, _LON_MAX) else None,
        )

    if report.errors and not graph.number_of_nodes():
        return graph, report

    for doc in edges:
        source = doc.get("source_name")
        dest = doc.get("destination_name")

        if not source or not dest:
            report.skipped_edges += 1
            report.warnings.append(
                f"Edge skipped (null source/destination): {doc.get('_id')}"
            )
            continue

        if source not in graph:
            report.skipped_edges += 1
            report.warnings.append(
                f"Edge skipped — unknown source '{source}' (edge {doc.get('_id')})"
            )
            continue

        if dest not in graph:
            report.skipped_edges += 1
            report.warnings.append(
                f"Edge skipped — unknown destination '{dest}' (edge {doc.get('_id')})"
            )
            continue

        dist = doc.get("avg_distance_km")
        time_min = doc.get("avg_time_min")
        try:
            dist_f = float(dist) if dist is not None else None
        except (TypeError, ValueError):
            dist_f = None
            report.warnings.append(f"Non-numeric avg_distance_km on edge {doc.get('_id')}")

        try:
            time_f = float(time_min) if time_min is not None else None
        except (TypeError, ValueError):
            time_f = None
            report.warnings.append(f"Non-numeric avg_time_min on edge {doc.get('_id')}")

        if dist_f is None:
            report.warnings.append(
                f"Edge {source} -> {dest} missing avg_distance_km "
                "(shortest-path by distance may fail)"
            )
        if time_f is None:
            report.warnings.append(
                f"Edge {source} -> {dest} missing avg_time_min "
                "(shortest-path by time may fail)"
            )

        trip_count = doc.get("trip_count")
        try:
            trips = int(trip_count) if trip_count is not None else 0
        except (TypeError, ValueError):
            trips = 0

        graph.add_edge(
            source,
            dest,
            _id=str(doc.get("_id", "")),
            avg_distance_km=dist_f,
            avg_time_min=time_f,
            trip_count=trips,
            route_types=doc.get("route_types") or "",
            # cost intentionally omitted — not present in MongoDB
        )

    report.node_count = graph.number_of_nodes()
    report.edge_count = graph.number_of_edges()
    return graph, report
