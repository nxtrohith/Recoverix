"""
graph/demo_cases.py
-------------------
Three pre-built demo scenarios for the SH-205 recovery use case switcher.

Each case demonstrates a different truck recovery pattern:
  Case 1 -- at_node     : truck already AT the misplaced hub -> direct piggyback
  Case 2 -- detour      : truck must DIVERT off its route to collect the package
  Case 3 -- pass_through: truck's route NATURALLY PASSES through the pickup hub

Driver phones from env vars:
    DEMO_DRIVER_1_PHONE  -- Ramesh (Telugu)
    DEMO_DRIVER_2_PHONE  -- Priya   (Hindi)
    DEMO_DRIVER_3_PHONE  -- Arjun   (English)
Falls back to SARVAM_DEMO_DRIVER_PHONE when a specific one is not set.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from bson import ObjectId
from dotenv import load_dotenv

_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_ROOT / ".env")


@dataclass(frozen=True)
class DemoCaseConfig:
    case_num: int
    label: str
    pickup_case: str
    description: str
    origin_node: str
    expected_node: str
    actual_node: str
    destination_node: str
    driver_name: str
    driver_language: str
    driver_phone_env: str
    tracking_number: str
    route_code: str


DEMO_CASES: dict[int, DemoCaseConfig] = {
    1: DemoCaseConfig(
        case_num=1,
        label="Case 1 - at_node",
        pickup_case="at_node",
        description=(
            "Package from Hyderabad ended up at Kamareddy instead of Medchal. "
            "A truck already AT Kamareddy is heading directly to Karimnagar -- "
            "piggyback with zero detour."
        ),
        origin_node="Hyderabad_Shamshbd_H (Telangana)",
        expected_node="Medchal_MROoffce_D (Telangana)",
        actual_node="Kamareddy_Devenply_I (Telangana)",
        destination_node="Karimnagar_KamnHbRD_I (Telangana)",
        driver_name="Ramesh",
        driver_language="Telugu",
        driver_phone_env="DEMO_DRIVER_1_PHONE",
        tracking_number="SHP-DEMO-CASE1",
        route_code="ROUTE-DEMO-CASE1",
    ),
    2: DemoCaseConfig(
        case_num=2,
        label="Case 2 - detour",
        pickup_case="detour",
        description=(
            "Package from Hyderabad ended up at Nalgonda. "
            "The nearest available truck must DETOUR from its current corridor "
            "to collect the shipment, then continue to Khammam."
        ),
        origin_node="Hyderabad_Shamshbd_H (Telangana)",
        expected_node="Miryalguda_Ragvendr_D (Telangana)",
        actual_node="Nalgonda_HydRoad_DC (Telangana)",
        destination_node="Khammam_NSTRoad_I (Telangana)",
        driver_name="Priya",
        driver_language="Hindi",
        driver_phone_env="DEMO_DRIVER_2_PHONE",
        tracking_number="SHP-DEMO-CASE2",
        route_code="ROUTE-DEMO-CASE2",
    ),
    3: DemoCaseConfig(
        case_num=3,
        label="Case 3 - pass_through",
        pickup_case="pass_through",
        description=(
            "Package from Hyderabad ended up at Miryalguda. A truck heading "
            "Choutuppal to Khammam NATURALLY PASSES through Miryalguda -- "
            "picks up the package with zero detour."
        ),
        origin_node="Hyderabad_Shamshbd_H (Telangana)",
        expected_node="Kodad_VidyaNgr_D (Telangana)",
        actual_node="Miryalguda_Ragvendr_D (Telangana)",
        destination_node="Khammam_NSTRoad_I (Telangana)",
        driver_name="Arjun",
        driver_language="English",
        driver_phone_env="DEMO_DRIVER_3_PHONE",
        tracking_number="SHP-DEMO-CASE3",
        route_code="ROUTE-DEMO-CASE3",
    ),
}

_FALLBACK_PHONE = os.getenv("SARVAM_DEMO_DRIVER_PHONE", "+917780645727").strip()


def _get_driver_phone(case: DemoCaseConfig) -> str:
    phone = os.getenv(case.driver_phone_env, "").strip()
    return phone if phone else _FALLBACK_PHONE


def _loc(db: Any, graph_node_key: str) -> dict:
    doc = db["locations"].find_one({"graphNodeKey": graph_node_key})
    if doc is None:
        raise RuntimeError(
            f"Location with graphNodeKey={graph_node_key!r} not found. "
            "Run npm run seed first."
        )
    return doc


def seed_demo_case(db: Any, case_num: int, *, reset: bool = True) -> dict[str, Any]:
    """Plant (or re-plant) a demo shipment scenario in MongoDB."""
    if case_num not in DEMO_CASES:
        raise ValueError(f"Invalid demo case number: {case_num}. Choose 1, 2, or 3.")

    cfg = DEMO_CASES[case_num]
    now = datetime.now(tz=timezone.utc)

    origin = _loc(db, cfg.origin_node)
    expected = _loc(db, cfg.expected_node)
    dest = _loc(db, cfg.destination_node)
    actual = _loc(db, cfg.actual_node)

    existing = db["shipments"].find_one({"trackingNumber": cfg.tracking_number})
    if existing:
        if not reset:
            return _result(cfg, str(existing["_id"]), _get_driver_phone(cfg))
        ship_oid = existing["_id"]
        db["shipmentevents"].delete_many({"shipment": ship_oid})
        db["incidents"].delete_many({"shipment": ship_oid})
        db["recoverycases"].delete_many({"shipment": ship_oid})
        db["shipments"].delete_one({"_id": ship_oid})
        if existing.get("assignedRoute"):
            db["routes"].delete_one({"_id": existing["assignedRoute"]})
        db["routes"].delete_one({"routeCode": cfg.route_code})
        print(f"Reset previous demo case {case_num} ({cfg.tracking_number})")

    db["routes"].delete_one({"routeCode": cfg.route_code})
    driver_phone = _get_driver_phone(cfg)

    vehicle = (
        db["vehicles"].find_one(
            {"currentLocation": actual["_id"], "status": {"$in": ["in_transit", "available", "loading"]}}
        )
        or db["vehicles"].find_one({"currentLocation": actual["_id"]})
        or db["vehicles"].find_one({"status": {"$in": ["in_transit", "available"]}})
    )
    if vehicle is None:
        raise RuntimeError("No vehicle found. Run npm run seed first.")

    route_oid = ObjectId()
    ship_oid = ObjectId()

    db["routes"].insert_one({
        "_id": route_oid,
        "routeCode": cfg.route_code,
        "origin": origin["_id"],
        "destination": dest["_id"],
        "stops": [{
            "location": expected["_id"],
            "sequence": 1,
            "estimatedArrival": now + timedelta(hours=2),
            "estimatedDeparture": now + timedelta(hours=2, minutes=30),
        }],
        "vehicle": vehicle["_id"],
        "distanceKm": 200.0,
        "estimatedDurationMinutes": 300,
        "scheduledDeparture": now - timedelta(hours=3),
        "scheduledArrival": now + timedelta(hours=5),
        "capacity": {"weight": 5000, "volume": 30},
        "currentLoad": {"weight": 1200, "volume": 8},
        "status": "in_progress",
        "demoCase": case_num,
        "pickupCase": cfg.pickup_case,
        "createdAt": now,
        "updatedAt": now,
    })

    db["vehicles"].update_one(
        {"_id": vehicle["_id"]},
        {"$set": {
            "currentLocation": actual["_id"],
            "status": "in_transit",
            "phone": driver_phone,
            "driverPhone": driver_phone,
            "driverName": cfg.driver_name,
            "driverLanguage": cfg.driver_language,
            "updatedAt": now,
        }},
    )

    db["shipments"].insert_one({
        "_id": ship_oid,
        "trackingNumber": cfg.tracking_number,
        "origin": origin["_id"],
        "destination": dest["_id"],
        "currentLocation": actual["_id"],
        "expectedLocation": expected["_id"],
        "weight": 250.0,
        "volume": 1.2,
        "packageCount": 2,
        "priority": "high",
        "deadline": now + timedelta(hours=20),
        "status": "in_transit",
        "assignedRoute": route_oid,
        "assignedVehicle": vehicle["_id"],
        "fragile": False,
        "demoCase": case_num,
        "pickupCase": cfg.pickup_case,
        "createdAt": now - timedelta(hours=4),
        "updatedAt": now,
    })

    t0 = now - timedelta(hours=4)
    t1 = now - timedelta(hours=3)
    db["shipmentevents"].insert_many([
        {"shipment": ship_oid, "type": "created", "location": origin["_id"],
         "route": route_oid, "vehicle": vehicle["_id"], "timestamp": t0,
         "description": f"[Case {case_num}] Created at {cfg.origin_node}",
         "createdAt": t0, "updatedAt": t0},
        {"shipment": ship_oid, "type": "departed_hub", "location": origin["_id"],
         "route": route_oid, "vehicle": vehicle["_id"], "timestamp": t1,
         "description": f"[Case {case_num}] Departed origin. Expected: {cfg.expected_node}. Type: {cfg.pickup_case}.",
         "createdAt": t1, "updatedAt": t1},
        {"shipment": ship_oid, "type": "arrived_hub", "location": actual["_id"],
         "route": route_oid, "vehicle": vehicle["_id"],
         "timestamp": now - timedelta(minutes=45),
         "description": (
             f"[Case {case_num}] WRONG hub {cfg.actual_node} (expected {cfg.expected_node}). "
             f"Driver: {cfg.driver_name} ({cfg.driver_language})"
         ),
         "createdAt": now, "updatedAt": now},
    ])

    print(f"\n[Demo Case {case_num}] '{cfg.label}' seeded:")
    print(f"  trackingNumber : {cfg.tracking_number}")
    print(f"  shipmentId     : {ship_oid}")
    print(f"  pickup_case    : {cfg.pickup_case}")
    print(f"  actualNode     : {cfg.actual_node}")
    print(f"  driver         : {cfg.driver_name} | {cfg.driver_language} | {driver_phone}")

    return _result(cfg, str(ship_oid), driver_phone)


def _result(cfg: DemoCaseConfig, shipment_id: str, driver_phone: str) -> dict[str, Any]:
    return {
        "case_num": cfg.case_num,
        "label": cfg.label,
        "pickup_case": cfg.pickup_case,
        "tracking_number": cfg.tracking_number,
        "shipment_id": shipment_id,
        "description": cfg.description,
        "driver": {"name": cfg.driver_name, "language": cfg.driver_language, "phone": driver_phone},
        "topology": {
            "origin": cfg.origin_node,
            "expectedStop": cfg.expected_node,
            "actual": cfg.actual_node,
            "destination": cfg.destination_node,
        },
    }
