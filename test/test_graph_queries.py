"""Tests for graph.graph_queries (pathfinding, neighbor lookups, connectivity)."""

from __future__ import annotations

import networkx as nx
import pytest

from graph.graph_queries import (
    get_neighbors,
    get_node_connectivity,
    shortest_path,
    shortest_path_details,
)


class TestShortestPath:
    """Tests for shortest_path function."""

    def test_shortest_path_direct_and_multi_hop(
        self, sample_graph: nx.DiGraph
    ) -> None:
        # Direct edge: HYDERABAD_HUB -> WARANGAL_HUB
        path_direct = shortest_path(
            sample_graph, "HYDERABAD_HUB", "WARANGAL_HUB", weight="avg_distance_km"
        )
        assert path_direct == ["HYDERABAD_HUB", "WARANGAL_HUB"]

        # Multi-hop: HYDERABAD_HUB -> WARANGAL_HUB -> KHAMMAM_HUB
        path_multihop = shortest_path(
            sample_graph, "HYDERABAD_HUB", "KHAMMAM_HUB", weight="avg_distance_km"
        )
        assert path_multihop == ["HYDERABAD_HUB", "WARANGAL_HUB", "KHAMMAM_HUB"]

    def test_shortest_path_by_time_weight(self, sample_graph: nx.DiGraph) -> None:
        path = shortest_path(
            sample_graph, "HYDERABAD_HUB", "KARIMNAGAR_HUB", weight="avg_time_min"
        )
        # Direct: 210 min. Via Warangal: 180 + 90 = 270 min.
        # Shortest by time should be direct:
        assert path == ["HYDERABAD_HUB", "KARIMNAGAR_HUB"]

    def test_shortest_path_no_path_raises_networkx_no_path(
        self, sample_graph: nx.DiGraph
    ) -> None:
        # Directed graph: KHAMMAM_HUB has no outgoing edges
        with pytest.raises(nx.NetworkXNoPath):
            shortest_path(sample_graph, "KHAMMAM_HUB", "HYDERABAD_HUB")

    def test_shortest_path_unknown_node_raises_node_not_found(
        self, sample_graph: nx.DiGraph
    ) -> None:
        with pytest.raises(nx.NodeNotFound):
            shortest_path(sample_graph, "NON_EXISTENT_HUB", "HYDERABAD_HUB")


class TestShortestPathDetails:
    """Tests for shortest_path_details function."""

    def test_shortest_path_details_structure_and_values(
        self, sample_graph: nx.DiGraph
    ) -> None:
        details = shortest_path_details(
            sample_graph, "HYDERABAD_HUB", "KHAMMAM_HUB", weight="avg_distance_km"
        )

        assert details["source"] == "HYDERABAD_HUB"
        assert details["destination"] == "KHAMMAM_HUB"
        assert details["weight_attr"] == "avg_distance_km"
        assert details["path"] == ["HYDERABAD_HUB", "WARANGAL_HUB", "KHAMMAM_HUB"]
        assert details["hop_count"] == 2
        # HYD->WGL (145.0) + WGL->KMM (115.0) = 260.0 km
        assert pytest.approx(details["total_weight"]) == 260.0

    def test_shortest_path_details_direct_edge(
        self, sample_graph: nx.DiGraph
    ) -> None:
        details = shortest_path_details(
            sample_graph, "HYDERABAD_HUB", "WARANGAL_HUB", weight="avg_time_min"
        )

        assert details["hop_count"] == 1
        assert pytest.approx(details["total_weight"]) == 180.0


class TestGetNeighbors:
    """Tests for get_neighbors function."""

    def test_get_neighbors_successors_and_predecessors(
        self, sample_graph: nx.DiGraph
    ) -> None:
        # WARANGAL_HUB has incoming from HYDERABAD_HUB, outgoing to KARIMNAGAR_HUB, KHAMMAM_HUB
        neighbors = get_neighbors(sample_graph, "WARANGAL_HUB")

        assert sorted(neighbors["successors"]) == ["KARIMNAGAR_HUB", "KHAMMAM_HUB"]
        assert neighbors["predecessors"] == ["HYDERABAD_HUB"]

    def test_get_neighbors_leaf_node(self, sample_graph: nx.DiGraph) -> None:
        # KHAMMAM_HUB has incoming from WARANGAL_HUB, no outgoing
        neighbors = get_neighbors(sample_graph, "KHAMMAM_HUB")

        assert neighbors["successors"] == []
        assert neighbors["predecessors"] == ["WARANGAL_HUB"]

    def test_get_neighbors_unknown_node_raises_key_error(
        self, sample_graph: nx.DiGraph
    ) -> None:
        with pytest.raises(KeyError, match="Unknown node: INVALID_HUB"):
            get_neighbors(sample_graph, "INVALID_HUB")


class TestGetNodeConnectivity:
    """Tests for get_node_connectivity function."""

    def test_get_node_connectivity_degrees(self, sample_graph: nx.DiGraph) -> None:
        # WARANGAL_HUB: in_degree=1, out_degree=2, total=3
        conn = get_node_connectivity(sample_graph, "WARANGAL_HUB")

        assert conn["in_degree"] == 1
        assert conn["out_degree"] == 2
        assert conn["degree"] == 3
        assert conn["degree"] == conn["in_degree"] + conn["out_degree"]

    def test_get_node_connectivity_root_hub(self, sample_graph: nx.DiGraph) -> None:
        # HYDERABAD_HUB: in_degree=0, out_degree=3, total=3
        conn = get_node_connectivity(sample_graph, "HYDERABAD_HUB")

        assert conn["in_degree"] == 0
        assert conn["out_degree"] == 3
        assert conn["degree"] == 3

    def test_get_node_connectivity_unknown_node_raises_key_error(
        self, sample_graph: nx.DiGraph
    ) -> None:
        with pytest.raises(KeyError, match="Unknown node: INVALID_HUB"):
            get_node_connectivity(sample_graph, "INVALID_HUB")
