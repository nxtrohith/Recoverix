#!/usr/bin/env python3
"""
Stamp exactly 3 demo driver profiles onto real fleet vehicles.

These drivers power the mobile-driver-app selection screen. Location,
destination, and recovery assignments always come from the live backend —
only identity fields (driverId / name / phone) are seeded here.

Demo mapping (chosen for the Kamareddy → Karimnagar recovery story):
  DRV-001 Ramesh Kumar  → TS-09-UB-1077  (Kamareddy → Karimnagar)
  DRV-002 Suresh Reddy  → TS-09-UB-1047  (Hyderabad → Karimnagar)
  DRV-003 Priya Sharma  → TS-09-UB-1001  (Asifabad → Karimnagar)

Usage
-----
  uv run python scripts/seed_demo_drivers.py
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))
load_dotenv(_ROOT / ".env")

from graph.graph_builder import connect_mongo

DEMO_DRIVERS = [
    {
        "driverId": "DRV-001",
        "driverName": "Ramesh Kumar",
        "vehicleNumber": "TS-09-UB-1077",
        "phoneEnvFallback": True,
    },
    {
        "driverId": "DRV-002",
        "driverName": "Suresh Reddy",
        "vehicleNumber": "TS-09-UB-1047",
        "phone": "+919876543210",
    },
    {
        "driverId": "DRV-003",
        "driverName": "Priya Sharma",
        "vehicleNumber": "TS-09-UB-1001",
        "phone": "+919123456789",
    },
]


def main() -> None:
    demo_phone = (os.getenv("SARVAM_DEMO_DRIVER_PHONE") or "+917780645727").strip()
    db = connect_mongo()
    now = datetime.now(tz=timezone.utc)

    print("Seeding 3 demo driver profiles onto vehicles…")
    for profile in DEMO_DRIVERS:
        vehicle_number = profile["vehicleNumber"]
        phone = demo_phone if profile.get("phoneEnvFallback") else profile["phone"]
        result = db["vehicles"].update_one(
            {"vehicleNumber": vehicle_number},
            {
                "$set": {
                    "driverId": profile["driverId"],
                    "driverName": profile["driverName"],
                    "phone": phone,
                    "driverPhone": phone,
                    "updatedAt": now,
                }
            },
        )
        if result.matched_count == 0:
            print(f"  ✗ Vehicle not found: {vehicle_number}")
            continue
        loc = None
        vdoc = db["vehicles"].find_one({"vehicleNumber": vehicle_number})
        if vdoc and vdoc.get("currentLocation"):
            loc_doc = db["locations"].find_one({"_id": vdoc["currentLocation"]})
            loc = (loc_doc or {}).get("graphNodeKey") or (loc_doc or {}).get("name")
        print(
            f"  ✓ {profile['driverId']} {profile['driverName']} → "
            f"{vehicle_number} @ {loc or '?'}  phone={phone}"
        )

    print("Done. Mobile app will resolve these via GET /api/vehicles.")


if __name__ == "__main__":
    main()
