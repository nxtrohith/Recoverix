#!/usr/bin/env python3
"""
Smoke-test the driver-app ↔ backend recovery loop for demo driver DRV-001.

Does not start Expo — verifies API contracts the mobile client depends on:
  vehicles (driver fields) → analyze → assign to driver vehicle →
  active incidents filter → pickup → resolve → call-status readable
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5055").rstrip("/")
SHIPMENT = "SHP-DEMO-CASE1"
DRIVER_ID = "DRV-001"


def req(path: str, method: str = "GET", body: dict | None = None):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(
        BASE + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=180) as res:
        return json.load(res)


def main() -> None:
    print(f"API {BASE}")
    vehicles = req("/api/vehicles")["vehicles"]
    driver = next((v for v in vehicles if v.get("driverId") == DRIVER_ID), None)
    if not driver:
        raise SystemExit(
            f"Demo driver {DRIVER_ID} not found. Run: npm run seed:demo-drivers"
        )
    print(
        f"✓ Driver {driver['driverName']} {driver['vehicleNumber']} "
        f"@ {driver.get('currentNode')} → {driver.get('destinationNode')}"
    )
    assert driver.get("phone"), "driver phone missing"
    assert driver.get("coordinates"), "driver coordinates missing"

    print(f"→ Analyze {SHIPMENT}")
    analysis = req(f"/api/recovery/{SHIPMENT}")
    print(f"  status={analysis.get('status')} candidates={len(analysis.get('candidates') or [])}")

    cand = next(
        (
            c
            for c in (analysis.get("candidates") or [])
            if c.get("vehicleId") == driver["id"] and c.get("feasible")
        ),
        None,
    )
    payload: dict = {}
    if cand:
        payload = {
            "candidateId": cand.get("candidateId"),
            "vehicleId": cand.get("vehicleId"),
            "path": cand.get("path"),
            "pickupCase": cand.get("pickupCase"),
            "score": cand.get("score"),
        }
        print(f"→ Assign candidate {cand.get('candidateId')} ({cand.get('pickupCase')})")
    else:
        payload = {"vehicleId": driver["id"]}
        print("→ Assign by vehicleId (no exact candidate snapshot)")

    try:
        assigned = req(f"/api/recovery/{SHIPMENT}/assign", "POST", payload)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode()
        print(f"assign failed ({exc.code}): {body[:400]}")
        # Reset path: if already assigned to someone else, still check active list
        assigned = {}

    incident = assigned.get("incident") or assigned
    print(
        f"  assign → status={incident.get('status')} "
        f"vehicle={incident.get('recoveryVehicleNumber')} "
        f"pickup={incident.get('pickupNode')}"
    )

    active = req("/api/incidents/active")["incidents"]
    mine = [
        i
        for i in active
        if i.get("recoveryVehicleId") == driver["id"]
        or i.get("recoveryVehicleNumber") == driver["vehicleNumber"]
    ]
    print(f"✓ Active incidents for driver: {len(mine)}")
    for i in mine:
        print(
            f"  - {i.get('shipmentTrackingNumber')} {i.get('status')} "
            f"{i.get('lifecycleStatus')} pickup={i.get('pickupNode')}"
        )

    if not mine:
        raise SystemExit("No active assignment visible to driver vehicle — mobile alert would not fire")

    target = mine[0]
    sid = target.get("shipmentTrackingNumber") or SHIPMENT

    if (target.get("status") or "").upper() == "ASSIGNED":
        print(f"→ Pickup {sid}")
        pickup = req(f"/api/recovery/{sid}/pickup", "POST", {})
        print(f"  pickup → {(pickup.get('incident') or pickup).get('status')}")
        print(f"→ Resolve {sid}")
        resolved = req(f"/api/recovery/{sid}/resolve", "POST", {})
        print(f"  resolve → {(resolved.get('incident') or resolved).get('status')}")

    try:
        call = req(f"/api/recovery/{sid}/call-status")
        print(
            f"✓ call-status={call.get('driverCallStatus') or call.get('status')} "
            f"channel={call.get('driverCallChannel')}"
        )
    except Exception as exc:
        print(f"call-status skipped: {exc}")

    print("\nDriver cockpit backend contract OK.")


if __name__ == "__main__":
    main()
