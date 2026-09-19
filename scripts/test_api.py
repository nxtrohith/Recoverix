#!/usr/bin/env python3
"""
Recoverix API smoke-test script.

Tests all public endpoints against a running FastAPI server.
Does NOT create mock data — gracefully handles empty collections.

Usage:
    # With server already running:
    uv run python scripts/test_api.py

    # Against a different host/port:
    uv run python scripts/test_api.py --base-url http://127.0.0.1:5055
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from typing import Any


BASE_URL = "http://127.0.0.1:5055"

PASS = "\033[92m✓\033[0m"
FAIL = "\033[91m✗\033[0m"
WARN = "\033[93m⚠\033[0m"
INFO = "\033[94m→\033[0m"


def _get(path: str, base_url: str = BASE_URL) -> tuple[int, Any]:
    url = base_url.rstrip("/") + path
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            body = json.loads(resp.read())
            return resp.status, body
    except urllib.error.HTTPError as exc:
        try:
            body = json.loads(exc.read())
        except Exception:
            body = {"raw": exc.reason}
        return exc.code, body
    except urllib.error.URLError as exc:
        return 0, {"connection_error": str(exc.reason)}


# ---------------------------------------------------------------------------
# Individual test cases
# ---------------------------------------------------------------------------


def test_health(base_url: str) -> bool:
    status, body = _get("/api/health", base_url)
    ok = status == 200 and body.get("status") in ("ok", "degraded")
    icon = PASS if ok else FAIL
    print(f"  {icon} GET /api/health  →  {status}  status={body.get('status')!r}  "
          f"database={body.get('database')!r}  "
          f"graph.loaded={body.get('graph', {}).get('loaded')}")
    if not ok and status == 0:
        print(f"     {WARN} Cannot reach server — is it running? ({body})")
    return ok


def test_graph(base_url: str) -> bool:
    status, body = _get("/api/graph", base_url)
    ok = status == 200
    nodes = body.get("nodes") or []
    edges = body.get("edges") or []
    icon = PASS if ok else FAIL
    print(f"  {icon} GET /api/graph  →  {status}  nodes={len(nodes)}  edges={len(edges)}")
    if ok and nodes:
        sample = nodes[0]
        print(f"     {INFO} Sample node: id={sample.get('id')!r}  "
              f"lat={sample.get('latitude')}  lon={sample.get('longitude')}")
    return ok


def test_hubs(base_url: str) -> bool:
    status, body = _get("/api/hubs", base_url)
    ok = status == 200
    count = body.get("count", 0)
    hubs = body.get("hubs") or []
    icon = PASS if ok else FAIL
    print(f"  {icon} GET /api/hubs  →  {status}  count={count}")
    if ok and hubs:
        sample = hubs[0]
        print(f"     {INFO} Sample hub: name={sample.get('name')!r}  "
              f"type={sample.get('type')!r}  graphNodeKey={sample.get('graphNodeKey')!r}")
    elif ok and count == 0:
        print(f"     {WARN} No hubs found — locations collection may be empty")
    return ok


def test_vehicles(base_url: str) -> str | None:
    """Returns the first vehicle_id found, or None."""
    status, body = _get("/api/vehicles", base_url)
    ok = status == 200
    count = body.get("count", 0)
    vehicles = body.get("vehicles") or []
    icon = PASS if ok else FAIL
    print(f"  {icon} GET /api/vehicles  →  {status}  count={count}")
    if ok and vehicles:
        sample = vehicles[0]
        vid = sample.get("id")
        print(f"     {INFO} Sample vehicle: id={vid!r}  "
              f"number={sample.get('vehicleNumber')!r}  "
              f"status={sample.get('status')!r}  "
              f"node={sample.get('currentNode')!r}")
        return vid
    elif ok and count == 0:
        print(f"     {WARN} No vehicles found — vehicles collection may be empty")
    return None


def test_vehicle_detail(base_url: str, vehicle_id: str) -> bool:
    status, body = _get(f"/api/vehicles/{vehicle_id}", base_url)
    ok = status == 200
    icon = PASS if ok else FAIL
    print(f"  {icon} GET /api/vehicles/{vehicle_id}  →  {status}")
    if ok:
        path = body.get("currentPath")
        print(f"     {INFO} currentNode={body.get('currentNode')!r}  "
              f"destinationNode={body.get('destinationNode')!r}  "
              f"path={'yes (' + str(len(path)) + ' hops)' if path else 'none'}")
    return ok


def test_vehicle_not_found(base_url: str) -> bool:
    fake_id = "000000000000000000000000"
    status, body = _get(f"/api/vehicles/{fake_id}", base_url)
    ok = status == 404
    icon = PASS if ok else FAIL
    print(f"  {icon} GET /api/vehicles/{fake_id}  →  {status}  (expect 404)")
    return ok


def test_shipments(base_url: str) -> str | None:
    """Returns the first shipment_id found, or None."""
    status, body = _get("/api/shipments", base_url)
    ok = status == 200
    count = body.get("count", 0)
    shipments = body.get("shipments") or []
    icon = PASS if ok else FAIL
    print(f"  {icon} GET /api/shipments  →  {status}  count={count}")
    if ok and shipments:
        sample = shipments[0]
        sid = sample.get("id")
        print(f"     {INFO} Sample shipment: id={sid!r}  "
              f"tracking={sample.get('trackingNumber')!r}  "
              f"status={sample.get('status')!r}  "
              f"priority={sample.get('priority')!r}")
        return sid
    elif ok and count == 0:
        print(f"     {WARN} No shipments found — shipments collection may be empty")
    return None


def test_shipment_detail(base_url: str, shipment_id: str) -> bool:
    status, body = _get(f"/api/shipments/{shipment_id}", base_url)
    ok = status == 200
    icon = PASS if ok else FAIL
    print(f"  {icon} GET /api/shipments/{shipment_id}  →  {status}")
    if ok:
        print(f"     {INFO} needsRecovery={body.get('needsRecovery')}  "
              f"events={len(body.get('events', []))}  "
              f"currentNode={body.get('currentNode')!r}")
    return ok


def test_shipment_not_found(base_url: str) -> bool:
    fake_id = "000000000000000000000000"
    status, body = _get(f"/api/shipments/{fake_id}", base_url)
    ok = status == 404
    icon = PASS if ok else FAIL
    print(f"  {icon} GET /api/shipments/{fake_id}  →  {status}  (expect 404)")
    return ok


def test_recovery(base_url: str, shipment_id: str) -> bool:
    status, body = _get(f"/api/recovery/{shipment_id}", base_url)
    ok = status in (200, 400)  # 400 if shipment has no graph location
    icon = PASS if ok else FAIL
    print(f"  {icon} GET /api/recovery/{shipment_id}  →  {status}")
    if status == 200:
        rec_status = body.get("status", "?")
        net = body.get("network") or {}
        print(f"     {INFO} recovery_status={rec_status!r}  "
              f"candidates={net.get('candidateCount', 0)}  "
              f"feasible={net.get('feasibleCount', 0)}")
        sel = body.get("selectedRecovery")
        if sel:
            print(f"     {INFO} Selected: vehicle={sel.get('vehicleNumber')!r}  "
                  f"score={sel.get('score')}  "
                  f"path_hops={len(sel.get('path', []))}")
        else:
            reasons = body.get("reasons") or []
            print(f"     {INFO} No recovery selected. Reasons: {reasons}")
    elif status == 400:
        err = body.get("error") or {}
        print(f"     {WARN} Analysis error: {err.get('code')} — {err.get('message')}")
    return ok


def test_recovery_not_found(base_url: str) -> bool:
    fake_id = "000000000000000000000000"
    status, body = _get(f"/api/recovery/{fake_id}", base_url)
    ok = status == 404
    icon = PASS if ok else FAIL
    print(f"  {icon} GET /api/recovery/{fake_id}  →  {status}  (expect 404)")
    return ok


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------


def run_tests(base_url: str) -> int:
    print(f"\n{'='*62}")
    print(f"  Recoverix API smoke tests  →  {base_url}")
    print(f"{'='*62}\n")

    results: list[bool] = []

    print("── Health ──────────────────────────────────────────────────")
    results.append(test_health(base_url))

    print("\n── Graph topology ──────────────────────────────────────────")
    results.append(test_graph(base_url))

    print("\n── Hubs ────────────────────────────────────────────────────")
    results.append(test_hubs(base_url))

    print("\n── Vehicles ────────────────────────────────────────────────")
    vehicle_id = test_vehicles(base_url)
    if vehicle_id:
        results.append(test_vehicle_detail(base_url, vehicle_id))
    else:
        print(f"  {WARN} Skipping vehicle detail test (no vehicles in DB)")
    results.append(test_vehicle_not_found(base_url))

    print("\n── Shipments ───────────────────────────────────────────────")
    shipment_id = test_shipments(base_url)
    if shipment_id:
        results.append(test_shipment_detail(base_url, shipment_id))
    else:
        print(f"  {WARN} Skipping shipment detail test (no shipments in DB)")
    results.append(test_shipment_not_found(base_url))

    print("\n── Recovery ────────────────────────────────────────────────")
    if shipment_id:
        results.append(test_recovery(base_url, shipment_id))
    else:
        print(f"  {WARN} Skipping recovery test (no shipments in DB)")
    results.append(test_recovery_not_found(base_url))

    # Summary
    passed = sum(1 for r in results if r)
    failed = len(results) - passed
    print(f"\n{'='*62}")
    print(f"  Results: {passed} passed, {failed} failed  ({len(results)} total)")
    print(f"{'='*62}\n")

    return 0 if failed == 0 else 1


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Recoverix API smoke tests")
    parser.add_argument(
        "--base-url",
        default=BASE_URL,
        help=f"FastAPI server base URL (default: {BASE_URL})",
    )
    args = parser.parse_args(argv)
    sys.exit(run_tests(args.base_url))


if __name__ == "__main__":
    main()
