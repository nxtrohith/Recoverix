#!/usr/bin/env python3
"""
Unit-style checks for route-progress expectedNode vs actualNode.

Cases covered:
  1. Normal in-transit (expected == actual)
  2. Misplaced (expected != actual; recovery pickup = actualNode)
  3. At destination
  4. Insufficient data (no route / cannot invent expected)
  5. Origin before departure
  6. Intermediate stop (arrival keeps expected at that hub)
  7. Multi-stop departure advances expected to next hub

Usage:
  uv run python scripts/test_expected_actual.py
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from bson import ObjectId

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from graph.shipment_state import (
    LOCATION_STATE_UNKNOWN,
    LOCATION_STATE_VALID,
    _expected_from_plan,
    _planned_route_nodes,
    apply_shipment_event,
    get_shipment_state,
)

PASS = "\033[92m✓\033[0m"
FAIL = "\033[91m✗\033[0m"

_failures = 0


def check(cond: bool, label: str) -> None:
    global _failures
    if cond:
        print(f"  {PASS} {label}")
    else:
        _failures += 1
        print(f"  {FAIL} {label}")


class _FakeColl:
    def __init__(self, docs: list[dict[str, Any]]):
        self.docs = docs

    def find_one(self, query: dict, projection=None):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                return d
        return None

    def find(self, query: dict, projection=None, sort=None):
        rows = [
            d for d in self.docs if all(d.get(k) == v for k, v in query.items())
        ]
        if sort:
            for key, direction in reversed(list(sort)):
                rows.sort(
                    key=lambda r: r.get(key) or datetime.min.replace(
                        tzinfo=timezone.utc
                    ),
                    reverse=direction < 0,
                )
        return rows

    def insert_one(self, doc: dict):
        doc = dict(doc)
        if "_id" not in doc:
            doc["_id"] = ObjectId()
        self.docs.append(doc)

        class _R:
            inserted_id = doc["_id"]

        return _R()

    def update_one(self, query: dict, update: dict):
        doc = self.find_one(query)
        if doc is None:
            return
        if "$set" in update:
            doc.update(update["$set"])


class _FakeDB:
    def __init__(self, collections: dict[str, list[dict[str, Any]]]):
        self._c = {k: _FakeColl(v) for k, v in collections.items()}

    def __getitem__(self, name: str) -> _FakeColl:
        if name not in self._c:
            self._c[name] = _FakeColl([])
        return self._c[name]


def _base_ids():
    return {
        "hyd": ObjectId(),
        "sid": ObjectId(),
        "wgl": ObjectId(),
        "krm": ObjectId(),
        "nzb": ObjectId(),
        "route": ObjectId(),
        "ship": ObjectId(),
    }


def _locations(ids: dict[str, ObjectId]) -> list[dict[str, Any]]:
    return [
        {"_id": ids["hyd"], "name": "Hyd", "graphNodeKey": "Hyd"},
        {"_id": ids["sid"], "name": "Siddipet", "graphNodeKey": "Siddipet"},
        {"_id": ids["wgl"], "name": "Warangal", "graphNodeKey": "Warangal"},
        {"_id": ids["krm"], "name": "Karimnagar", "graphNodeKey": "Karimnagar"},
        {"_id": ids["nzb"], "name": "Nizamabad", "graphNodeKey": "Nizamabad"},
    ]


def _route(ids: dict[str, ObjectId], *, with_warangal: bool = False) -> dict[str, Any]:
    stops = [
        {
            "location": ids["sid"],
            "sequence": 1,
            "estimatedArrival": datetime.now(tz=timezone.utc),
            "estimatedDeparture": datetime.now(tz=timezone.utc),
        }
    ]
    if with_warangal:
        stops.append(
            {
                "location": ids["wgl"],
                "sequence": 2,
                "estimatedArrival": datetime.now(tz=timezone.utc),
                "estimatedDeparture": datetime.now(tz=timezone.utc),
            }
        )
    return {
        "_id": ids["route"],
        "origin": ids["hyd"],
        "destination": ids["krm"],
        "stops": stops,
    }


def _ship(
    ids: dict[str, ObjectId],
    *,
    tracking: str,
    current: ObjectId,
    status: str = "in_transit",
    assigned_route: ObjectId | None = None,
    expected_static: ObjectId | None = None,
) -> dict[str, Any]:
    doc: dict[str, Any] = {
        "_id": ids["ship"],
        "trackingNumber": tracking,
        "origin": ids["hyd"],
        "destination": ids["krm"],
        "currentLocation": current,
        "status": status,
        "priority": "medium",
        "deadline": datetime.now(tz=timezone.utc) + timedelta(hours=12),
        "weight": 10,
        "volume": 0.5,
        "packageCount": 1,
        "fragile": False,
    }
    if assigned_route is not None:
        doc["assignedRoute"] = assigned_route
    if expected_static is not None:
        # Stale / arbitrary static value — must not override route progress.
        doc["expectedLocation"] = expected_static
    return doc


def _ts(minutes: int) -> datetime:
    return datetime.now(tz=timezone.utc) + timedelta(minutes=minutes)


def test_expected_from_plan_helpers() -> None:
    print("\nHelper: route progress (arrival stays, departure advances)")
    planned = ["Hyd", "Siddipet", "Warangal", "Karimnagar"]
    hyd_id = ObjectId()
    sid_id = ObjectId()
    wrong_id = ObjectId()

    locs = [
        {"_id": hyd_id, "name": "Hyd", "graphNodeKey": "Hyd"},
        {"_id": sid_id, "name": "Siddipet", "graphNodeKey": "Siddipet"},
        {"_id": wrong_id, "name": "Nizamabad", "graphNodeKey": "Nizamabad"},
    ]
    db = _FakeDB({"locations": locs})

    node, ok = _expected_from_plan(planned, [], db)
    check(ok and node == "Hyd", "no events → expected = origin")

    events = [
        {
            "type": "departed_hub",
            "location": hyd_id,
            "timestamp": _ts(0),
        }
    ]
    node, ok = _expected_from_plan(planned, events, db)
    check(ok and node == "Siddipet", "after Hyd departure → expected = Siddipet")

    events.append(
        {
            "type": "arrived_hub",
            "location": sid_id,
            "timestamp": _ts(1),
        }
    )
    node, ok = _expected_from_plan(planned, events, db)
    check(ok and node == "Siddipet", "SIDDIPET arrival → expected stays Siddipet")

    events.append(
        {
            "type": "departed_hub",
            "location": sid_id,
            "timestamp": _ts(2),
        }
    )
    node, ok = _expected_from_plan(planned, events, db)
    check(ok and node == "Warangal", "SIDDIPET departure → expected = Warangal")

    events.append(
        {
            "type": "misplaced",
            "location": wrong_id,
            "timestamp": _ts(3),
        }
    )
    node, ok = _expected_from_plan(planned, events, db)
    check(
        ok and node == "Warangal",
        "misplaced at Nizamabad does not become expectedNode",
    )

    node, ok = _expected_from_plan([], events, db)
    check(not ok and node is None, "no planned route → expected unknown")


def test_planned_route_from_assigned_route() -> None:
    print("\nHelper: planned route from assignedRoute stops")
    ids = _base_ids()
    db = _FakeDB(
        {
            "locations": _locations(ids),
            "routes": [_route(ids, with_warangal=True)],
        }
    )
    planned = _planned_route_nodes(
        db,
        {"assignedRoute": ids["route"]},
        "Hyd",
        "Karimnagar",
    )
    check(
        planned == ["Hyd", "Siddipet", "Warangal", "Karimnagar"],
        f"planned sequence = {planned}",
    )

    planned_missing = _planned_route_nodes(
        db, {"assignedRoute": None}, "Hyd", "Karimnagar"
    )
    check(planned_missing == [], "no assignedRoute → empty planned sequence")


def test_origin_before_departure() -> None:
    print("\nCase: at origin before departure")
    ids = _base_ids()
    events = [
        {
            "shipment": ids["ship"],
            "type": "created",
            "location": ids["hyd"],
            "timestamp": _ts(0),
        }
    ]
    db = _FakeDB(
        {
            "locations": _locations(ids),
            "routes": [_route(ids)],
            "shipments": [
                _ship(
                    ids,
                    tracking="SHP-ORIGIN",
                    current=ids["hyd"],
                    assigned_route=ids["route"],
                )
            ],
            "shipmentevents": events,
        }
    )
    state = get_shipment_state(db, "SHP-ORIGIN")
    assert state is not None
    check(state.expected_node == "Hyd", "expectedNode = origin")
    check(state.actual_node == "Hyd", "actualNode = origin")
    check(not state.is_misplaced, "not misplaced")
    check(state.location_state == LOCATION_STATE_VALID, "location_state = valid")


def test_intermediate_stop_arrival() -> None:
    print("\nCase: intermediate stop arrival keeps expected at that hub")
    ids = _base_ids()
    events = [
        {
            "shipment": ids["ship"],
            "type": "departed_hub",
            "location": ids["hyd"],
            "timestamp": _ts(0),
        },
        {
            "shipment": ids["ship"],
            "type": "arrived_hub",
            "location": ids["sid"],
            "timestamp": _ts(1),
        },
    ]
    db = _FakeDB(
        {
            "locations": _locations(ids),
            "routes": [_route(ids)],
            "shipments": [
                _ship(
                    ids,
                    tracking="SHP-STOP",
                    current=ids["sid"],
                    assigned_route=ids["route"],
                    # Stale static expected must not win over route progress.
                    expected_static=ids["krm"],
                )
            ],
            "shipmentevents": events,
        }
    )
    state = get_shipment_state(db, "SHP-STOP")
    assert state is not None
    check(state.expected_node == "Siddipet", "expectedNode from route progress")
    check(state.actual_node == "Siddipet", "actualNode = Siddipet")
    check(not state.is_misplaced, "on-plan arrival is not misplaced")
    check(
        state.expected_from_route,
        "expected_from_route (not static expectedLocation)",
    )


def test_expected_equals_actual_not_misplaced() -> None:
    print("\nCase: expected == actual → not misplaced (normal)")
    ids = _base_ids()
    events = [
        {
            "shipment": ids["ship"],
            "type": "departed_hub",
            "location": ids["hyd"],
            "timestamp": _ts(0),
        },
        {
            "shipment": ids["ship"],
            "type": "arrived_hub",
            "location": ids["sid"],
            "timestamp": _ts(1),
        },
    ]
    db = _FakeDB(
        {
            "locations": _locations(ids),
            "routes": [_route(ids)],
            "shipments": [
                _ship(
                    ids,
                    tracking="SHP-OK",
                    current=ids["sid"],
                    assigned_route=ids["route"],
                )
            ],
            "shipmentevents": events,
        }
    )
    state = get_shipment_state(db, "SHP-OK")
    assert state is not None
    check(state.expected_node == "Siddipet", "expectedNode = Siddipet")
    check(state.actual_node == "Siddipet", "actualNode = Siddipet")
    check(state.expected_node == state.actual_node, "expected == actual")
    check(state.location_state == LOCATION_STATE_VALID, "location_state = valid")
    check(not state.is_misplaced, "is_misplaced = False")
    check(not state.needs_recovery, "needs_recovery = False")


def test_expected_ne_actual_misplaced() -> None:
    print("\nCase: expected != actual → misplaced; pickup = actualNode")
    ids = _base_ids()
    events = [
        {
            "shipment": ids["ship"],
            "type": "departed_hub",
            "location": ids["hyd"],
            "timestamp": _ts(0),
        },
        {
            "shipment": ids["ship"],
            "type": "arrived_hub",
            "location": ids["nzb"],
            "timestamp": _ts(1),
        },
    ]
    db = _FakeDB(
        {
            "locations": _locations(ids),
            "routes": [_route(ids)],
            "shipments": [
                _ship(
                    ids,
                    tracking="SHP-MIS",
                    current=ids["nzb"],
                    assigned_route=ids["route"],
                )
            ],
            "shipmentevents": events,
        }
    )
    state = get_shipment_state(db, "SHP-MIS")
    assert state is not None
    check(state.expected_node == "Siddipet", "expectedNode = Siddipet (next hub)")
    check(state.actual_node == "Nizamabad", "actualNode = Nizamabad")
    check(state.expected_node != state.actual_node, "expected != actual")
    check(state.location_state == LOCATION_STATE_VALID, "location_state = valid")
    check(state.is_misplaced, "is_misplaced = True")
    check(state.needs_recovery, "needs_recovery = True")
    check(
        state.current_node == state.actual_node == "Nizamabad",
        "recovery pickup node = actualNode (Nizamabad)",
    )


def test_at_destination() -> None:
    print("\nCase: shipment already at destination")
    ids = _base_ids()
    events = [
        {
            "shipment": ids["ship"],
            "type": "departed_hub",
            "location": ids["hyd"],
            "timestamp": _ts(0),
        },
        {
            "shipment": ids["ship"],
            "type": "arrived_hub",
            "location": ids["sid"],
            "timestamp": _ts(1),
        },
        {
            "shipment": ids["ship"],
            "type": "departed_hub",
            "location": ids["sid"],
            "timestamp": _ts(2),
        },
        {
            "shipment": ids["ship"],
            "type": "arrived_hub",
            "location": ids["krm"],
            "timestamp": _ts(3),
        },
        {
            "shipment": ids["ship"],
            "type": "delivered",
            "location": ids["krm"],
            "timestamp": _ts(4),
        },
    ]
    db = _FakeDB(
        {
            "locations": _locations(ids),
            "routes": [_route(ids)],
            "shipments": [
                _ship(
                    ids,
                    tracking="SHP-DEST",
                    current=ids["krm"],
                    status="delivered",
                    assigned_route=ids["route"],
                )
            ],
            "shipmentevents": events,
        }
    )
    state = get_shipment_state(db, "SHP-DEST")
    assert state is not None
    check(state.expected_node == "Karimnagar", "expectedNode = destination")
    check(state.actual_node == "Karimnagar", "actualNode = destination")
    check(not state.is_misplaced, "delivered on-plan is not misplaced")


def test_missing_route_unknown_state() -> None:
    print("\nCase: no route → insufficient data (do not invent expected)")
    ids = _base_ids()
    ship = _ship(ids, tracking="SHP-UNK", current=ids["nzb"])
    # Even a static expectedLocation must not invent route progress.
    ship["expectedLocation"] = ids["sid"]
    db = _FakeDB(
        {
            "locations": _locations(ids),
            "routes": [],
            "shipments": [ship],
            "shipmentevents": [],
        }
    )
    state = get_shipment_state(db, "SHP-UNK")
    assert state is not None
    check(state.actual_node == "Nizamabad", "actualNode still resolves")
    check(state.expected_node is None, "expectedNode missing (no route)")
    check(
        state.location_state == LOCATION_STATE_UNKNOWN,
        "location_state = unknown",
    )
    check(
        not state.is_misplaced,
        "is_misplaced = False (currentLocation alone is insufficient)",
    )
    check(not state.expected_from_route, "expected_from_route = False")


def test_no_events_with_route_at_origin() -> None:
    print("\nCase: route but no events → expected at origin")
    ids = _base_ids()
    db = _FakeDB(
        {
            "locations": _locations(ids),
            "routes": [_route(ids)],
            "shipments": [
                _ship(
                    ids,
                    tracking="SHP-NOEVT",
                    current=ids["hyd"],
                    assigned_route=ids["route"],
                )
            ],
            "shipmentevents": [],
        }
    )
    state = get_shipment_state(db, "SHP-NOEVT")
    assert state is not None
    check(state.expected_node == "Hyd", "expectedNode = origin from route")
    check(state.actual_node == "Hyd", "actualNode from currentLocation")
    check(state.expected_from_route, "expected_from_route = True")
    check(not state.is_misplaced, "aligned at origin")


def test_apply_event_updates_actual_location() -> None:
    print("\nEvent handling: confirming event updates currentLocation")
    ids = _base_ids()
    events = [
        {
            "shipment": ids["ship"],
            "type": "departed_hub",
            "location": ids["hyd"],
            "timestamp": _ts(-10),
        }
    ]
    db = _FakeDB(
        {
            "locations": _locations(ids),
            "routes": [_route(ids)],
            "shipments": [
                _ship(
                    ids,
                    tracking="SHP-EVT",
                    current=ids["hyd"],
                    assigned_route=ids["route"],
                    expected_static=ids["sid"],
                )
            ],
            "shipmentevents": events,
        }
    )
    apply_shipment_event(
        db,
        ids["ship"],
        event_type="arrived_hub",
        location_id=ids["nzb"],
        description="Confirmed at Nizamabad",
        sync_expected=False,
    )
    updated = db["shipments"].find_one({"_id": ids["ship"]})
    check(
        updated is not None and updated.get("currentLocation") == ids["nzb"],
        "currentLocation updated to event location (actual)",
    )
    state = get_shipment_state(db, "SHP-EVT")
    assert state is not None
    check(state.is_misplaced, "after off-plan confirm → misplaced")
    check(state.actual_node == "Nizamabad", "actualNode = Nizamabad")
    check(state.expected_node == "Siddipet", "expectedNode still next planned hub")


def test_demo_seed_if_present() -> None:
    print("\nIntegration: demo seed (if present in MongoDB)")
    try:
        from graph.graph_builder import connect_mongo

        db = connect_mongo()
    except Exception as exc:
        print(f"  (skip MongoDB checks: {exc})")
        return

    state = get_shipment_state(db, "SHP-DEMO-MISPLACED")
    if state is None:
        print("  (skip — run: uv run python scripts/seed_demo_misplaced.py)")
        return

    check(state.expected_from_route, "expectedNode derived from route progress")
    check(state.expected_node is not None, f"expectedNode set ({state.expected_node})")
    check(state.actual_node is not None, f"actualNode set ({state.actual_node})")
    check(
        state.expected_node != state.actual_node,
        "actualNode != expectedNode (misplaced)",
    )
    check(state.is_misplaced, "is_misplaced True from location mismatch")
    check(
        state.current_node == state.actual_node,
        "current_node (recovery pickup) == actual_node",
    )
    check(
        state.actual_node == "Kamareddy_Devenply_I (Telangana)",
        "actual/recovery hub is Kamareddy (Nizamabad-corridor stand-in)",
    )
    check(
        state.expected_node == "Medchal_MROoffce_D (Telangana)",
        "expected hub is Medchal planned stop (Siddipet-story stand-in)",
    )


def main() -> int:
    print("=" * 62)
    print("  expectedNode vs actualNode (route-progress) checks")
    print("=" * 62)
    test_expected_from_plan_helpers()
    test_planned_route_from_assigned_route()
    test_origin_before_departure()
    test_intermediate_stop_arrival()
    test_expected_equals_actual_not_misplaced()
    test_expected_ne_actual_misplaced()
    test_at_destination()
    test_missing_route_unknown_state()
    test_no_events_with_route_at_origin()
    test_apply_event_updates_actual_location()
    test_demo_seed_if_present()
    print()
    if _failures:
        print(f"{_failures} failure(s)")
        return 1
    print("All checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
