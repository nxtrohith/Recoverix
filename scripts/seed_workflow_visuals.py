#!/usr/bin/env python3
"""
Seed misplaced shipments at each recovery-workflow stage for frontend visuals.

Creates one active (or resolved) case per operator-facing display step:

  RECOVERY_REQUIRED → ASSIGNED → DRIVER_CONTACTED →
  PICKUP_CONFIRMED → RECOVERED → RESOLVED

Plus a RECOVERY_ANALYSIS case (plan available, not yet assigned).

Usage
-----
  uv run python scripts/seed_workflow_visuals.py
  uv run python scripts/seed_workflow_visuals.py --reset
  npm run seed:workflow-visuals
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from bson import ObjectId
from dotenv import load_dotenv

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))
load_dotenv(_ROOT / ".env")

from graph.graph_builder import connect_mongo
from graph.incident_service import _lifecycle_status
from graph.shipment_state import get_shipment_state

PREFIX = "SHP-WF-"
ROUTE_PREFIX = "ROUTE-WF-"

# Distinct Telangana corridors: origin → expected stop → dest; actual ≠ expected
SCENARIOS: list[dict[str, Any]] = [
    {
        "key": "REQUIRED",
        "tracking": f"{PREFIX}REQUIRED",
        "stage": "RECOVERY_REQUIRED",
        "origin": "Hyderabad_Shamshbd_H (Telangana)",
        "expected": "Medchal_MROoffce_D (Telangana)",
        "dest": "Karimnagar_KamnHbRD_I (Telangana)",
        "actual": "Kamareddy_Devenply_I (Telangana)",
        "priority": "high",
        "weight": 180.0,
    },
    {
        "key": "ANALYSIS",
        "tracking": f"{PREFIX}ANALYSIS",
        "stage": "RECOVERY_ANALYSIS",
        "origin": "Hyderabad_Shamshbd_H (Telangana)",
        "expected": "Miryalguda_Ragvendr_D (Telangana)",
        "dest": "Khammam_NSTRoad_I (Telangana)",
        "actual": "Nalgonda_HydRoad_DC (Telangana)",
        "priority": "high",
        "weight": 220.0,
    },
    {
        "key": "ASSIGNED",
        "tracking": f"{PREFIX}ASSIGNED",
        "stage": "ASSIGNED",
        "origin": "Hyderabad_Shamshbd_H (Telangana)",
        "expected": "Kodad_VidyaNgr_D (Telangana)",
        "dest": "Khammam_NSTRoad_I (Telangana)",
        "actual": "Miryalguda_Ragvendr_D (Telangana)",
        "priority": "medium",
        "weight": 150.0,
    },
    {
        "key": "CONTACTED",
        "tracking": f"{PREFIX}CONTACTED",
        "stage": "DRIVER_CONTACTED",
        "origin": "Hyderabad_Shamshbd_H (Telangana)",
        "expected": "Hyderabad_Uppal_I (Telangana)",
        "dest": "Karimnagar_KamnHbRD_I (Telangana)",
        "actual": "Bhuvanagiri_HBColny_D (Telangana)",
        "priority": "high",
        "weight": 310.0,
    },
    {
        "key": "PICKUP",
        "tracking": f"{PREFIX}PICKUP",
        "stage": "PICKUP_CONFIRMED",
        "origin": "Hyderabad_Shamshbd_H (Telangana)",
        "expected": "Warangal_HunterRd_I (Telangana)",
        "dest": "Karimnagar_KamnHbRD_I (Telangana)",
        "actual": "Jangaon_Hanmkond_D (Telangana)",
        "priority": "urgent",
        "weight": 95.0,
    },
    {
        "key": "RECOVERED",
        "tracking": f"{PREFIX}RECOVERED",
        "stage": "RECOVERED",
        "origin": "Hyderabad_Shamshbd_H (Telangana)",
        "expected": "Nalgonda_HydRoad_DC (Telangana)",
        "dest": "Khammam_NSTRoad_I (Telangana)",
        "actual": "Miryalguda_Ragvendr_D (Telangana)",
        "priority": "medium",
        "weight": 140.0,
    },
    {
        "key": "RESOLVED",
        "tracking": f"{PREFIX}RESOLVED",
        "stage": "RESOLVED",
        "origin": "Hyderabad_Shamshbd_H (Telangana)",
        "expected": "Medchal_MROoffce_D (Telangana)",
        "dest": "Karimnagar_KamnHbRD_I (Telangana)",
        "actual": "Kamareddy_Devenply_I (Telangana)",
        "priority": "low",
        "weight": 80.0,
    },
]


def _loc(db, graph_node_key: str, fallbacks: list[str] | None = None) -> dict:
    keys = [graph_node_key, *(fallbacks or [])]
    for key in keys:
        doc = db["locations"].find_one({"graphNodeKey": key})
        if doc is not None:
            return doc
    raise SystemExit(
        f"Location not found for any of {keys!r}. Run `npm run seed` first."
    )


def _pick_vehicle(db, hub_id: ObjectId) -> dict:
    vehicle = (
        db["vehicles"].find_one(
            {
                "currentLocation": hub_id,
                "status": {"$in": ["in_transit", "available", "loading"]},
            }
        )
        or db["vehicles"].find_one({"currentLocation": hub_id})
        or db["vehicles"].find_one({"status": {"$in": ["in_transit", "available"]}})
    )
    if vehicle is None:
        raise SystemExit("No vehicle found. Seed fleet data first (npm run seed).")
    return vehicle


def _cleanup_tracking(db, tracking: str) -> None:
    existing = db["shipments"].find_one({"trackingNumber": tracking})
    if not existing:
        db["routes"].delete_one({"routeCode": f"{ROUTE_PREFIX}{tracking}"})
        return
    ship_oid = existing["_id"]
    case_ids = [
        c["_id"] for c in db["recoverycases"].find({"shipment": ship_oid}, {"_id": 1})
    ]
    if case_ids:
        db["recoveryoptions"].delete_many({"recoveryCase": {"$in": case_ids}})
    db["shipmentevents"].delete_many({"shipment": ship_oid})
    db["incidents"].delete_many({"shipment": ship_oid})
    db["recoverycases"].delete_many({"shipment": ship_oid})
    db["shipments"].delete_one({"_id": ship_oid})
    if existing.get("assignedRoute"):
        db["routes"].delete_one({"_id": existing["assignedRoute"]})
    db["routes"].delete_one({"routeCode": f"{ROUTE_PREFIX}{tracking}"})


def _seed_one(db, scenario: dict[str, Any], *, now: datetime) -> dict[str, Any]:
    tracking = scenario["tracking"]
    origin = _loc(db, scenario["origin"])
    expected = _loc(db, scenario["expected"], scenario.get("expected_fallbacks"))
    dest = _loc(db, scenario["dest"])
    actual = _loc(db, scenario["actual"], scenario.get("actual_fallbacks"))
    if expected["_id"] == actual["_id"]:
        raise SystemExit(
            f"{tracking}: expected and actual hubs resolved to the same location"
        )

    vehicle = _pick_vehicle(db, actual["_id"])
    demo_phone = (os.getenv("SARVAM_DEMO_DRIVER_PHONE") or "+917780645727").strip()
    db["vehicles"].update_one(
        {"_id": vehicle["_id"]},
        {
            "$set": {
                "currentLocation": actual["_id"],
                "status": "in_transit",
                "phone": demo_phone,
                "driverPhone": demo_phone,
                "driverName": vehicle.get("driverName") or "Demo Driver",
                "updatedAt": now,
            }
        },
    )

    route_oid = ObjectId()
    ship_oid = ObjectId()
    route_code = f"{ROUTE_PREFIX}{scenario['key']}"
    db["routes"].delete_one({"routeCode": route_code})
    db["routes"].insert_one(
        {
            "_id": route_oid,
            "routeCode": route_code,
            "origin": origin["_id"],
            "destination": dest["_id"],
            "stops": [
                {
                    "location": expected["_id"],
                    "sequence": 1,
                    "estimatedArrival": now + timedelta(hours=2),
                    "estimatedDeparture": now + timedelta(hours=2, minutes=30),
                }
            ],
            "vehicle": vehicle["_id"],
            "distanceKm": 160.0,
            "estimatedDurationMinutes": 280,
            "scheduledDeparture": now - timedelta(hours=3),
            "scheduledArrival": now + timedelta(hours=6),
            "capacity": {"weight": 5000, "volume": 30},
            "currentLoad": {"weight": 900, "volume": 6},
            "status": "in_progress",
            "createdAt": now,
            "updatedAt": now,
        }
    )

    stage = scenario["stage"]
    shipment_status = "recovered" if stage in ("RECOVERED", "RESOLVED") else "misplaced"
    db["shipments"].insert_one(
        {
            "_id": ship_oid,
            "trackingNumber": tracking,
            "origin": origin["_id"],
            "destination": dest["_id"],
            "currentLocation": (
                dest["_id"] if stage in ("RECOVERED", "RESOLVED") else actual["_id"]
            ),
            "expectedLocation": expected["_id"],
            "weight": scenario["weight"],
            "volume": 1.0,
            "packageCount": 1,
            "priority": scenario["priority"],
            "deadline": now + timedelta(hours=18),
            "status": shipment_status,
            "assignedRoute": route_oid,
            "assignedVehicle": vehicle["_id"],
            "fragile": False,
            "createdAt": now - timedelta(hours=5),
            "updatedAt": now,
        }
    )

    t0 = now - timedelta(hours=5)
    t1 = now - timedelta(hours=4)
    t_misplaced = now - timedelta(hours=1)
    events: list[dict[str, Any]] = [
        {
            "shipment": ship_oid,
            "type": "created",
            "location": origin["_id"],
            "route": route_oid,
            "vehicle": vehicle["_id"],
            "timestamp": t0,
            "description": f"Shipment created — workflow visual seed ({stage})",
            "createdAt": t0,
            "updatedAt": t0,
        },
        {
            "shipment": ship_oid,
            "type": "departed_hub",
            "location": origin["_id"],
            "route": route_oid,
            "vehicle": vehicle["_id"],
            "timestamp": t1,
            "description": f"Departed origin; expected next {expected['graphNodeKey']}",
            "createdAt": t1,
            "updatedAt": t1,
        },
        {
            "shipment": ship_oid,
            "type": "arrived_hub",
            "location": actual["_id"],
            "route": route_oid,
            "vehicle": vehicle["_id"],
            "timestamp": now - timedelta(minutes=90),
            "description": (
                f"Confirmed at wrong hub {actual['graphNodeKey']} "
                f"(expected {expected['graphNodeKey']})"
            ),
            "createdAt": now - timedelta(minutes=90),
            "updatedAt": now - timedelta(minutes=90),
        },
        {
            "shipment": ship_oid,
            "type": "misplaced",
            "location": actual["_id"],
            "route": route_oid,
            "vehicle": vehicle["_id"],
            "timestamp": t_misplaced,
            "description": f"Misplaced for workflow visual stage {stage}",
            "createdAt": t_misplaced,
            "updatedAt": t_misplaced,
        },
    ]

    recovery_case_oid = ObjectId()
    option_oid = ObjectId()
    recovery_path = [
        actual["graphNodeKey"],
        dest["graphNodeKey"],
    ]
    candidate_id = f"cand-{scenario['key'].lower()}-{uuid4().hex[:6]}"

    db["recoverycases"].insert_one(
        {
            "_id": recovery_case_oid,
            "shipment": ship_oid,
            "detectedAt": t_misplaced,
            "detectedLocation": actual["_id"],
            "reason": "wrong_hub",
            "severity": scenario["priority"],
            "status": "closed" if stage == "RESOLVED" else "open",
            "selectedOption": (
                option_oid
                if stage
                in (
                    "RECOVERY_ANALYSIS",
                    "ASSIGNED",
                    "DRIVER_CONTACTED",
                    "PICKUP_CONFIRMED",
                    "RECOVERED",
                    "RESOLVED",
                )
                else None
            ),
            "createdAt": t_misplaced,
            "updatedAt": now,
        }
    )

    needs_option = stage in (
        "RECOVERY_ANALYSIS",
        "ASSIGNED",
        "DRIVER_CONTACTED",
        "PICKUP_CONFIRMED",
        "RECOVERED",
        "RESOLVED",
    )
    if needs_option:
        option_status = {
            "RECOVERY_ANALYSIS": "selected",
            "ASSIGNED": "executing",
            "DRIVER_CONTACTED": "executing",
            "PICKUP_CONFIRMED": "executing",
            "RECOVERED": "completed",
            "RESOLVED": "completed",
        }[stage]
        db["recoveryoptions"].insert_one(
            {
                "_id": option_oid,
                "recoveryCase": recovery_case_oid,
                "shipment": ship_oid,
                "candidateId": candidate_id,
                "vehicle": vehicle["_id"],
                "route": route_oid,
                "pickupLocation": actual["_id"],
                "dropoffLocation": dest["_id"],
                "pickupCase": "at_node",
                "path": recovery_path,
                "existingRouteNodes": recovery_path,
                "vehicleToPickupPath": [actual["graphNodeKey"]],
                "vehicleToDestinationPath": recovery_path,
                "estimatedExtraKm": 12.0,
                "estimatedExtraMinutes": 25,
                "estimatedCost": 450.0,
                "scores": {
                    "deliveryTime": 0.82,
                    "cost": 0.75,
                    "capacity": 0.9,
                    "deadline": 0.88,
                    "priority": 0.8,
                    "detour": 0.7,
                    "connectivity": 0.65,
                    "total": 0.81,
                },
                "rank": 1,
                "status": option_status,
                "explanation": [
                    "Seeded recovery option for frontend workflow visuals",
                    f"Pickup at {actual['graphNodeKey']}",
                    f"Drop at {dest['graphNodeKey']}",
                ],
                "createdAt": t_misplaced + timedelta(minutes=5),
                "updatedAt": now,
            }
        )

    # Map visual stage → incident fields
    if stage == "RECOVERY_REQUIRED":
        incident_status = "RECOVERY_REQUIRED"
        analysis_status = None
        driver_message = None
        assigned_at = None
        pickup_at = None
        resolved_at = None
        recovery_vehicle = None
        selected_option = None
    elif stage == "RECOVERY_ANALYSIS":
        incident_status = "RECOVERY_REQUIRED"
        analysis_status = "RECOVERY_PLAN_AVAILABLE"
        driver_message = None
        assigned_at = None
        pickup_at = None
        resolved_at = None
        recovery_vehicle = None
        selected_option = option_oid
    elif stage == "ASSIGNED":
        incident_status = "ASSIGNED"
        analysis_status = "RECOVERY_PLAN_AVAILABLE"
        driver_message = None
        assigned_at = now - timedelta(minutes=40)
        pickup_at = None
        resolved_at = None
        recovery_vehicle = vehicle["_id"]
        selected_option = option_oid
        events.append(
            {
                "shipment": ship_oid,
                "type": "recovery_started",
                "location": actual["_id"],
                "route": route_oid,
                "vehicle": vehicle["_id"],
                "timestamp": assigned_at,
                "description": "Recovery vehicle assigned (visual seed)",
                "createdAt": assigned_at,
                "updatedAt": assigned_at,
            }
        )
    elif stage == "DRIVER_CONTACTED":
        incident_status = "ASSIGNED"
        analysis_status = "RECOVERY_PLAN_AVAILABLE"
        driver_message = (
            f"Please pick up misplaced shipment {tracking} from "
            f"{actual['graphNodeKey']} and carry it toward {dest['graphNodeKey']}."
        )
        assigned_at = now - timedelta(minutes=50)
        pickup_at = None
        resolved_at = None
        recovery_vehicle = vehicle["_id"]
        selected_option = option_oid
        events.append(
            {
                "shipment": ship_oid,
                "type": "recovery_started",
                "location": actual["_id"],
                "route": route_oid,
                "vehicle": vehicle["_id"],
                "timestamp": assigned_at,
                "description": "Recovery assigned + driver contacted (visual seed)",
                "createdAt": assigned_at,
                "updatedAt": assigned_at,
            }
        )
    elif stage == "PICKUP_CONFIRMED":
        incident_status = "PICKUP_CONFIRMED"
        analysis_status = "RECOVERY_PLAN_AVAILABLE"
        driver_message = (
            f"Pickup confirmed for {tracking} at {actual['graphNodeKey']}."
        )
        assigned_at = now - timedelta(hours=1, minutes=20)
        pickup_at = now - timedelta(minutes=25)
        resolved_at = None
        recovery_vehicle = vehicle["_id"]
        selected_option = option_oid
        events.extend(
            [
                {
                    "shipment": ship_oid,
                    "type": "recovery_started",
                    "location": actual["_id"],
                    "route": route_oid,
                    "vehicle": vehicle["_id"],
                    "timestamp": assigned_at,
                    "description": "Recovery vehicle assigned",
                    "createdAt": assigned_at,
                    "updatedAt": assigned_at,
                },
                {
                    "shipment": ship_oid,
                    "type": "recovery_pickup_confirmed",
                    "location": actual["_id"],
                    "route": route_oid,
                    "vehicle": vehicle["_id"],
                    "timestamp": pickup_at,
                    "description": "Driver confirmed pickup of misplaced shipment",
                    "createdAt": pickup_at,
                    "updatedAt": pickup_at,
                },
            ]
        )
    elif stage == "RECOVERED":
        # Still active until operator resolves — shipment already recovered
        incident_status = "PICKUP_CONFIRMED"
        analysis_status = "RECOVERY_PLAN_AVAILABLE"
        driver_message = f"Recovered {tracking}; awaiting incident close."
        assigned_at = now - timedelta(hours=2)
        pickup_at = now - timedelta(hours=1)
        resolved_at = None
        recovery_vehicle = vehicle["_id"]
        selected_option = option_oid
        events.extend(
            [
                {
                    "shipment": ship_oid,
                    "type": "recovery_started",
                    "location": actual["_id"],
                    "route": route_oid,
                    "vehicle": vehicle["_id"],
                    "timestamp": assigned_at,
                    "description": "Recovery vehicle assigned",
                    "createdAt": assigned_at,
                    "updatedAt": assigned_at,
                },
                {
                    "shipment": ship_oid,
                    "type": "recovery_pickup_confirmed",
                    "location": actual["_id"],
                    "route": route_oid,
                    "vehicle": vehicle["_id"],
                    "timestamp": pickup_at,
                    "description": "Pickup confirmed",
                    "createdAt": pickup_at,
                    "updatedAt": pickup_at,
                },
                {
                    "shipment": ship_oid,
                    "type": "recovered",
                    "location": dest["_id"],
                    "route": route_oid,
                    "vehicle": vehicle["_id"],
                    "timestamp": now - timedelta(minutes=20),
                    "description": "Shipment recovered at destination corridor",
                    "createdAt": now - timedelta(minutes=20),
                    "updatedAt": now - timedelta(minutes=20),
                },
            ]
        )
    else:  # RESOLVED
        incident_status = "RESOLVED"
        analysis_status = "RECOVERY_PLAN_AVAILABLE"
        driver_message = f"Incident closed for {tracking}."
        assigned_at = now - timedelta(hours=3)
        pickup_at = now - timedelta(hours=2)
        resolved_at = now - timedelta(minutes=10)
        recovery_vehicle = vehicle["_id"]
        selected_option = option_oid
        events.extend(
            [
                {
                    "shipment": ship_oid,
                    "type": "recovery_started",
                    "location": actual["_id"],
                    "route": route_oid,
                    "vehicle": vehicle["_id"],
                    "timestamp": assigned_at,
                    "description": "Recovery vehicle assigned",
                    "createdAt": assigned_at,
                    "updatedAt": assigned_at,
                },
                {
                    "shipment": ship_oid,
                    "type": "recovery_pickup_confirmed",
                    "location": actual["_id"],
                    "route": route_oid,
                    "vehicle": vehicle["_id"],
                    "timestamp": pickup_at,
                    "description": "Pickup confirmed",
                    "createdAt": pickup_at,
                    "updatedAt": pickup_at,
                },
                {
                    "shipment": ship_oid,
                    "type": "recovered",
                    "location": dest["_id"],
                    "route": route_oid,
                    "vehicle": vehicle["_id"],
                    "timestamp": resolved_at - timedelta(minutes=5),
                    "description": "Shipment recovered",
                    "createdAt": resolved_at - timedelta(minutes=5),
                    "updatedAt": resolved_at - timedelta(minutes=5),
                },
            ]
        )

    db["shipmentevents"].insert_many(events)

    incident_id = f"INC-WF-{scenario['key'][:6]}-{uuid4().hex[:4].upper()}"
    incident_doc = {
        "incidentId": incident_id,
        "shipment": ship_oid,
        "vehicle": vehicle["_id"],
        "incidentType": "MISPLACED_SHIPMENT",
        "hub": actual["_id"],
        "status": incident_status,
        "selectedCandidateId": candidate_id if needs_option else None,
        "recoveryVehicle": recovery_vehicle,
        "recoveryPath": recovery_path if recovery_vehicle else [],
        "existingRouteNodes": recovery_path if recovery_vehicle else [],
        "vehicleToPickupPath": [actual["graphNodeKey"]] if recovery_vehicle else [],
        "vehicleToDestinationPath": recovery_path if recovery_vehicle else [],
        "pickupCase": "at_node" if recovery_vehicle else None,
        "pickupNode": actual["graphNodeKey"],
        "destinationNode": dest["graphNodeKey"],
        "recoveryScore": 0.81 if needs_option else None,
        "recoveryCase": recovery_case_oid,
        "selectedRecoveryOption": selected_option,
        "driverMessage": driver_message,
        "driverCallChannel": "simulated" if stage == "DRIVER_CONTACTED" else None,
        "driverCallAttemptId": (
            f"call-{uuid4().hex[:8]}" if stage == "DRIVER_CONTACTED" else None
        ),
        "driverCallStatus": "delivered" if stage == "DRIVER_CONTACTED" else None,
        "analysisStatus": analysis_status,
        "assignedAt": assigned_at,
        "pickupConfirmedAt": pickup_at,
        "resolvedAt": resolved_at,
        "createdAt": t_misplaced,
        "updatedAt": now,
    }
    db["incidents"].insert_one(incident_doc)

    state = get_shipment_state(db, str(ship_oid))
    lifecycle = _lifecycle_status(shipment_status, incident_doc)
    return {
        "tracking": tracking,
        "stage": stage,
        "incidentId": incident_id,
        "incidentStatus": incident_status,
        "lifecycle": lifecycle,
        "expected": state.expected_node if state else None,
        "actual": state.actual_node if state else None,
        "misplaced": state.is_misplaced if state else None,
    }


def seed(db, *, reset: bool) -> list[dict[str, Any]]:
    now = datetime.now(tz=timezone.utc)
    trackings = [s["tracking"] for s in SCENARIOS]
    existing = list(db["shipments"].find({"trackingNumber": {"$in": trackings}}))
    if existing and not reset:
        print("Workflow visual shipments already exist:")
        for s in existing:
            print(f"  {s['trackingNumber']} ({s['_id']})")
        print("Re-run with --reset to recreate.")
        return []

    if reset:
        for tracking in trackings:
            _cleanup_tracking(db, tracking)
        print(f"Reset {len(trackings)} workflow visual shipments")

    results = []
    for scenario in SCENARIOS:
        results.append(_seed_one(db, scenario, now=now))
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete and recreate workflow visual shipments",
    )
    args = parser.parse_args()
    db = connect_mongo()
    results = seed(db, reset=args.reset)
    if not results:
        return

    print("\nWorkflow visual shipments seeded:\n")
    print(f"{'Tracking':<22} {'Stage':<20} {'Incident':<14} {'Lifecycle':<20} Misplaced")
    print("-" * 90)
    for r in results:
        print(
            f"{r['tracking']:<22} {r['stage']:<20} {r['incidentStatus']:<14} "
            f"{r['lifecycle']:<20} {r['misplaced']}"
        )
        print(f"  expected={r['expected']}")
        print(f"  actual  ={r['actual']}")
        print(f"  incident={r['incidentId']}")
    print("\nOpen Recovery page and select each SHP-WF-* shipment to inspect timelines.")


if __name__ == "__main__":
    main()
