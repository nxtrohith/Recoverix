#!/usr/bin/env python3
"""
Tests for Recoverix recovery plan persistence.

Cases:
  1. Feasible analysis creates a recovery plan
  2. No-feasible-recovery creates no assignment / no selected plan
  3. Repeated analysis does not create uncontrolled duplicates
  4. Assignment uses the persisted selected candidate
  5. Persisted plan contains score + explanation data
  6. Resolve updates the recovery plan / incident consistently

Usage:
  uv run python scripts/test_recovery_persistence.py
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
from graph.recovery_persistence import (
    get_selected_recovery_option,
    persist_analysis_plan,
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
        before = len(self.docs)
        self.docs[:] = [d for d in self.docs if not _matches(d, query)]

        class _R:
            deleted_count = before - len(self.docs)

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
        "veh2": ObjectId(),
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
                    "currentRoute": None,
                },
                {
                    "_id": ids["veh2"],
                    "vehicleNumber": "TS-09-RCV-02",
                    "status": "in_transit",
                    "currentLocation": ids["origin"],
                    "currentRoute": None,
                },
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
                    "selectedRecoveryOption": None,
                    "driverMessage": None,
                    "analysisStatus": None,
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
                    "status": "open",
                    "selectedOption": None,
                }
            ],
            "recoveryoptions": [],
            "shipmentevents": [],
        }
    )


def _feasible_analysis(ids: dict[str, ObjectId]) -> dict[str, Any]:
    breakdown = {
        "time": 0.82,
        "cost": 0.71,
        "capacity": 0.9,
        "deadline": 0.75,
        "priority": 0.85,
        "detour": 0.88,
        "connectivity": 0.55,
    }
    metrics = {
        "distance": 42.5,
        "travelTime": 95.0,
        "cost": 1190.0,
        "availableCapacity": {"weight": 200.0, "volume": 4.0},
        "deadlineBuffer": 120.0,
    }
    selected = {
        "candidateId": "cand-piggy-1",
        "vehicleId": str(ids["veh"]),
        "vehicleNumber": "TS-09-RCV-01",
        "pickupCase": "pass_through",
        "path": ["Warangal Hub", "Karimnagar Hub"],
        "score": 0.87,
        "explanation": "Pass-through piggyback with strong capacity and low detour",
        "estimatedCost": 1190.0,
        "estimatedDistance": 42.5,
        "estimatedTravelTimeMin": 95.0,
    }
    return {
        "status": "RECOVERY_PLAN_AVAILABLE",
        "network": {
            "actualNode": "Warangal Hub",
            "currentNode": "Warangal Hub",
            "destinationNode": "Karimnagar Hub",
        },
        "selectedRecovery": selected,
        "candidates": [
            {
                **selected,
                "feasible": True,
                "breakdown": breakdown,
                "componentScores": breakdown,
                "metrics": metrics,
            },
            {
                "candidateId": "cand-detour-2",
                "vehicleId": str(ids["veh2"]),
                "vehicleNumber": "TS-09-RCV-02",
                "pickupCase": "detour",
                "path": ["Hyderabad Hub", "Warangal Hub", "Karimnagar Hub"],
                "feasible": True,
                "score": 0.61,
                "breakdown": {**breakdown, "detour": 0.3},
                "metrics": {**metrics, "distance": 80.0, "cost": 2240.0},
                "explanation": "Detour option ranked lower",
            },
            {
                "candidateId": "cand-reject-3",
                "vehicleId": str(ids["veh2"]),
                "vehicleNumber": "TS-09-RCV-02",
                "pickupCase": "detour",
                "path": [],
                "feasible": False,
                "score": None,
                "rejectionReason": "Insufficient residual capacity",
                "breakdown": None,
                "metrics": None,
                "explanation": "Insufficient residual capacity",
            },
        ],
        "reasons": [],
    }


def _no_feasible_analysis() -> dict[str, Any]:
    return {
        "status": "NO_FEASIBLE_RECOVERY",
        "network": {
            "actualNode": "Warangal Hub",
            "currentNode": "Warangal Hub",
            "destinationNode": "Karimnagar Hub",
        },
        "selectedRecovery": None,
        "candidates": [
            {
                "candidateId": "cand-reject-1",
                "vehicleId": str(ObjectId()),
                "pickupCase": "detour",
                "path": [],
                "feasible": False,
                "score": None,
                "rejectionReason": "No path to destination",
            }
        ],
        "reasons": ["No path to destination"],
    }


def test_feasible_creates_plan() -> None:
    print("\n1. Feasible analysis creates a recovery plan")
    ids = _ids()
    db = _seed(ids)
    ship = db["shipments"].find_one({"_id": ids["ship"]})
    incident = db["incidents"].find_one({"_id": ids["inc"]})
    assert ship and incident

    plan = persist_analysis_plan(
        db,
        shipment=ship,
        analysis=_feasible_analysis(ids),
        incident=incident,
    )

    check(plan is not None, "recoveryPlan returned")
    check(plan is not None and plan.get("status") == "selected", "plan status=selected")
    check(
        plan is not None and plan.get("selectedVehicleId") == str(ids["veh"]),
        "selectedVehicleId stored",
    )
    check(
        plan is not None and plan.get("candidateType") == "pass_through",
        "candidateType/pickupCase stored",
    )
    check(
        plan is not None and plan.get("path") == ["Warangal Hub", "Karimnagar Hub"],
        "route/path stored",
    )

    case = db["recoverycases"].find_one({"_id": ids["case"]})
    check(
        case is not None and case.get("selectedOption") is not None,
        "recoverycase.selectedOption set",
    )
    check(
        case is not None and case.get("status") == "options_generated",
        "recoverycase → options_generated",
    )

    selected_count = db["recoveryoptions"].count_documents(
        {"recoveryCase": ids["case"], "status": "selected"}
    )
    rejected_count = db["recoveryoptions"].count_documents(
        {"recoveryCase": ids["case"], "status": "rejected"}
    )
    check(selected_count == 1, "exactly one selected option")
    check(rejected_count == 2, "rejected alternatives stored for audit")

    incident = db["incidents"].find_one({"_id": ids["inc"]})
    check(
        incident is not None
        and incident.get("analysisStatus") == "RECOVERY_PLAN_AVAILABLE",
        "incident analysisStatus stamped",
    )
    check(
        incident is not None and incident.get("selectedRecoveryOption") is not None,
        "incident.selectedRecoveryOption linked",
    )


def test_no_feasible_creates_no_assignment() -> None:
    print("\n2. No-feasible-recovery creates no selected plan / no assignment")
    ids = _ids()
    db = _seed(ids)
    ship = db["shipments"].find_one({"_id": ids["ship"]})
    incident = db["incidents"].find_one({"_id": ids["inc"]})
    assert ship and incident

    plan = persist_analysis_plan(
        db,
        shipment=ship,
        analysis=_no_feasible_analysis(),
        incident=incident,
    )
    check(plan is None, "no recoveryPlan when infeasible")

    selected_count = db["recoveryoptions"].count_documents(
        {"recoveryCase": ids["case"], "status": "selected"}
    )
    check(selected_count == 0, "no selected recoveryoption")

    case = db["recoverycases"].find_one({"_id": ids["case"]})
    check(
        case is not None and case.get("selectedOption") is None,
        "recoverycase.selectedOption cleared",
    )

    # Assign without a persisted plan and without client candidate should fail
    # after a no-feasible analyze would leave nothing to assign — simulate by
    # calling assign with no client snapshot (would re-run engine in prod).
    # Here we assert the DB has nothing assignable from persistence.
    opt = get_selected_recovery_option(db, ids["case"])
    check(opt is None, "get_selected_recovery_option returns None")


def test_repeated_analysis_idempotent() -> None:
    print("\n3. Repeated analysis does not create uncontrolled duplicates")
    ids = _ids()
    db = _seed(ids)
    ship = db["shipments"].find_one({"_id": ids["ship"]})
    incident = db["incidents"].find_one({"_id": ids["inc"]})
    assert ship and incident
    analysis = _feasible_analysis(ids)

    plan1 = persist_analysis_plan(
        db, shipment=ship, analysis=analysis, incident=incident
    )
    plan2 = persist_analysis_plan(
        db, shipment=ship, analysis=analysis, incident=incident
    )

    check(plan1 is not None and plan2 is not None, "both analyzes return a plan")
    check(
        plan1 is not None
        and plan2 is not None
        and plan1["id"] == plan2["id"],
        "same recoveryoption id reused (idempotent)",
    )

    selected_count = db["recoveryoptions"].count_documents(
        {"recoveryCase": ids["case"], "status": "selected"}
    )
    check(selected_count == 1, "still exactly one selected option")

    # Rejected set refreshed, not stacked unboundedly
    rejected_count = db["recoveryoptions"].count_documents(
        {"recoveryCase": ids["case"], "status": "rejected"}
    )
    check(rejected_count == 2, "rejected alternatives replaced, not duplicated")


def test_assign_uses_persisted_plan() -> None:
    print("\n4. Assignment uses the persisted selected candidate")
    ids = _ids()
    db = _seed(ids)
    ship = db["shipments"].find_one({"_id": ids["ship"]})
    incident = db["incidents"].find_one({"_id": ids["inc"]})
    assert ship and incident

    plan = persist_analysis_plan(
        db,
        shipment=ship,
        analysis=_feasible_analysis(ids),
        incident=incident,
    )
    assert plan is not None

    # Assign with no client candidate — must use persisted plan (no recompute)
    result = assign_recovery(db, str(ids["ship"]))

    check(
        result["assignment"]["candidateId"] == "cand-piggy-1",
        "assignment candidateId from persisted plan",
    )
    check(
        result["assignment"]["vehicleId"] == str(ids["veh"]),
        "assignment vehicleId from persisted plan",
    )
    check(
        result["assignment"]["path"] == ["Warangal Hub", "Karimnagar Hub"],
        "assignment path from persisted plan",
    )
    check(
        result["assignment"].get("recoveryOptionId") == plan["id"],
        "assignment references persisted recoveryOptionId",
    )
    check(result.get("recovery") is None, "orchestrator not re-invoked when plan exists")

    opt = db["recoveryoptions"].find_one({"_id": ObjectId(plan["id"])})
    check(
        opt is not None and opt.get("status") == "executing",
        "option status → executing after assign",
    )
    case = db["recoverycases"].find_one({"_id": ids["case"]})
    check(
        case is not None and case.get("status") == "option_selected",
        "recoverycase → option_selected",
    )


def test_persisted_plan_has_score_explanation() -> None:
    print("\n5. Persisted plan contains score + explanation data")
    ids = _ids()
    db = _seed(ids)
    ship = db["shipments"].find_one({"_id": ids["ship"]})
    incident = db["incidents"].find_one({"_id": ids["inc"]})
    assert ship and incident

    plan = persist_analysis_plan(
        db,
        shipment=ship,
        analysis=_feasible_analysis(ids),
        incident=incident,
    )
    assert plan is not None

    check(plan.get("score") == 0.87, "score persisted")
    check(isinstance(plan.get("componentScores"), dict), "componentScores present")
    comps = plan.get("componentScores") or {}
    check("detour" in comps and "connectivity" in comps, "detour + connectivity stored")
    check(plan.get("estimatedTime") == 95.0, "estimatedTime persisted")
    check(plan.get("estimatedDistance") == 42.5, "estimatedDistance persisted")
    check(plan.get("estimatedCost") == 1190.0, "estimatedCost persisted")
    check(
        "piggyback" in (plan.get("explanation") or "").lower()
        or "pass-through" in (plan.get("explanation") or "").lower(),
        "explanation persisted",
    )
    check(plan.get("driverId") == "TS-09-RCV-01", "driverId (vehicle number) persisted")
    check(plan.get("pickupNode") == "Warangal Hub", "pickupNode persisted")
    check(plan.get("destinationNode") == "Karimnagar Hub", "destinationNode persisted")


def test_resolve_updates_plan_and_incident() -> None:
    print("\n6. Resolve updates the recovery plan / incident consistently")
    ids = _ids()
    db = _seed(ids)
    ship = db["shipments"].find_one({"_id": ids["ship"]})
    incident = db["incidents"].find_one({"_id": ids["inc"]})
    assert ship and incident

    plan = persist_analysis_plan(
        db,
        shipment=ship,
        analysis=_feasible_analysis(ids),
        incident=incident,
    )
    assert plan is not None

    assign_recovery(db, str(ids["ship"]))
    confirm_recovery_pickup(db, str(ids["ship"]))
    result = resolve_recovery(db, str(ids["ship"]))

    incident = db["incidents"].find_one({"_id": ids["inc"]})
    case = db["recoverycases"].find_one({"_id": ids["case"]})
    opt = db["recoveryoptions"].find_one({"_id": ObjectId(plan["id"])})

    check(incident is not None and incident["status"] == "RESOLVED", "incident RESOLVED")
    check(
        case is not None and case.get("status") == "resolved",
        "recoverycase → resolved",
    )
    check(
        opt is not None and opt.get("status") == "completed",
        "recoveryoption → completed",
    )
    check(result["completion"]["resolved"] is True, "completion.resolved true")
    check(result["shipment"]["lifecycleStatus"] == "RECOVERED", "lifecycle RECOVERED")


def main() -> int:
    print("Recoverix recovery plan persistence tests")
    test_feasible_creates_plan()
    test_no_feasible_creates_no_assignment()
    test_repeated_analysis_idempotent()
    test_assign_uses_persisted_plan()
    test_persisted_plan_has_score_explanation()
    test_resolve_updates_plan_and_incident()
    print()
    if _failures:
        print(f"{FAIL} {_failures} check(s) failed")
        return 1
    print(f"{PASS} All recovery persistence checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
