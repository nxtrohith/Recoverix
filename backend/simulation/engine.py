"""Simulation engine orchestrating the SimPy environment and running truck processes."""

from __future__ import annotations

from typing import Any

import networkx as nx
import simpy

from backend.simulation.truck import Truck, truck_process


class SimulationEngine:
    """
    SimPy-based simulation engine for logistics network routing.

    Accepts an already-built NetworkX graph (caller is responsible for building it).
    The engine has zero direct dependency on MongoDB.
    """

    def __init__(
        self,
        graph: nx.DiGraph,
        default_travel_time: float = 60.0,
    ) -> None:
        self.graph = graph
        self.default_travel_time = default_travel_time

    def run(
        self,
        trucks: list[Truck | dict[str, Any]],
        until: float | None = None,
    ) -> list[dict[str, Any]]:
        """
        Run the simulation for the given list of trucks.

        Parameters:
            trucks: List of Truck instances or dict configurations.
            until: Optional maximum simulation time in minutes.

        Returns:
            A chronologically ordered, JSON-serializable list of events.
        """
        env = simpy.Environment()
        events: list[dict[str, Any]] = []

        # Instantiate processes for each truck
        for item in trucks:
            if isinstance(item, Truck):
                truck_obj = item
            elif isinstance(item, dict):
                truck_obj = Truck(**item)
            else:
                raise TypeError(f"Expected Truck instance or dict, got {type(item)}")

            env.process(
                truck_process(
                    env=env,
                    truck=truck_obj,
                    graph=self.graph,
                    events=events,
                    default_travel_time=self.default_travel_time,
                )
            )

        # Execute simulation
        env.run(until=until)

        # Sort events by timestamp for deterministic ordering
        events.sort(key=lambda e: e["time"])
        return events


def run_simulation(
    graph: nx.DiGraph,
    trucks: list[Truck | dict[str, Any]],
    until: float | None = None,
    default_travel_time: float = 60.0,
) -> list[dict[str, Any]]:
    """Functional convenience wrapper to run the simulation engine."""
    engine = SimulationEngine(
        graph=graph, default_travel_time=default_travel_time
    )
    return engine.run(trucks=trucks, until=until)
