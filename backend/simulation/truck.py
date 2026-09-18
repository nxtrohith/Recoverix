"""Reusable SimPy process representing a truck moving through the logistics network."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Generator

import networkx as nx
import simpy

from backend.simulation.events import EventType, create_event


@dataclass
class Truck:
    """Configuration for a simulated truck."""

    truck_id: str
    route: list[str]
    shipment_id: str | None = None
    start_time: float = 0.0
    delays: list[dict[str, Any]] = field(default_factory=list)


def get_edge_travel_time(
    graph: nx.DiGraph,
    source: str,
    target: str,
    default_travel_time: float = 60.0,
) -> float:
    """
    Extract travel time (in minutes) for an edge from the NetworkX graph.

    Checks 'avg_time_min', 'travel_time', or 'time' edge attributes.
    Falls back to default_travel_time if missing or non-positive.
    """
    if not graph.has_edge(source, target):
        return default_travel_time

    edge_data = graph.get_edge_data(source, target) or {}
    travel_time = (
        edge_data.get("avg_time_min")
        or edge_data.get("travel_time")
        or edge_data.get("time")
    )

    try:
        val = float(travel_time)
        return val if val > 0 else default_travel_time
    except (TypeError, ValueError):
        return default_travel_time


def truck_process(
    env: simpy.Environment,
    truck: Truck,
    graph: nx.DiGraph,
    events: list[dict[str, Any]],
    default_travel_time: float = 60.0,
) -> Generator[simpy.Event, Any, None]:
    """
    SimPy generator process simulating a truck navigating its assigned route.

    Route: [node_0, node_1, ..., node_n]
    For each edge (node_i -> node_i+1):
      1. Handle scheduled delays (if any) at current node
      2. Emit TRUCK_DEPARTURE
      3. Yield env.timeout(travel_time)
      4. Emit TRUCK_ARRIVAL
    """
    # Wait for scheduled truck start time
    if truck.start_time > 0:
        yield env.timeout(truck.start_time)

    if not truck.route:
        return

    # Handle single-node route
    if len(truck.route) == 1:
        single_node = truck.route[0]
        if truck.shipment_id:
            events.append(
                create_event(
                    time=env.now,
                    event_type=EventType.SHIPMENT_PICKUP,
                    truck_id=truck.truck_id,
                    from_node=single_node,
                    to_node=single_node,
                    current_node=single_node,
                    next_node=None,
                    shipment_id=truck.shipment_id,
                )
            )
            events.append(
                create_event(
                    time=env.now,
                    event_type=EventType.SHIPMENT_DELIVERY,
                    truck_id=truck.truck_id,
                    from_node=single_node,
                    to_node=single_node,
                    current_node=single_node,
                    next_node=None,
                    shipment_id=truck.shipment_id,
                )
            )
        return

    # Emit shipment pickup at initial node
    if truck.shipment_id:
        events.append(
            create_event(
                time=env.now,
                event_type=EventType.SHIPMENT_PICKUP,
                truck_id=truck.truck_id,
                from_node=truck.route[0],
                to_node=truck.route[1],
                current_node=truck.route[0],
                next_node=truck.route[1],
                shipment_id=truck.shipment_id,
            )
        )

    # Traverse each leg of the route
    for i in range(len(truck.route) - 1):
        curr_node = truck.route[i]
        next_node = truck.route[i + 1]

        # Check for any configured delays at current node or leg
        for delay in truck.delays:
            at_node = delay.get("at_node") or delay.get("from")
            duration = float(delay.get("duration", 0.0))
            if at_node == curr_node and duration > 0:
                events.append(
                    create_event(
                        time=env.now,
                        event_type=EventType.DELAY,
                        truck_id=truck.truck_id,
                        from_node=curr_node,
                        to_node=next_node,
                        current_node=curr_node,
                        next_node=next_node,
                        shipment_id=truck.shipment_id,
                        duration=duration,
                        reason=delay.get("reason", "Unscheduled delay"),
                    )
                )
                yield env.timeout(duration)

        # Determine travel time from graph
        travel_time = get_edge_travel_time(
            graph, curr_node, next_node, default_travel_time
        )

        # 1. Emit TRUCK_DEPARTURE
        events.append(
            create_event(
                time=env.now,
                event_type=EventType.TRUCK_DEPARTURE,
                truck_id=truck.truck_id,
                from_node=curr_node,
                to_node=next_node,
                current_node=curr_node,
                next_node=next_node,
                shipment_id=truck.shipment_id,
                travel_time=round(travel_time, 2),
            )
        )

        # 2. Simulate travel
        yield env.timeout(travel_time)

        # 3. Emit TRUCK_ARRIVAL
        future_next = truck.route[i + 2] if i + 2 < len(truck.route) else None
        events.append(
            create_event(
                time=env.now,
                event_type=EventType.TRUCK_ARRIVAL,
                truck_id=truck.truck_id,
                from_node=curr_node,
                to_node=next_node,
                current_node=next_node,
                next_node=future_next,
                shipment_id=truck.shipment_id,
            )
        )

    # Emit shipment delivery at destination
    if truck.shipment_id:
        events.append(
            create_event(
                time=env.now,
                event_type=EventType.SHIPMENT_DELIVERY,
                truck_id=truck.truck_id,
                from_node=truck.route[-2],
                to_node=truck.route[-1],
                current_node=truck.route[-1],
                next_node=None,
                shipment_id=truck.shipment_id,
            )
        )
