"""Unit tests for backend.simulation (SimPy engine, truck processes, and event emission)."""

from __future__ import annotations

import json
from typing import Any

import networkx as nx
import pytest

from backend.simulation import (
    EventType,
    SimulationEngine,
    Truck,
    create_event,
    get_edge_travel_time,
    run_simulation,
)


@pytest.fixture
def sim_test_graph() -> nx.DiGraph:
    """Directed graph with known travel times for simulation tests."""
    G = nx.DiGraph()
    G.add_node("HYD", hub_name="HYD", city="Hyderabad")
    G.add_node("WAR", hub_name="WAR", city="Warangal")
    G.add_node("KRM", hub_name="KRM", city="Karimnagar")
    G.add_node("KMM", hub_name="KMM", city="Khammam")

    G.add_edge("HYD", "WAR", avg_time_min=120.0, avg_distance_km=145.0)
    G.add_edge("WAR", "KRM", avg_time_min=80.0, avg_distance_km=72.0)
    G.add_edge("WAR", "KMM", avg_time_min=95.0, avg_distance_km=115.0)
    return G


class TestEvents:
    """Tests for simulation events creation and serialization."""

    def test_event_types_defined(self) -> None:
        assert EventType.TRUCK_DEPARTURE == "TRUCK_DEPARTURE"
        assert EventType.TRUCK_ARRIVAL == "TRUCK_ARRIVAL"
        assert EventType.SHIPMENT_PICKUP == "SHIPMENT_PICKUP"
        assert EventType.SHIPMENT_DELIVERY == "SHIPMENT_DELIVERY"
        assert EventType.DELAY == "DELAY"
        assert EventType.RECOVERY == "RECOVERY"

    def test_create_event_structure_and_json_serializable(self) -> None:
        event = create_event(
            time=120.556,
            event_type=EventType.TRUCK_ARRIVAL,
            truck_id="TRUCK_101",
            from_node="HYD",
            to_node="WAR",
            shipment_id="SHIP_001",
            current_node="WAR",
            next_node="KRM",
            extra_field="custom_value",
        )

        assert event["time"] == 120.56
        assert event["type"] == "TRUCK_ARRIVAL"
        assert event["truck_id"] == "TRUCK_101"
        assert event["shipment_id"] == "SHIP_001"
        assert event["from"] == "HYD"
        assert event["to"] == "WAR"
        assert event["current_node"] == "WAR"
        assert event["next_node"] == "KRM"
        assert event["extra_field"] == "custom_value"

        # Must be cleanly JSON serializable
        encoded = json.dumps(event)
        decoded = json.loads(encoded)
        assert decoded["time"] == 120.56
        assert decoded["type"] == "TRUCK_ARRIVAL"

    def test_create_event_defaults(self) -> None:
        event = create_event(
            time=0,
            event_type=EventType.TRUCK_DEPARTURE,
            truck_id="TRUCK_01",
            from_node="HYD",
            to_node="WAR",
        )
        assert event["current_node"] == "HYD"
        assert event["next_node"] == "WAR"
        assert event["shipment_id"] is None


