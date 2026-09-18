"""Tests for graph.graph_metrics (graph summary, hub rankings, and centrality)."""

from __future__ import annotations

import networkx as nx
import pytest

from graph.graph_metrics import centrality, summary, top_hubs


class TestSummary:
    """Tests for graph summary statistics."""

    def test_summary_empty_graph(self) -> None:
        G = nx.DiGraph()
        stats = summary(G)

        assert stats["node_count"] == 0
        assert stats["edge_count"] == 0
        assert stats["weakly_connected_components"] == 0
        assert stats["strongly_connected_components"] == 0
        assert stats["largest_weak_component_size"] == 0
        assert stats["largest_strong_component_size"] == 0

    def test_summary_sample_graph(self, sample_graph: nx.DiGraph) -> None:
        stats = summary(sample_graph)

        assert stats["node_count"] == 5
        assert stats["edge_count"] == 5
        # Since all nodes are connected in a single weak component
        assert stats["weakly_connected_components"] == 1
        assert stats["largest_weak_component_size"] == 5
        assert stats["strongly_connected_components"] >= 1
        assert stats["largest_strong_component_size"] >= 1

    def test_summary_disconnected_graph(self) -> None:
        G = nx.DiGraph()
        G.add_edge("A", "B")
        G.add_edge("C", "D")
        G.add_node("E")

        stats = summary(G)
        assert stats["node_count"] == 5
        assert stats["edge_count"] == 2
        assert stats["weakly_connected_components"] == 3
        assert stats["largest_weak_component_size"] == 2


class TestTopHubs:
    """Tests for top_hubs ranking."""

    def test_top_hubs_sample_graph(self, sample_graph: nx.DiGraph) -> None:
        # Hyderabad has out-degree 3 (Warangal, Karimnagar, Nizamabad), in-degree 0 -> total 3
        # Warangal has in-degree 1 (Hyd), out-degree 2 (Karimnagar, Khammam) -> total 3
        # Karimnagar has in-degree 2 (Hyd, Warangal), out-degree 0 -> total 2
        hubs = top_hubs(sample_graph, n=3)

        assert len(hubs) == 3
        # Verify ordering is descending by degree
        assert hubs[0][1] >= hubs[1][1] >= hubs[2][1]

        # Verify degree values match graph
        for name, deg in hubs:
            assert deg == sample_graph.degree(name)

    def test_top_hubs_limit_exceeds_nodes(self, sample_graph: nx.DiGraph) -> None:
        hubs = top_hubs(sample_graph, n=20)
        assert len(hubs) == 5

    def test_top_hubs_empty_graph(self) -> None:
        G = nx.DiGraph()
        hubs = top_hubs(G, n=5)
        assert hubs == []


class TestCentrality:
    """Tests for degree and betweenness centrality."""

    def test_centrality_normal_graph(self, sample_graph: nx.DiGraph) -> None:
        cent = centrality(sample_graph)

        assert "degree_centrality" in cent
        assert "betweenness_centrality" in cent

        deg_cent = cent["degree_centrality"]
        btw_cent = cent["betweenness_centrality"]

        assert len(deg_cent) == sample_graph.number_of_nodes()
        assert len(btw_cent) == sample_graph.number_of_nodes()

        for node in sample_graph.nodes:
            assert 0.0 <= deg_cent[node] <= 1.0
            assert 0.0 <= btw_cent[node] <= 1.0

    def test_centrality_skips_betweenness_for_large_graphs(
        self, large_mock_graph: nx.DiGraph
    ) -> None:
        assert large_mock_graph.number_of_nodes() > 500
        cent = centrality(large_mock_graph)

        assert "degree_centrality" in cent
        assert len(cent["degree_centrality"]) == 505
        assert cent["betweenness_centrality"] == {}
