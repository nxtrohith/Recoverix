"""Shared fixtures and test helpers for graph tests."""

from __future__ import annotations

from typing import Any
import networkx as nx
import pytest


class MockCollection:
    """Mock pymongo Collection for testing build_graph."""

    def __init__(self, docs: list[dict[str, Any]]) -> None:
        self._docs = docs

    def find(self, query: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        return list(self._docs)


class MockDatabase:
    """Mock pymongo Database mapping collection names to MockCollections."""

    def __init__(self, collections: dict[str, list[dict[str, Any]]]) -> None:
        self._collections = {
            name: MockCollection(docs) for name, docs in collections.items()
        }

    def __getitem__(self, name: str) -> MockCollection:
        if name not in self._collections:
            self._collections[name] = MockCollection([])
        return self._collections[name]


@pytest.fixture
def sample_nodes_data() -> list[dict[str, Any]]:
    return [
        {
            "_id": "60a1",
            "hub_name": "HYDERABAD_HUB",
            "city": "Hyderabad",
            "facility_code": "HYD01",
            "hub_type": "DC",
            "state": "Telangana",
            "latitude": 17.3850,
            "longitude": 78.4867,
        },
        {
            "_id": "60a2",
            "hub_name": "WARANGAL_HUB",
            "city": "Warangal",
            "facility_code": "WGL01",
            "hub_type": "HUB",
            "state": "Telangana",
            "latitude": 17.9689,
            "longitude": 79.5941,
        },
        {
            "_id": "60a3",
            "hub_name": "KARIMNAGAR_HUB",
            "city": "Karimnagar",
            "facility_code": "KRN01",
            "hub_type": "HUB",
            "state": "Telangana",
            "latitude": 18.4386,
            "longitude": 79.1288,
        },
        {
            "_id": "60a4",
            "hub_name": "NIZAMABAD_HUB",
            "city": "Nizamabad",
            "facility_code": "NZB01",
            "hub_type": "HUB",
            "state": "Telangana",
            "latitude": 18.6725,
            "longitude": 78.0941,
        },
        {
            "_id": "60a5",
            "hub_name": "KHAMMAM_HUB",
            "city": "Khammam",
            "facility_code": "KMM01",
            "hub_type": "HUB",
            "state": "Telangana",
            "latitude": 17.2473,
            "longitude": 80.1514,
        },
    ]


@pytest.fixture
def sample_edges_data() -> list[dict[str, Any]]:
    return [
        {
            "_id": "70b1",
            "source_name": "HYDERABAD_HUB",
            "destination_name": "WARANGAL_HUB",
            "avg_distance_km": 145.0,
            "avg_time_min": 180.0,
            "trip_count": 50,
            "route_types": "FTL",
        },
        {
            "_id": "70b2",
            "source_name": "WARANGAL_HUB",
            "destination_name": "KARIMNAGAR_HUB",
            "avg_distance_km": 72.0,
            "avg_time_min": 90.0,
            "trip_count": 30,
            "route_types": "Carting",
        },
        {
            "_id": "70b3",
            "source_name": "HYDERABAD_HUB",
            "destination_name": "KARIMNAGAR_HUB",
            "avg_distance_km": 164.0,
            "avg_time_min": 210.0,
            "trip_count": 40,
            "route_types": "FTL",
        },
        {
            "_id": "70b4",
            "source_name": "HYDERABAD_HUB",
            "destination_name": "NIZAMABAD_HUB",
            "avg_distance_km": 175.0,
            "avg_time_min": 200.0,
            "trip_count": 25,
            "route_types": "FTL",
        },
        {
            "_id": "70b5",
            "source_name": "WARANGAL_HUB",
            "destination_name": "KHAMMAM_HUB",
            "avg_distance_km": 115.0,
            "avg_time_min": 150.0,
            "trip_count": 20,
            "route_types": "Carting",
        },
    ]


@pytest.fixture
def mock_db(
    sample_nodes_data: list[dict[str, Any]],
    sample_edges_data: list[dict[str, Any]],
) -> MockDatabase:
    return MockDatabase(
        {
            "telangana_nodes": sample_nodes_data,
            "telangana_edges": sample_edges_data,
        }
    )


@pytest.fixture
def sample_graph(
    mock_db: MockDatabase,
) -> nx.DiGraph:
    from graph.graph_builder import build_graph

    G, _ = build_graph(mock_db)  # type: ignore[arg-type]
    return G


@pytest.fixture
def large_mock_graph() -> nx.DiGraph:
    """Graph with > 500 nodes to test centrality thresholding."""
    G = nx.DiGraph()
    for i in range(505):
        G.add_node(f"HUB_{i}")
    for i in range(504):
        G.add_edge(f"HUB_{i}", f"HUB_{i+1}")
    return G