class TestTruckProcess:
    """Tests for truck movement, delays, and edge traversal."""

    def test_get_edge_travel_time(self, sim_test_graph: nx.DiGraph) -> None:
        # avg_time_min present
        t1 = get_edge_travel_time(sim_test_graph, "HYD", "WAR")
        assert t1 == 120.0

        # Edge missing from graph
        t2 = get_edge_travel_time(
            sim_test_graph, "HYD", "UNKNOWN", default_travel_time=50.0
        )
        assert t2 == 50.0

        # Custom attribute names (time or travel_time)
        custom_g = nx.DiGraph()
        custom_g.add_edge("A", "B", travel_time=45.0)
        custom_g.add_edge("B", "C", time=35.0)
        assert get_edge_travel_time(custom_g, "A", "B") == 45.0
        assert get_edge_travel_time(custom_g, "B", "C") == 35.0

    def test_single_truck_full_route_with_shipment(
        self, sim_test_graph: nx.DiGraph
    ) -> None:
        truck = Truck(
            truck_id="T1",
            route=["HYD", "WAR", "KRM"],
            shipment_id="S1",
        )

        events = run_simulation(sim_test_graph, [truck])

        # Expect:
        # 1. SHIPMENT_PICKUP at HYD (time=0)
        # 2. TRUCK_DEPARTURE HYD -> WAR (time=0)
        # 3. TRUCK_ARRIVAL at WAR (time=120)
        # 4. TRUCK_DEPARTURE WAR -> KRM (time=120)
        # 5. TRUCK_ARRIVAL at KRM (time=200)
        # 6. SHIPMENT_DELIVERY at KRM (time=200)
        assert len(events) == 6

        event_types = [e["type"] for e in events]
        assert event_types == [
            EventType.SHIPMENT_PICKUP,
            EventType.TRUCK_DEPARTURE,
            EventType.TRUCK_ARRIVAL,
            EventType.TRUCK_DEPARTURE,
            EventType.TRUCK_ARRIVAL,
            EventType.SHIPMENT_DELIVERY,
        ]

        assert events[0]["time"] == 0.0
        assert events[0]["current_node"] == "HYD"

        assert events[1]["time"] == 0.0
        assert events[1]["from"] == "HYD"
        assert events[1]["to"] == "WAR"

        assert events[2]["time"] == 120.0
        assert events[2]["current_node"] == "WAR"
        assert events[2]["next_node"] == "KRM"

        assert events[3]["time"] == 120.0
        assert events[3]["from"] == "WAR"
        assert events[3]["to"] == "KRM"

        assert events[4]["time"] == 200.0
        assert events[4]["current_node"] == "KRM"
        assert events[4]["next_node"] is None

        assert events[5]["time"] == 200.0
        assert events[5]["type"] == EventType.SHIPMENT_DELIVERY
        assert events[5]["current_node"] == "KRM"

    def test_truck_without_shipment(self, sim_test_graph: nx.DiGraph) -> None:
        truck = Truck(truck_id="T_EMPTY", route=["HYD", "WAR"])
        events = run_simulation(sim_test_graph, [truck])

        assert len(events) == 2
        assert events[0]["type"] == EventType.TRUCK_DEPARTURE
        assert events[1]["type"] == EventType.TRUCK_ARRIVAL

    def test_truck_with_delays(self, sim_test_graph: nx.DiGraph) -> None:
        truck = Truck(
            truck_id="T_DELAYED",
            route=["HYD", "WAR"],
            shipment_id="S_DELAYED",
            delays=[{"at_node": "HYD", "duration": 25.0, "reason": "Mechanical check"}],
        )
        events = run_simulation(sim_test_graph, [truck])

        # Pickup at 0, Delay at 0 for 25 min, Departure at 25, Arrival at 25 + 120 = 145
        delay_event = next(e for e in events if e["type"] == EventType.DELAY)
        assert delay_event["duration"] == 25.0
        assert delay_event["reason"] == "Mechanical check"

        dep_event = next(e for e in events if e["type"] == EventType.TRUCK_DEPARTURE)
        assert dep_event["time"] == 25.0

        arr_event = next(e for e in events if e["type"] == EventType.TRUCK_ARRIVAL)
        assert arr_event["time"] == 145.0

    def test_truck_start_time_offset(self, sim_test_graph: nx.DiGraph) -> None:
        truck = Truck(
            truck_id="T_LATE",
            route=["HYD", "WAR"],
            start_time=50.0,
        )
        events = run_simulation(sim_test_graph, [truck])

        assert events[0]["time"] == 50.0
        assert events[1]["time"] == 170.0


class TestSimulationEngine:
    """Tests for SimulationEngine orchestration and multi-truck concurrency."""

    def test_multiple_concurrent_trucks(self, sim_test_graph: nx.DiGraph) -> None:
        trucks = [
            Truck(truck_id="T1", route=["HYD", "WAR"], shipment_id="S1"),
            Truck(
                truck_id="T2",
                route=["WAR", "KMM"],
                shipment_id="S2",
                start_time=10.0,
            ),
        ]

        engine = SimulationEngine(sim_test_graph)
        events = engine.run(trucks)

        # Verify chronological order
        times = [e["time"] for e in events]
        assert times == sorted(times)

        # Verify both trucks have events
        truck_ids = {e["truck_id"] for e in events}
        assert truck_ids == {"T1", "T2"}

        # Entire output is valid JSON
        serialized = json.dumps(events)
        assert len(serialized) > 0

    def test_accepts_dict_configs(self, sim_test_graph: nx.DiGraph) -> None:
        dict_trucks: list[dict[str, Any]] = [
            {
                "truck_id": "T_DICT",
                "route": ["HYD", "WAR"],
                "shipment_id": "S_DICT",
            }
        ]
        events = run_simulation(sim_test_graph, dict_trucks)
        assert len(events) >= 2
        assert events[0]["truck_id"] == "T_DICT"

    def test_invalid_truck_type_raises_error(
        self, sim_test_graph: nx.DiGraph
    ) -> None:
        engine = SimulationEngine(sim_test_graph)
        with pytest.raises(TypeError, match="Expected Truck instance or dict"):
            engine.run(["invalid_type"])  # type: ignore[list-item]

    def test_until_cutoff(self, sim_test_graph: nx.DiGraph) -> None:
        # Trip takes 120 min, but simulation cuts off at 60 min
        truck = Truck(truck_id="T1", route=["HYD", "WAR"])
        events = run_simulation(sim_test_graph, [truck], until=60.0)

        # Only departure should be emitted, not arrival
        assert len(events) == 1
        assert events[0]["type"] == EventType.TRUCK_DEPARTURE
        assert events[0]["time"] == 0.0
