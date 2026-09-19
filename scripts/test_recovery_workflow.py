#!/usr/bin/env python3
"""
Unit-style checks for the Recoverix recovery workflow:

  assign → driver notification → pickup confirm → recover → resolve

Cases:
  1. assign recovery
  2. driver notification is logged
  3. pickup confirmation
  4. shipment recovery event (recovery_started + recovery_pickup_confirmed)
  5. resolve after pickup
  6. invalid pickup before assignment
  7. repeated pickup confirmation

Usage:
  uv run python scripts/test_recovery_workflow.py
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

from graph.incident_service import (
    assign_recovery,
    confirm_recovery_pickup,
    resolve_recovery,
)
from graph.recovery_orchestrator import RecoveryError

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


def _matches(doc: dict[str, Any], query: dict[str, Any]) -> bool:
    for key, expected in query.items():
        actual = doc.get(key)
        if isinstance(expected, dict) and "$in" in expected:
            if actual not in expected["$in"]:
                return False
        elif actual != expected:
            return False
    return True


class _FakeColl:
    def __init__(self, docs: list[dict[str, Any]]):
        self.docs = docs

    def find_one(self, query: dict, projection=None, sort=None):
        rows = [d for d in self.docs if _matches(d, query)]
        if sort:
            for key, direction in reversed(list(sort)):
                rows.sort(
                    key=lambda r: r.get(key)
                    or datetime.min.replace(tzinfo=timezone.utc),
                    reverse=direction < 0,
                )
        return rows[0] if rows else None

    def find(self, query: dict, projection=None, sort=None):
        rows = [d for d in self.docs if _matches(d, query)]
        if sort:
            for key, direction in reversed(list(sort)):
                rows.sort(
                    key=lambda r: r.get(key)
                    or datetime.min.replace(tzinfo=timezone.utc),
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

    def update_many(self, query: dict, update: dict):
        for doc in list(self.docs):
            if _matches(doc, query) and "$set" in update:
                doc.update(update["$set"])

    def delete_many(self, query: dict):
        self.docs[:] = [d for d in self.docs if not _matches(d, query)]

        class _R:
            deleted_count = 0

        return _R()

    def insert_many(self, docs: list[dict]):
        ids = []
        for doc in docs:
            d = dict(doc)
            if "_id" not in d:
                d["_id"] = ObjectId()
            self.docs.append(d)
            ids.append(d["_id"])

        class _R:
            inserted_ids = ids

        return _R()

    def count_documents(self, query: dict) -> int:
        return sum(1 for d in self.docs if _matches(d, query))


class _FakeDB:
    def __init__(self, collections: dict[str, list[dict[str, Any]]]):
        self._c = {k: _FakeColl(v) for k, v in collections.items()}

    def __getitem__(self, name: str) -> _FakeColl:
        if name not in self._c:
            self._c[name] = _FakeColl([])
        return self._c[name]


def _ids() -> dict[str, ObjectId]:
    return {
        "hub": ObjectId(),
        "dest": ObjectId(),
        "origin": ObjectId(),
        "ship": ObjectId(),
        "veh": ObjectId(),
        "inc": ObjectId(),
        "case": ObjectId(),
    }


def _seed(ids: dict[str, ObjectId]) -> _FakeDB:
    now = datetime.now(tz=timezone.utc)
    return _FakeDB(
        {
            "locations": [
                {
                    "_id": ids["origin"],
                    "name": "Hyderabad Hub",
                    "graphNodeKey": "Hyderabad Hub",
                },
                {
                    "_id": ids["hub"],
                    "name": "Warangal Hub",
                    "graphNodeKey": "Warangal Hub",
                },
                {
                    "_id": ids["dest"],
                    "name": "Karimnagar Hub",
                    "graphNodeKey": "Karimnagar Hub",
                },
            ],
            "vehicles": [
                {
                    "_id": ids["veh"],
                    "vehicleNumber": "TS-09-RCV-01",
                    "status": "in_transit",
                    "currentLocation": ids["hub"],
                }
            ],
            "shipments": [
                {
                    "_id": ids["ship"],
                    "trackingNumber": "Recoverix-DEMO-1",
                    "origin": ids["origin"],
                    "destination": ids["dest"],
                    "currentLocation": ids["hub"],
                    "status": "misplaced",
                    "weight": 12,
                    "volume": 0.4,
                    "packageCount": 1,
                    "priority": "high",
                    "deadline": now + timedelta(hours=8),
                    "fragile": False,
                    "assignedVehicle": None,
                }
            ],
            "incidents": [
                {
                    "_id": ids["inc"],
                    "incidentId": "INC-TEST001",
                    "shipment": ids["ship"],
                    "vehicle": None,
                    "incidentType": "MISPLACED_SHIPMENT",
                    "hub": ids["hub"],
                    "status": "RECOVERY_REQUIRED",
                    "selectedCandidateId": None,
                    "recoveryVehicle": None,
                    "recoveryPath": [],
                    "pickupCase": None,
                    "recoveryCase": ids["case"],
                    "driverMessage": None,
                    "analysisStatus": "RECOVERY_PLAN_AVAILABLE",
                    "createdAt": now,
                    "updatedAt": now,
                }
            ],
            "recoverycases": [
                {
                    "_id": ids["case"],
                    "shipment": ids["ship"],
                    "detectedAt": now,
                    "detectedLocation": ids["hub"],
                    "reason": "wrong_hub",
                    "severity": "high",
                    "status": "options_generated",
                }
            ],
            "shipmentevents": [],
        }
    )


def _assign(db: _FakeDB, ids: dict[str, ObjectId]) -> dict[str, Any]:
    return assign_recovery(
        db,
        str(ids["ship"]),
        candidate_id="cand-piggy-1",
        vehicle_id=str(ids["veh"]),
        path=["Warangal Hub", "Karimnagar Hub"],
        pickup_case="pass_through",
        score=0.87,
    )


def test_assign_and_driver_notification() -> None:
    print("\n1–2. Assign recovery + driver notification logged")
    ids = _ids()
    db = _seed(ids)
    result = _assign(db, ids)

    incident = db["incidents"].find_one({"_id": ids["inc"]})
    shipment = db["shipments"].find_one({"_id": ids["ship"]})
    events = db["shipmentevents"].docs

    check(incident is not None and incident["status"] == "ASSIGNED", "incident → ASSIGNED")
    check(
        shipment is not None and shipment.get("assignedVehicle") == ids["veh"],
        "shipment retains assigned recovery vehicle",
    )
    check(incident.get("pickupCase") == "pass_through", "pickupCase persisted")
    check(incident.get("pickupNode") == "Warangal Hub", "pickupNode persisted")
    check(incident.get("destinationNode") == "Karimnagar Hub", "destinationNode persisted")
    check(incident.get("recoveryScore") == 0.87, "recoveryScore persisted")
    check(incident.get("assignedAt") is not None, "assignedAt persisted")
    check(
        incident.get("recoveryDriverId") == "TS-09-RCV-01",
        "driver id (vehicle number) persisted",
    )
    check(
        result["assignment"]["candidateId"] == "cand-piggy-1",
        "assignment payload includes candidate",
    )

    notify = result.get("driverNotification") or {}
    check(notify.get("delivered") is True, "driver notification delivered flag")
    check(notify.get("channel") == "log", "driver notification channel is log stub")
    check(notify.get("simulated") is True, "driver notification marked simulated")
    check(
        "piggyback" in (notify.get("message") or "").lower()
        or "retrieve" in (notify.get("message") or "").lower(),
        "driver message instructs retrieval via piggyback",
    )
    check(incident.get("driverMessage") == notify.get("message"), "driverMessage stored on incident")

    started = [e for e in events if e.get("type") == "recovery_started"]
    check(len(started) == 1, "recovery_started shipment event written")
    check(result["shipment"]["lifecycleStatus"] == "RECOVERY_ASSIGNED", "lifecycle RECOVERY_ASSIGNED")


def test_pickup_confirmation_and_recovery_event() -> None:
    print("\n3–4. Pickup confirmation + shipment recovery event")
    ids = _ids()
    db = _seed(ids)
    _assign(db, ids)
    result = confirm_recovery_pickup(db, str(ids["ship"]))

    incident = db["incidents"].find_one({"_id": ids["inc"]})
    shipment = db["shipments"].find_one({"_id": ids["ship"]})
    events = db["shipmentevents"].docs

    check(
        incident is not None and incident["status"] == "PICKUP_CONFIRMED",
        "incident → PICKUP_CONFIRMED (not RESOLVED)",
    )
    check(incident.get("resolvedAt") is None, "incident not resolved on pickup")
    check(
        shipment is not None and shipment.get("status") == "recovered",
        "shipment status → recovered after pickup",
    )
    check(
        shipment.get("assignedVehicle") == ids["veh"],
        "assigned recovery vehicle retained after pickup",
    )
    check(incident.get("pickupConfirmedAt") is not None, "pickupConfirmedAt set")

    pickup_events = [e for e in events if e.get("type") == "recovery_pickup_confirmed"]
    check(len(pickup_events) == 1, "recovery_pickup_confirmed event written")
    check(
        result["pickup"]["simulated"] is True,
        "pickup response marked as simulated confirmation",
    )
    check(result["shipment"]["lifecycleStatus"] == "PICKUP_CONFIRMED", "lifecycle PICKUP_CONFIRMED")
    check(result["shipment"]["needsRecovery"] is True, "incident still open for operator resolve")


def test_resolve_after_pickup() -> None:
    print("\n5. Resolve after pickup")
    ids = _ids()
    db = _seed(ids)
    _assign(db, ids)
    confirm_recovery_pickup(db, str(ids["ship"]))
    result = resolve_recovery(db, str(ids["ship"]))

    incident = db["incidents"].find_one({"_id": ids["inc"]})
    shipment = db["shipments"].find_one({"_id": ids["ship"]})
    events = db["shipmentevents"].docs

    check(incident is not None and incident["status"] == "RESOLVED", "incident → RESOLVED")
    check(incident.get("resolvedAt") is not None, "resolvedAt set")
    check(shipment is not None and shipment.get("status") == "recovered", "shipment remains recovered")
    recovered_events = [e for e in events if e.get("type") == "recovered"]
    check(len(recovered_events) == 1, "recovered shipment event on resolve")
    check(result["shipment"]["lifecycleStatus"] == "RECOVERED", "lifecycle RECOVERED after resolve")
    check(result["shipment"]["needsRecovery"] is False, "needsRecovery cleared after resolve")
    check(result["completion"]["resolved"] is True, "completion.resolved true")


def test_invalid_pickup_before_assignment() -> None:
    print("\n6. Invalid pickup before assignment")
    ids = _ids()
    db = _seed(ids)
    raised = None
    try:
        confirm_recovery_pickup(db, str(ids["ship"]))
    except RecoveryError as exc:
        raised = exc

    check(raised is not None, "pickup before assign raises RecoveryError")
    check(
        raised is not None and raised.code == "PICKUP_BEFORE_ASSIGNMENT",
        "error code PICKUP_BEFORE_ASSIGNMENT",
    )
    incident = db["incidents"].find_one({"_id": ids["inc"]})
    check(
        incident is not None and incident["status"] == "RECOVERY_REQUIRED",
        "incident status unchanged",
    )


def test_repeated_pickup_confirmation() -> None:
    print("\n7. Repeated pickup confirmation")
    ids = _ids()
    db = _seed(ids)
    _assign(db, ids)
    confirm_recovery_pickup(db, str(ids["ship"]))
    raised = None
    try:
        confirm_recovery_pickup(db, str(ids["ship"]))
    except RecoveryError as exc:
        raised = exc

    check(raised is not None, "second pickup raises RecoveryError")
    check(
        raised is not None and raised.code == "PICKUP_ALREADY_CONFIRMED",
        "error code PICKUP_ALREADY_CONFIRMED",
    )
    pickup_events = [
        e
        for e in db["shipmentevents"].docs
        if e.get("type") == "recovery_pickup_confirmed"
    ]
    check(len(pickup_events) == 1, "only one recovery_pickup_confirmed event")


def test_resolve_requires_pickup() -> None:
    print("\nBonus: resolve blocked until pickup confirmed")
    ids = _ids()
    db = _seed(ids)
    _assign(db, ids)
    raised = None
    try:
        resolve_recovery(db, str(ids["ship"]))
    except RecoveryError as exc:
        raised = exc
    check(raised is not None and raised.code == "PICKUP_NOT_CONFIRMED", "resolve needs pickup first")


def main() -> int:
    print("Recoverix recovery workflow tests")
    test_assign_and_driver_notification()
    test_pickup_confirmation_and_recovery_event()
    test_resolve_after_pickup()
    test_invalid_pickup_before_assignment()
    test_repeated_pickup_confirmation()
    test_resolve_requires_pickup()
    print()
    if _failures:
        print(f"{FAIL} {_failures} check(s) failed")
        return 1
    print(f"{PASS} All recovery workflow checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
