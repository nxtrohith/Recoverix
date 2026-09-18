"""
Resolve a Shipment document from MongoDB into a graph-aware state object.

Operational layer: answers "where is the shipment, where should it be,
where does it need to go, and is it in trouble?"  Does NOT touch the graph.

MongoDB is the source of truth for operational locations:

  actualNode   — last confirmed physical hub (``currentLocation`` / confirming
                 ``shipmentevents``). Recovery / pickup node. Never overwritten
                 merely because the route says the shipment should be elsewhere.
  expectedNode — route-progress hub derived from ``assignedRoute`` stops +
                 on-route ``shipmentevents``. Persisted ``expectedLocation`` is
                 a cache of this derivation (via ``sync_expected_location``),
                 not an arbitrary static input.

Both resolve through ``Location.graphNodeKey``.

A shipment is MISPLACED when both nodes are known and ``actualNode != expectedNode``.
``currentLocation`` alone never defines misplaced. GPS is not used.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from pymongo.database import Database


# Statuses that mean the shipment requires active recovery (fallback only
# when expected vs actual cannot be compared).
MISPLACED_STATUSES: frozenset[str] = frozenset({"misplaced"})
DELAYED_STATUSES: frozenset[str] = frozenset({"delayed"})

# Events that mark progress along the planned route (not exception/recovery).
_ON_ROUTE_EVENT_TYPES: frozenset[str] = frozenset(
    {
        "created",
        "picked_up",
        "in_transit",
        "arrived_hub",
        "departed_hub",
        "status_update",
        "delivered",
    }
)

# Presence at a planned hub → expected stays at that hub.
_PRESENCE_EVENT_TYPES: frozenset[str] = frozenset(
    {
        "created",
        "picked_up",
        "arrived_hub",
        "status_update",
        "delivered",
    }
)

# Departure / en-route from a planned hub → expected advances to the next stop.
_DEPARTURE_EVENT_TYPES: frozenset[str] = frozenset(
    {
        "departed_hub",
        "in_transit",
    }
)

# Event types that confirm a physical hub and update currentLocation.
_LOCATION_CONFIRMING_EVENT_TYPES: frozenset[str] = frozenset(
    {
        "created",
        "picked_up",
        "in_transit",
        "arrived_hub",
        "departed_hub",
        "delivered",
        "misplaced",
        "recovery_started",
        "recovered",
        "status_update",
    }
)

# Location comparison outcome for callers / tests.
LOCATION_STATE_VALID = "valid"       # both expected + actual nodes known
LOCATION_STATE_UNKNOWN = "unknown"   # one or both missing / unresolved


@dataclass
class ShipmentState:
    """All relevant facts about a shipment, ready for recovery planning."""

    # Identity
    shipment_id: str
    tracking_number: str
    status: str
    priority: str

    # Constraints
    deadline: datetime | None
    weight: float          # kg
    volume: float          # m³
    package_count: int
    fragile: bool
    special_handling: str | None

    # Resolved location names (human-readable)
    origin_name: str | None
    destination_name: str | None
    current_location_name: str | None   # actual / last-confirmed hub name
    expected_location_name: str | None

    # Graph node keys (hub_name in telangana_nodes, via Location.graphNodeKey)
    origin_node: str | None
    destination_node: str | None
    current_node: str | None            # alias for actual_node (pickup / recovery)
    actual_node: str | None
    expected_node: str | None

    # Planned route node sequence (origin → stops → destination), when known
    planned_route_nodes: list[str] = field(default_factory=list)

    # Latest tracking event
    latest_event_type: str | None = None
    latest_event_time: datetime | None = None

    # Recovery flags
    is_misplaced: bool = False
    is_delayed: bool = False
    needs_recovery: bool = False
    # True when expectedNode was derived from assignedRoute + on-route events
    expected_from_route: bool = False
    # "valid" when both nodes known; "unknown" when comparison is impossible
    location_state: str = LOCATION_STATE_UNKNOWN


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _resolve_location(
    db: Database, location_id: Any
) -> tuple[str | None, str | None]:
    """
    Look up a Location by ObjectId.

    Returns (name, graphNodeKey).  Both are None if not found or if
    graphNodeKey is not set on that location document.
    """
    if location_id is None:
        return None, None
    try:
        oid = (
            location_id
            if isinstance(location_id, ObjectId)
            else ObjectId(location_id)
        )
    except Exception:
        return None, None

    doc = db["locations"].find_one({"_id": oid}, {"name": 1, "graphNodeKey": 1})
    if doc is None:
        return None, None
    return doc.get("name"), doc.get("graphNodeKey")


def _location_id_for_node(db: Database, node: str | None) -> ObjectId | None:
    if not node:
        return None
    doc = db["locations"].find_one({"graphNodeKey": node}, {"_id": 1})
    if doc is None:
        return None
    return doc["_id"]


def _planned_route_nodes(
    db: Database,
    shipment_doc: dict[str, Any],
    origin_node: str | None,
    destination_node: str | None,
) -> list[str]:
    """
    Build the planned hub sequence from assignedRoute.

    Minimum data required: ``Shipment.assignedRoute`` pointing at a Route with
    resolvable origin / destination (and optional ``stops[].location``).
    Without assignedRoute, expectedNode cannot be derived from the plan.
    """
    route_ref = shipment_doc.get("assignedRoute")
    if route_ref is None:
        return []

    try:
        route_oid = (
            route_ref
            if isinstance(route_ref, ObjectId)
            else ObjectId(route_ref)
        )
    except Exception:
        return []

    route = db["routes"].find_one(
        {"_id": route_oid},
        {"origin": 1, "destination": 1, "stops": 1},
    )
    if route is None:
        return []

    nodes: list[str] = []

    _, route_origin = _resolve_location(db, route.get("origin"))
    if route_origin:
        nodes.append(route_origin)
    elif origin_node:
        nodes.append(origin_node)

    stops = list(route.get("stops") or [])
    stops.sort(key=lambda s: int(s.get("sequence") or 0))
    for stop in stops:
        _, stop_node = _resolve_location(db, stop.get("location"))
        if stop_node and (not nodes or nodes[-1] != stop_node):
            nodes.append(stop_node)

    _, route_dest = _resolve_location(db, route.get("destination"))
    dest = route_dest or destination_node
    if dest and (not nodes or nodes[-1] != dest):
        nodes.append(dest)

    return nodes


def _expected_from_plan(
    planned: list[str],
    events: list[dict[str, Any]],
    db: Database,
) -> tuple[str | None, bool]:
    """
    Derive expectedNode from ordered route stops + on-route events.

    Progress rules (off-plan events are ignored for expected):

      - No on-route progress yet → expected = first planned hub (origin /
        before departure).
      - Presence at planned[i] (arrived / created / picked_up / …) →
        expected = planned[i].
      - Departure / in_transit from planned[i] → expected = planned[i+1]
        (or destination if already at the last hub).

    Example::

      HYD → SIDDIPET → WARANGAL → KARIMNAGAR
      HYD departure, SIDDIPET arrival, SIDDIPET departure
      → expectedNode = WARANGAL

    Returns ``(None, False)`` when there is no planned route — callers must
    not invent an expected hub.
    """
    if not planned:
        return None, False

    progress_idx = -1
    awaiting_next = False

    for ev in events:
        etype = ev.get("type")
        if etype not in _ON_ROUTE_EVENT_TYPES:
            continue
        _, node = _resolve_location(db, ev.get("location"))
        if node is None or node not in planned:
            # Off-plan confirmation must not advance / rewrite expected.
            continue
        idx = planned.index(node)

        if etype in _DEPARTURE_EVENT_TYPES:
            if idx >= progress_idx:
                progress_idx = idx
                awaiting_next = True
        elif etype in _PRESENCE_EVENT_TYPES:
            if idx >= progress_idx:
                progress_idx = idx
                awaiting_next = False

    if progress_idx < 0:
        # Route known, no on-route progress → still expected at origin.
        return planned[0], True

    if awaiting_next:
        if progress_idx + 1 < len(planned):
            return planned[progress_idx + 1], True
        return planned[-1], True

    return planned[progress_idx], True


def _actual_from_events_or_state(
    db: Database,
    events: list[dict[str, Any]],
    current_name: str | None,
    current_node: str | None,
) -> tuple[str | None, str | None]:
    """
    Resolve actual / last-confirmed hub.

    Prefer the latest location-confirming shipment event; fall back to the
    shipment's ``currentLocation``. Never invent a hub from the route plan.
    """
    for ev in reversed(events):
        if ev.get("type") not in _LOCATION_CONFIRMING_EVENT_TYPES:
            continue
        name, node = _resolve_location(db, ev.get("location"))
        if node is not None:
            return name, node
    return current_name, current_node


def _name_for_node(db: Database, node: str | None) -> str | None:
    if not node:
        return None
    doc = db["locations"].find_one({"graphNodeKey": node}, {"name": 1})
    if doc:
        return doc.get("name")
    return node


def _compute_misplaced(
    *,
    expected_node: str | None,
    actual_node: str | None,
    status: str,
    latest_event_type: str | None,
) -> tuple[bool, str]:
    """
    Misplaced iff both nodes are known and differ.

    Status / misplaced-event flags are a fallback only when the comparison
    cannot be made (missing expected and/or actual).  currentLocation alone
    never marks a shipment misplaced.
    """
    if expected_node is not None and actual_node is not None:
        return expected_node != actual_node, LOCATION_STATE_VALID

    # Incomplete location state — cannot decide from hubs alone.
    fallback = status in MISPLACED_STATUSES or latest_event_type == "misplaced"
    return fallback, LOCATION_STATE_UNKNOWN


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_shipment_state(db: Database, identifier: str) -> ShipmentState | None:
    """
    Fetch a shipment by ObjectId string or trackingNumber.

    Returns None if the shipment is not found.

    ``actualNode`` comes from the latest confirming event (else
    ``currentLocation``). ``expectedNode`` is always derived from
    ``assignedRoute`` + on-route events when a planned sequence exists —
    persisted ``expectedLocation`` is not treated as an authoritative static
    value. When route/event data is insufficient, ``expectedNode`` stays
    unset and ``location_state`` is ``unknown``.
    """
    # Try ObjectId first; fall back to tracking-number string search.
    try:
        query: dict[str, Any] = {"_id": ObjectId(identifier)}
    except Exception:
        query = {"trackingNumber": identifier}

    doc = db["shipments"].find_one(query)
    if doc is None:
        return None

    shipment_id = str(doc["_id"])

    origin_name, origin_node = _resolve_location(db, doc.get("origin"))
    dest_name, dest_node = _resolve_location(db, doc.get("destination"))
    curr_name, curr_node = _resolve_location(db, doc.get("currentLocation"))

    # Chronological events (needed for expected progress + latest event).
    events = list(
        db["shipmentevents"].find(
            {"shipment": doc["_id"]},
            sort=[("timestamp", 1)],
        )
    )
    latest_event = events[-1] if events else None
    latest_event_type: str | None = None
    latest_event_time: datetime | None = None
    if latest_event:
        latest_event_type = latest_event.get("type")
        latest_event_time = latest_event.get("timestamp")

    # actualNode = last confirmed physical hub (events preferred over field).
    actual_name, actual_node = _actual_from_events_or_state(
        db, events, curr_name, curr_node
    )

    planned = _planned_route_nodes(db, doc, origin_node, dest_node)

    # expectedNode is route-progress derived — never an arbitrary static value.
    expected_node, expected_from_route = _expected_from_plan(
        planned, events, db
    )
    expected_name = (
        _name_for_node(db, expected_node) if expected_node else None
    )

    status: str = doc.get("status", "")
    is_misplaced, location_state = _compute_misplaced(
        expected_node=expected_node,
        actual_node=actual_node,
        status=status,
        latest_event_type=latest_event_type,
    )
    is_delayed = status in DELAYED_STATUSES
    needs_recovery = is_misplaced or is_delayed

    return ShipmentState(
        shipment_id=shipment_id,
        tracking_number=doc.get("trackingNumber", ""),
        status=status,
        priority=doc.get("priority", ""),
        deadline=doc.get("deadline"),
        weight=float(doc.get("weight") or 0),
        volume=float(doc.get("volume") or 0),
        package_count=int(doc.get("packageCount") or 0),
        fragile=bool(doc.get("fragile", False)),
        special_handling=doc.get("specialHandling"),
        origin_name=origin_name,
        destination_name=dest_name,
        current_location_name=actual_name,
        expected_location_name=expected_name,
        origin_node=origin_node,
        destination_node=dest_node,
        current_node=actual_node,
        actual_node=actual_node,
        expected_node=expected_node,
        planned_route_nodes=planned,
        latest_event_type=latest_event_type,
        latest_event_time=latest_event_time,
        is_misplaced=is_misplaced,
        is_delayed=is_delayed,
        needs_recovery=needs_recovery,
        expected_from_route=expected_from_route,
        location_state=location_state,
    )


def sync_expected_location(
    db: Database,
    shipment_id: ObjectId | str,
    *,
    events: list[dict[str, Any]] | None = None,
) -> ObjectId | None:
    """
    Recompute expectedLocation from assignedRoute + on-route events and
    persist it on the shipment document.  Returns the Location ObjectId set,
    or None if expected cannot be derived.
    """
    try:
        ship_oid = (
            shipment_id
            if isinstance(shipment_id, ObjectId)
            else ObjectId(shipment_id)
        )
    except Exception:
        return None

    doc = db["shipments"].find_one({"_id": ship_oid})
    if doc is None:
        return None

    _, origin_node = _resolve_location(db, doc.get("origin"))
    _, dest_node = _resolve_location(db, doc.get("destination"))
    planned = _planned_route_nodes(db, doc, origin_node, dest_node)

    if events is None:
        events = list(
            db["shipmentevents"].find(
                {"shipment": ship_oid},
                sort=[("timestamp", 1)],
            )
        )

    expected_node, ok = _expected_from_plan(planned, events, db)
    if not ok or expected_node is None:
        return None

    expected_loc_id = _location_id_for_node(db, expected_node)
    if expected_loc_id is None:
        return None

    db["shipments"].update_one(
        {"_id": ship_oid},
        {
            "$set": {
                "expectedLocation": expected_loc_id,
                "updatedAt": datetime.now(tz=timezone.utc),
            }
        },
    )
    return expected_loc_id


def apply_shipment_event(
    db: Database,
    shipment_id: ObjectId | str,
    *,
    event_type: str,
    location_id: Any,
    description: str,
    timestamp: datetime | None = None,
    route_id: Any = None,
    vehicle_id: Any = None,
    update_actual_location: bool = True,
    sync_expected: bool = True,
) -> dict[str, Any]:
    """
    Insert a shipment event and update MongoDB operational state.

    - Location-confirming events update ``currentLocation`` (actual hub).
    - On-route progress refreshes ``expectedLocation`` from the planned route.
    - Does not invent GPS / external tracking — only the event's location.
    """
    try:
        ship_oid = (
            shipment_id
            if isinstance(shipment_id, ObjectId)
            else ObjectId(shipment_id)
        )
    except Exception as exc:
        raise ValueError(f"Invalid shipment id: {shipment_id}") from exc

    try:
        loc_oid = (
            location_id
            if isinstance(location_id, ObjectId)
            else ObjectId(location_id)
        )
    except Exception as exc:
        raise ValueError(f"Invalid location id: {location_id}") from exc

    now = timestamp or datetime.now(tz=timezone.utc)
    event_doc: dict[str, Any] = {
        "shipment": ship_oid,
        "type": event_type,
        "location": loc_oid,
        "timestamp": now,
        "description": description,
        "createdAt": now,
        "updatedAt": now,
    }
    if route_id is not None:
        event_doc["route"] = (
            route_id if isinstance(route_id, ObjectId) else ObjectId(route_id)
        )
    if vehicle_id is not None:
        event_doc["vehicle"] = (
            vehicle_id
            if isinstance(vehicle_id, ObjectId)
            else ObjectId(vehicle_id)
        )

    insert_result = db["shipmentevents"].insert_one(event_doc)
    event_doc["_id"] = insert_result.inserted_id

    ship_updates: dict[str, Any] = {"updatedAt": now}
    if (
        update_actual_location
        and event_type in _LOCATION_CONFIRMING_EVENT_TYPES
    ):
        ship_updates["currentLocation"] = loc_oid

    if event_type == "misplaced":
        ship_updates["status"] = "misplaced"
    elif event_type == "recovered":
        ship_updates["status"] = "recovered"
    elif event_type == "delivered":
        ship_updates["status"] = "delivered"

    db["shipments"].update_one({"_id": ship_oid}, {"$set": ship_updates})

    if sync_expected and event_type in _ON_ROUTE_EVENT_TYPES:
        sync_expected_location(db, ship_oid)

    return event_doc
