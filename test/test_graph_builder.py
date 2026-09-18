"""Tests for graph.graph_builder (MongoDB to NetworkX ingestion & validation)."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from graph.graph_builder import (
    ValidationReport,
    _valid_coord,
    build_graph,
    connect_mongo,
)
from test.conftest import MockDatabase


class TestValidCoord:
    """Tests for the _valid_coord helper."""

    def test_valid_float_and_int(self) -> None:
        assert _valid_coord(17.385, -90.0, 90.0) is True
        assert _valid_coord(17, -90.0, 90.0) is True
        assert _valid_coord("17.385", -90.0, 90.0) is True

    def test_bounds(self) -> None:
        assert _valid_coord(-90.0, -90.0, 90.0) is True
        assert _valid_coord(90.0, -90.0, 90.0) is True
        assert _valid_coord(-90.0001, -90.0, 90.0) is False
        assert _valid_coord(90.0001, -90.0, 90.0) is False

    def test_none_and_invalid_types(self) -> None:
        assert _valid_coord(None, -90.0, 90.0) is False
        assert _valid_coord("invalid_float", -90.0, 90.0) is False
        assert _valid_coord([], -90.0, 90.0) is False
        assert _valid_coord({}, -90.0, 90.0) is False


class TestConnectMongo:
    """Tests for connect_mongo function."""

    @patch("graph.graph_builder.load_dotenv")
    @patch.dict("os.environ", {}, clear=True)
    def test_missing_uri_raises_value_error(self, mock_dotenv: MagicMock) -> None:
        with pytest.raises(ValueError, match="MONGODB_URI is missing"):
            connect_mongo()

    @patch("graph.graph_builder.MongoClient")
    @patch("graph.graph_builder.load_dotenv")
    @patch.dict(
        "os.environ",
        {
            "MONGODB_URI": "mongodb://localhost:27017",
            "MONGODB_DB_NAME": "test_db",
        },
        clear=True,
    )
    def test_connect_mongo_without_credentials(
        self, mock_dotenv: MagicMock, mock_mongo_client: MagicMock
    ) -> None:
        mock_client_instance = MagicMock()
        mock_mongo_client.return_value = mock_client_instance

        db = connect_mongo()

        mock_mongo_client.assert_called_once_with("mongodb://localhost:27017")
        mock_client_instance.__getitem__.assert_called_once_with("test_db")
        assert db == mock_client_instance["test_db"]

    @patch("graph.graph_builder.MongoClient")
    @patch("graph.graph_builder.load_dotenv")
    @patch.dict(
        "os.environ",
        {
            "MONGODB_URI": "mongodb+srv://cluster.example.com",
            "MONGODB_DB_NAME": "hackathon",
            "MONGODB_USERNAME": "test_user",
            "MONGODB_PASSWORD": "secret_password",
        },
        clear=True,
    )
    def test_connect_mongo_with_credentials(
        self, mock_dotenv: MagicMock, mock_mongo_client: MagicMock
    ) -> None:
        mock_client_instance = MagicMock()
        mock_mongo_client.return_value = mock_client_instance

        db = connect_mongo(env_path=Path("/tmp/fake.env"))

        mock_dotenv.assert_called_once_with(Path("/tmp/fake.env"))
        mock_mongo_client.assert_called_once_with(
            "mongodb+srv://cluster.example.com",
            username="test_user",
            password="secret_password",
        )
        assert db == mock_client_instance["hackathon"]


class TestBuildGraph:
    """Tests for build_graph and ValidationReport."""

    def test_build_graph_happy_path(
        self,
        mock_db: MockDatabase,
        sample_nodes_data: list[dict[str, Any]],
        sample_edges_data: list[dict[str, Any]],
    ) -> None:
        G, report = build_graph(mock_db)  # type: ignore[arg-type]

        assert isinstance(report, ValidationReport)
        assert report.ok is True
        assert len(report.errors) == 0
        assert len(report.warnings) == 0
        assert report.skipped_edges == 0
        assert report.node_count == len(sample_nodes_data)
        assert report.edge_count == len(sample_edges_data)

        # Verify node attributes
        hyd_node = G.nodes["HYDERABAD_HUB"]
        assert hyd_node["_id"] == "60a1"
        assert hyd_node["hub_name"] == "HYDERABAD_HUB"
        assert hyd_node["city"] == "Hyderabad"
        assert hyd_node["facility_code"] == "HYD01"
        assert hyd_node["hub_type"] == "DC"
        assert hyd_node["state"] == "Telangana"
        assert hyd_node["latitude"] == 17.3850
        assert hyd_node["longitude"] == 78.4867

        # Verify edge attributes
        edge = G.edges[("HYDERABAD_HUB", "WARANGAL_HUB")]
        assert edge["_id"] == "70b1"
        assert edge["avg_distance_km"] == 145.0
        assert edge["avg_time_min"] == 180.0
        assert edge["trip_count"] == 50
        assert edge["route_types"] == "FTL"
        assert "cost" not in edge

    def test_node_missing_or_invalid_hub_name(self) -> None:
        db = MockDatabase(
            {
                "telangana_nodes": [
                    {"_id": "bad1"},  # missing hub_name
                    {"_id": "bad2", "hub_name": None},  # None hub_name
                    {"_id": "bad3", "hub_name": 12345},  # non-string hub_name
                    {"_id": "good", "hub_name": "GOOD_HUB"},
                ],
                "telangana_edges": [],
            }
        )
        G, report = build_graph(db)  # type: ignore[arg-type]

        assert report.ok is False
        assert len(report.errors) == 3
        assert report.node_count == 1
        assert "GOOD_HUB" in G
        assert len(G.nodes) == 1

    def test_node_duplicate_hub_name(self) -> None:
        db = MockDatabase(
            {
                "telangana_nodes": [
                    {"_id": "1", "hub_name": "DUPLICATE_HUB"},
                    {"_id": "2", "hub_name": "DUPLICATE_HUB"},
                ],
                "telangana_edges": [],
            }
        )
        G, report = build_graph(db)  # type: ignore[arg-type]

        assert report.ok is False
        assert any("Duplicate hub_name: DUPLICATE_HUB" in err for err in report.errors)
        assert report.node_count == 1

    def test_node_coordinates_warnings(self) -> None:
        db = MockDatabase(
            {
                "telangana_nodes": [
                    {
                        "_id": "node1",
                        "hub_name": "BAD_LAT_HUB",
                        "latitude": 95.0,  # invalid lat
                        "longitude": 78.0,
                    },
                    {
                        "_id": "node2",
                        "hub_name": "BAD_LON_HUB",
                        "latitude": 17.0,
                        "longitude": -190.0,  # invalid lon
                    },
                    {
                        "_id": "node3",
                        "hub_name": "MISSING_COORDS_HUB",
                        "latitude": None,
                        "longitude": None,
                    },
                ],
                "telangana_edges": [],
            }
        )
        G, report = build_graph(db)  # type: ignore[arg-type]

        assert report.ok is True  # warnings do not make report.ok False
        assert len(report.warnings) >= 3
        assert G.nodes["BAD_LAT_HUB"]["latitude"] is None
        assert G.nodes["BAD_LON_HUB"]["longitude"] is None
        assert G.nodes["MISSING_COORDS_HUB"]["latitude"] is None
        assert G.nodes["MISSING_COORDS_HUB"]["longitude"] is None

    def test_all_nodes_invalid_returns_empty_graph(self) -> None:
        db = MockDatabase(
            {
                "telangana_nodes": [
                    {"_id": "bad1"},
                ],
                "telangana_edges": [],
            }
        )
        G, report = build_graph(db)  # type: ignore[arg-type]

        assert report.ok is False
        assert report.node_count == 0
        assert len(G.nodes) == 0

    def test_edges_skipped_when_source_or_destination_missing(self) -> None:
        db = MockDatabase(
            {
                "telangana_nodes": [
                    {"_id": "n1", "hub_name": "HUB_A"},
                    {"_id": "n2", "hub_name": "HUB_B"},
                ],
                "telangana_edges": [
                    {"_id": "e1", "source_name": "", "destination_name": "HUB_B"},
                    {"_id": "e2", "source_name": "HUB_A", "destination_name": None},
                    {"_id": "e3", "source_name": None, "destination_name": None},
                ],
            }
        )
        G, report = build_graph(db)  # type: ignore[arg-type]

        assert report.skipped_edges == 3
        assert report.edge_count == 0
        assert any("null source/destination" in w for w in report.warnings)

    def test_edges_skipped_when_node_unknown(self) -> None:
        db = MockDatabase(
            {
                "telangana_nodes": [
                    {"_id": "n1", "hub_name": "HUB_A"},
                ],
                "telangana_edges": [
                    {
                        "_id": "e1",
                        "source_name": "UNKNOWN_SRC",
                        "destination_name": "HUB_A",
                    },
                    {
                        "_id": "e2",
                        "source_name": "HUB_A",
                        "destination_name": "UNKNOWN_DST",
                    },
                ],
            }
        )
        G, report = build_graph(db)  # type: ignore[arg-type]

        assert report.skipped_edges == 2
        assert report.edge_count == 0
        assert any("unknown source 'UNKNOWN_SRC'" in w for w in report.warnings)
        assert any("unknown destination 'UNKNOWN_DST'" in w for w in report.warnings)

    def test_edges_non_numeric_and_missing_attributes(self) -> None:
        db = MockDatabase(
            {
                "telangana_nodes": [
                    {"_id": "n1", "hub_name": "HUB_A"},
                    {"_id": "n2", "hub_name": "HUB_B"},
                ],
                "telangana_edges": [
                    {
                        "_id": "e1",
                        "source_name": "HUB_A",
                        "destination_name": "HUB_B",
                        "avg_distance_km": "not_a_number",
                        "avg_time_min": None,
                        "trip_count": "invalid_int",
                    }
                ],
            }
        )
        G, report = build_graph(db)  # type: ignore[arg-type]

        assert report.edge_count == 1
        edge = G.edges[("HUB_A", "HUB_B")]
        assert edge["avg_distance_km"] is None
        assert edge["avg_time_min"] is None
        assert edge["trip_count"] == 0
        assert any("Non-numeric avg_distance_km" in w for w in report.warnings)
        assert any("missing avg_time_min" in w for w in report.warnings)
