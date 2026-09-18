#!/usr/bin/env python3
"""
Seed the SH-205 demo misplaced-shipment scenario.

City-level story (README):
  Expected: Hyderabad → Siddipet → Karimnagar
  Actual:   Hyderabad → Nizamabad   ← misplaced
  Pickup:   Nizamabad → piggyback toward Karimnagar

Observed Telangana topology has no Siddipet / Nizamabad hubs, so this seed
maps the story onto existing graph nodes:

  Origin / Hyderabad : Hyderabad_Shamshbd_H (Telangana)
  Expected next      : Medchal_MROoffce_D (Telangana)   ≈ planned intermediate
  Destination        : Karimnagar_KamnHbRD_I (Telangana)
  Actual / pickup    : Kamareddy_Devenply_I (Telangana) ≈ Nizamabad corridor

Kamareddy → Karimnagar is an existing directed edge, so recovery can find
an at_node / pass_through piggyback candidate without inventing topology.

Usage
-----
  uv run python scripts/seed_demo_misplaced.py
  uv run python scripts/seed_demo_misplaced.py --reset
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from bson import ObjectId

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from graph.graph_builder import connect_mongo
from graph.shipment_state import get_shipment_state

TRACKING = "SHP-DEMO-MISPLACED"
ROUTE_CODE = "ROUTE-DEMO-HYD-KRM"

HYD = "Hyderabad_Shamshbd_H (Telangana)"
EXPECTED_STOP = "Medchal_MROoffce_D (Telangana)"  # planned next (≈ Siddipet story)
DEST = "Karimnagar_KamnHbRD_I (Telangana)"
ACTUAL = "Kamareddy_Devenply_I (Telangana)"  # wrong hub (≈ Nizamabad story)


def _loc(db, graph_node_key: str) -> dict:
    doc = db["locations"].find_one({"graphNodeKey": graph_node_key})
    if doc is None:
        raise SystemExit(
            f"Location with graphNodeKey={graph_node_key!r} not found. "
            "Run `npm run seed` first."
        )
    return doc


def seed(db, *, reset: bool) -> str:
    now = datetime.now(tz=timezone.utc)
    hyd = _loc(db, HYD)
    expected_stop = _loc(db, EXPECTED_STOP)
    dest = _loc(db, DEST)
    actual = _loc(db, ACTUAL)

    existing = db["shipments"].find_one({"trackingNumber": TRACKING})
    if existing and not reset:
        print(f"Demo shipment already exists: {TRACKING} ({existing['_id']})")
        print("  Re-run with --reset to recreate.")
        return str(existing["_id"])

    if existing and reset:
        ship_oid = existing["_id"]
        db["shipmentevents"].delete_many({"shipment": ship_oid})
        db["incidents"].delete_many({"shipment": ship_oid})
        db["recoverycases"].delete_many({"shipment": ship_oid})
        db["shipments"].delete_one({"_id": ship_oid})
        if existing.get("assignedRoute"):
            db["routes"].delete_one({"_id": existing["assignedRoute"]})
        db["routes"].delete_one({"routeCode": ROUTE_CODE})
        print(f"Reset previous demo shipment {TRACKING}")

    # Vehicle already at the actual (misplaced) hub for at_node piggyback
    vehicle = db["vehicles"].find_one(
        {
            "currentLocation": actual["_id"],
            "status": {"$in": ["in_transit", "available", "loading"]},
        }
    ) or db["vehicles"].find_one({"currentLocation": actual["_id"]})

    if vehicle is None:
        # Fall back: any vehicle whose currentRoute destination is Karimnagar
        vehicle = db["vehicles"].find_one({"status": {"$in": ["in_transit", "available"]}})

    route_oid = ObjectId()
    ship_oid = ObjectId()

    db["routes"].delete_one({"routeCode": ROUTE_CODE})

    # Planned route: Hyd → Medchal (expected) → Karimnagar
    if vehicle is None:
        raise SystemExit(
            "No vehicle found to attach to the demo route. "
            "Seed fleet data first (npm run seed)."
        )

    db["routes"].insert_one(
        {
            "_id": route_oid,
            "routeCode": ROUTE_CODE,
            "origin": hyd["_id"],
            "destination": dest["_id"],
            "stops": [
                {
                    "location": expected_stop["_id"],
                    "sequence": 1,
                    "estimatedArrival": now + timedelta(hours=2),
                    "estimatedDeparture": now + timedelta(hours=2, minutes=30),
                }
            ],
            "vehicle": vehicle["_id"],
            "distanceKm": 180.0,
            "estimatedDurationMinutes": 300,
            "scheduledDeparture": now - timedelta(hours=3),
            "scheduledArrival": now + timedelta(hours=5),
            "capacity": {"weight": 5000, "volume": 30},
            "currentLoad": {"weight": 1200, "volume": 8},
            "status": "in_progress",
            "createdAt": now,
            "updatedAt": now,
        }
    )

    # Place recovery vehicle at the actual (misplaced) hub for at_node pickup
    db["vehicles"].update_one(
        {"_id": vehicle["_id"]},
        {
            "$set": {
                "currentLocation": actual["_id"],
                "status": "in_transit",
                "updatedAt": now,
            }
        },
    )
    vehicle_id = vehicle["_id"]

    db["shipments"].insert_one(
        {
            "_id": ship_oid,
            "trackingNumber": TRACKING,
            "origin": hyd["_id"],
            "destination": dest["_id"],
            # ACTUAL last-confirmed hub (wrong corridor) — recovery pickup
            "currentLocation": actual["_id"],
            # EXPECTED hub per planned route progress (Medchal stop)
            "expectedLocation": expected_stop["_id"],
            "weight": 250.0,
            "volume": 1.2,
            "packageCount": 2,
            "priority": "high",
            "deadline": now + timedelta(hours=20),
            "status": "in_transit",
            "assignedRoute": route_oid,
            "assignedVehicle": vehicle_id,
            "fragile": False,
            "createdAt": now - timedelta(hours=4),
            "updatedAt": now,
        }
    )

    # On-route progress: left Hyderabad → expected next = Medchal stop
    t0 = now - timedelta(hours=4)
    t1 = now - timedelta(hours=3)
    db["shipmentevents"].insert_many(
        [
            {
                "shipment": ship_oid,
                "type": "created",
                "location": hyd["_id"],
                "route": route_oid,
                "vehicle": vehicle_id,
                "timestamp": t0,
                "description": "Shipment created at Hyderabad hub",
                "createdAt": t0,
                "updatedAt": t0,
            },
            {
                "shipment": ship_oid,
                "type": "departed_hub",
                "location": hyd["_id"],
                "route": route_oid,
                "vehicle": vehicle_id,
                "timestamp": t1,
                "description": (
                    "Departed Hyderabad — expected next hub is planned stop "
                    f"{EXPECTED_STOP}"
                ),
                "createdAt": t1,
                "updatedAt": t1,
            },
            {
                "shipment": ship_oid,
                "type": "arrived_hub",
                "location": actual["_id"],
                "route": route_oid,
                "vehicle": vehicle_id,
                "timestamp": now - timedelta(minutes=45),
                "description": (
                    f"Last confirmed at wrong hub {ACTUAL} "
                    f"(expected {EXPECTED_STOP})"
                ),
                "createdAt": now,
                "updatedAt": now,
            },
        ]
    )

    state = get_shipment_state(db, str(ship_oid))
    assert state is not None
    print("\nDemo shipment seeded:")
    print(f"  trackingNumber : {TRACKING}")
    print(f"  shipmentId     : {ship_oid}")
    print(f"  planned route  : {' → '.join(state.planned_route_nodes)}")
    print(f"  expectedNode   : {state.expected_node}")
    print(f"  actualNode     : {state.actual_node}")
    print(f"  is_misplaced   : {state.is_misplaced}")
    print(f"  needs_recovery : {state.needs_recovery}")
    if state.expected_node == state.actual_node:
        print("  WARNING: expected == actual — check seed data")
    print("\nNext:")
    print(f"  uv run python scripts/demo_orchestrator.py {TRACKING}")
    print(f"  POST /api/incidents/simulate  shipment_id={TRACKING}")
    return str(ship_oid)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete and recreate the demo shipment if it already exists",
    )
    args = parser.parse_args()
    db = connect_mongo()
    seed(db, reset=args.reset)


if __name__ == "__main__":
    main()
