"""
Incident + recovery assignment service.

Persists incident / shipment state in MongoDB and reuses the existing
RecoveryOrchestrator for option ranking (no duplicated scoring).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from bson import ObjectId
from pymongo.database import Database

from graph.recovery_orchestrator import (
    RecoveryError,
    ShipmentNotFoundError,
    analyze_shipment_recovery,
)
from graph.services.driver_communication import (
    build_recovery_assignment_message,
    send_driver_notification,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _to_oid(value: Any) -> ObjectId | None:
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return value
    try:
        return ObjectId(value)
    except Exception:
        return None


def _find_shipment(db: Database, shipment_id: str) -> dict[str, Any] | None:
    try:
        query: dict[str, Any] = {"_id": ObjectId(shipment_id)}
    except Exception:
        query = {"trackingNumber": shipment_id}
    return db["shipments"].find_one(query)


def _loc_name(db: Database, location_id: Any) -> str | None:
    oid = _to_oid(location_id)
    if oid is None:
        return None
    doc = db["locations"].find_one({"_id": oid}, {"name": 1})
    return doc.get("name") if doc else None


def _vehicle_number(db: Database, vehicle_id: Any) -> str | None:
    oid = _to_oid(vehicle_id)
    if oid is None:
        return None
    doc = db["vehicles"].find_one({"_id": oid}, {"vehicleNumber": 1})
    return doc.get("vehicleNumber") if doc else None


def _lifecycle_status(
    shipment_status: str,
    incident: dict[str, Any] | None,
) -> str:
    """
    Demo lifecycle derived from MongoDB shipment + incident (source of truth).

    NORMAL → MISPLACED → RECOVERY_ANALYSIS → RECOVERY_ASSIGNED → RECOVERED
    """
    if shipment_status == "recovered":
        return "RECOVERED"

    # Ignore historical resolved incidents once the shipment is no longer recovered
    if incident is None or incident.get("status") == "RESOLVED":
        if shipment_status == "misplaced":
            return "MISPLACED"
        return "NORMAL"

    if incident.get("status") == "ASSIGNED":
        return "RECOVERY_ASSIGNED"

    if incident.get("status") in ("OPEN", "RECOVERY_REQUIRED"):
        if incident.get("analysisStatus") == "RECOVERY_PLAN_AVAILABLE":
            return "RECOVERY_ANALYSIS"
        return "MISPLACED"

    if shipment_status == "misplaced":
        return "MISPLACED"
    return "NORMAL"


def serialize_incident(db: Database, doc: dict[str, Any]) -> dict[str, Any]:
    """JSON-safe incident payload."""
    vehicle_id = doc.get("vehicle")
    recovery_vehicle_id = doc.get("recoveryVehicle")
    hub_id = doc.get("hub")
    return {
        "incidentId": doc.get("incidentId"),
        "id": str(doc["_id"]),
        "shipmentId": str(doc["shipment"]),
        "vehicleId": str(vehicle_id) if vehicle_id else None,
        "vehicleNumber": _vehicle_number(db, vehicle_id),
        "recoveryVehicleId": str(recovery_vehicle_id) if recovery_vehicle_id else None,
        "recoveryVehicleNumber": _vehicle_number(db, recovery_vehicle_id),
        "incidentType": doc.get("incidentType"),
        "hubId": str(hub_id) if hub_id else None,
        "hubName": _loc_name(db, hub_id),
        "status": doc.get("status"),
        "selectedCandidateId": doc.get("selectedCandidateId"),
        "recoveryPath": list(doc.get("recoveryPath") or []),
        "pickupCase": doc.get("pickupCase"),
        "driverMessage": doc.get("driverMessage"),
        "analysisStatus": doc.get("analysisStatus"),
        "lifecycleStatus": None,  # filled by callers with shipment context
        "createdAt": _iso(doc.get("createdAt") or doc.get("detectedAt")),
        "resolvedAt": _iso(doc.get("resolvedAt")),
        "updatedAt": _iso(doc.get("updatedAt")),
    }


def get_active_incident_for_shipment(
    db: Database, shipment_oid: ObjectId
) -> dict[str, Any] | None:
    return db["incidents"].find_one(
        {
            "shipment": shipment_oid,
            "status": {"$in": ["OPEN", "RECOVERY_REQUIRED", "ASSIGNED"]},
        },
        sort=[("createdAt", -1)],
    )


def get_latest_incident_for_shipment(
    db: Database, shipment_oid: ObjectId
) -> dict[str, Any] | None:
    return db["incidents"].find_one(
        {"shipment": shipment_oid},
        sort=[("createdAt", -1)],
    )


# ---------------------------------------------------------------------------
# Simulate
# ---------------------------------------------------------------------------


def simulate_misplaced_incident(
    db: Database,
    shipment_id: str,
    *,
    auto_analyze: bool = False,
) -> dict[str, Any]:
    """
    Mark an existing shipment as misplaced, record an incident, and
    optionally trigger the recovery engine.
    """
    shipment = _find_shipment(db, shipment_id)
    if shipment is None:
        raise ShipmentNotFoundError(shipment_id)

    ship_oid = shipment["_id"]
    hub_id = shipment.get("currentLocation")
    if hub_id is None:
        raise RecoveryError(
            "INVALID_SHIPMENT_LOCATION",
            "Shipment has no currentLocation hub",
            http_status=400,
        )

    vehicle_id = shipment.get("assignedVehicle")
    # Fall back to a vehicle currently at the same hub (demo-friendly)
    if vehicle_id is None:
        nearby = db["vehicles"].find_one(
            {"currentLocation": hub_id, "status": {"$in": ["in_transit", "available", "loading"]}},
        ) or db["vehicles"].find_one({"currentLocation": hub_id})
        if nearby:
            vehicle_id = nearby["_id"]

    now = _now()
    incident_id = f"INC-{uuid4().hex[:8].upper()}"

    # Close any prior open incidents for this shipment
    db["incidents"].update_many(
        {
            "shipment": ship_oid,
            "status": {"$in": ["OPEN", "RECOVERY_REQUIRED", "ASSIGNED"]},
        },
        {"$set": {"status": "RESOLVED", "resolvedAt": now, "updatedAt": now}},
    )

    recovery_case_oid = ObjectId()
    db["recoverycases"].insert_one(
        {
            "_id": recovery_case_oid,
            "shipment": ship_oid,
            "detectedAt": now,
            "detectedLocation": hub_id,
            "reason": "wrong_hub",
            "severity": "high",
            "status": "open",
            "createdAt": now,
            "updatedAt": now,
        }
    )

    incident_doc = {
        "incidentId": incident_id,
        "shipment": ship_oid,
        "vehicle": vehicle_id,
        "incidentType": "MISPLACED_SHIPMENT",
        "hub": hub_id,
        "status": "RECOVERY_REQUIRED",
        "selectedCandidateId": None,
        "recoveryVehicle": None,
        "recoveryPath": [],
        "pickupCase": None,
        "recoveryCase": recovery_case_oid,
        "driverMessage": None,
        "analysisStatus": None,
        "resolvedAt": None,
        "createdAt": now,
        "updatedAt": now,
    }
    insert_result = db["incidents"].insert_one(incident_doc)
    incident_doc["_id"] = insert_result.inserted_id

    # Update shipment state (source of truth)
    db["shipments"].update_one(
        {"_id": ship_oid},
        {
            "$set": {
                "status": "misplaced",
                "updatedAt": now,
                **({"assignedVehicle": vehicle_id} if vehicle_id else {}),
            }
        },
    )

    db["shipmentevents"].insert_one(
        {
            "shipment": ship_oid,
            "type": "misplaced",
            "location": hub_id,
            "vehicle": vehicle_id,
            "timestamp": now,
            "description": (
                f"Simulated MISPLACED_SHIPMENT incident {incident_id}"
            ),
            "createdAt": now,
            "updatedAt": now,
        }
    )

    recovery: dict[str, Any] | None = None
    if auto_analyze:
        recovery = analyze_shipment_recovery(str(ship_oid))
        analysis_status = recovery.get("status")
        db["incidents"].update_one(
            {"_id": incident_doc["_id"]},
            {
                "$set": {
                    "analysisStatus": analysis_status,
                    "updatedAt": _now(),
                }
            },
        )
        incident_doc["analysisStatus"] = analysis_status
        if analysis_status == "RECOVERY_PLAN_AVAILABLE":
            db["recoverycases"].update_one(
                {"_id": recovery_case_oid},
                {"$set": {"status": "options_generated", "updatedAt": _now()}},
            )

    # Re-read shipment for response
    updated_shipment = db["shipments"].find_one({"_id": ship_oid}) or shipment
    incident_payload = serialize_incident(db, incident_doc)
    incident_payload["lifecycleStatus"] = _lifecycle_status(
        updated_shipment.get("status", "misplaced"), incident_doc
    )

    return {
        "incident": incident_payload,
        "shipment": {
            "id": str(ship_oid),
            "trackingNumber": updated_shipment.get("trackingNumber"),
            "status": updated_shipment.get("status"),
            "lifecycleStatus": incident_payload["lifecycleStatus"],
            "currentLocation": _loc_name(db, updated_shipment.get("currentLocation")),
            "destination": _loc_name(db, updated_shipment.get("destination")),
            "origin": _loc_name(db, updated_shipment.get("origin")),
            "assignedVehicleId": (
                str(updated_shipment["assignedVehicle"])
                if updated_shipment.get("assignedVehicle")
                else None
            ),
            "assignedVehicleNumber": _vehicle_number(
                db, updated_shipment.get("assignedVehicle")
            ),
            "needsRecovery": True,
        },
        "recovery": recovery,
        "message": "Incident simulated — recovery required",
    }


# ---------------------------------------------------------------------------
# Assign
# ---------------------------------------------------------------------------


def assign_recovery(
    db: Database,
    shipment_id: str,
    *,
    candidate_id: str | None = None,
    vehicle_id: str | None = None,
    path: list[str] | None = None,
    pickup_case: str | None = None,
) -> dict[str, Any]:
    """
    Validate a recovery option, assign it, notify driver.

    When the client supplies a candidate from a prior calculate/analyze response
    (candidateId + vehicleId + path), assignment is applied directly without
    re-running the full scoring pipeline (hackathon latency). Otherwise the
    orchestrator is invoked to pick the default selected option.
    """
    shipment = _find_shipment(db, shipment_id)
    if shipment is None:
        raise ShipmentNotFoundError(shipment_id)

    ship_oid = shipment["_id"]
    incident = get_active_incident_for_shipment(db, ship_oid)
    if incident is None:
        raise RecoveryError(
            "NO_ACTIVE_INCIDENT",
            f"No active incident for shipment {shipment_id}",
            http_status=400,
        )

    analysis: dict[str, Any] | None = None
    selected: dict[str, Any] | None = None

    if candidate_id and vehicle_id and path:
        # Client-provided option from prior recovery calculation
        recovery_vehicle_oid = _to_oid(vehicle_id)
        if recovery_vehicle_oid is None:
            raise RecoveryError(
                "INVALID_RECOVERY_VEHICLE",
                "Recovery option has no valid vehicleId",
                http_status=400,
            )
        vdoc = db["vehicles"].find_one({"_id": recovery_vehicle_oid}, {"_id": 1})
        if vdoc is None:
            raise RecoveryError(
                "INVALID_RECOVERY_VEHICLE",
                f"Vehicle not found: {vehicle_id}",
                http_status=400,
            )
        selected = {
            "candidateId": candidate_id,
            "vehicleId": str(recovery_vehicle_oid),
            "path": list(path),
            "pickupCase": pickup_case,
            "feasible": True,
        }
    else:
        # Re-run engine to choose / validate default selection
        analysis = analyze_shipment_recovery(str(ship_oid))
        candidates = analysis.get("candidates") or []
        if candidate_id:
            selected = next(
                (
                    c
                    for c in candidates
                    if c.get("candidateId") == candidate_id and c.get("feasible")
                ),
                None,
            )
        elif vehicle_id:
            selected = next(
                (
                    c
                    for c in candidates
                    if c.get("vehicleId") == vehicle_id and c.get("feasible")
                ),
                None,
            )
        else:
            selected = analysis.get("selectedRecovery")
            if selected:
                full = next(
                    (
                        c
                        for c in candidates
                        if c.get("candidateId") == selected.get("candidateId")
                    ),
                    None,
                )
                if full:
                    selected = {**full, **selected}

    if not selected:
        raise RecoveryError(
            "INVALID_RECOVERY_OPTION",
            "Selected recovery option is not valid or not feasible",
            http_status=400,
        )
    if selected.get("feasible") is False:
        raise RecoveryError(
            "INVALID_RECOVERY_OPTION",
            "Selected recovery option is not feasible",
            http_status=400,
        )

    recovery_vehicle_id = selected.get("vehicleId") or vehicle_id
    recovery_path = list(selected.get("path") or path or [])
    pickup = selected.get("pickupCase") or pickup_case
    candidate = selected.get("candidateId") or candidate_id

    recovery_vehicle_oid = _to_oid(recovery_vehicle_id)
    if recovery_vehicle_oid is None:
        raise RecoveryError(
            "INVALID_RECOVERY_VEHICLE",
            "Recovery option has no valid vehicleId",
            http_status=400,
        )

    now = _now()
    pickup_hub = (
        recovery_path[0]
        if recovery_path
        else _loc_name(db, shipment.get("currentLocation"))
    )
    destination = (
        recovery_path[-1]
        if recovery_path
        else _loc_name(db, shipment.get("destination"))
    )

    message = build_recovery_assignment_message(
        shipment_tracking=shipment.get("trackingNumber", ""),
        shipment_id=str(ship_oid),
        pickup_hub=pickup_hub,
        destination=destination,
        recovery_route=recovery_path,
    )
    notify = send_driver_notification(
        str(recovery_vehicle_oid),
        message,
        metadata={
            "shipmentId": str(ship_oid),
            "incidentId": incident.get("incidentId"),
            "candidateId": candidate,
        },
    )

    db["incidents"].update_one(
        {"_id": incident["_id"]},
        {
            "$set": {
                "status": "ASSIGNED",
                "selectedCandidateId": candidate,
                "recoveryVehicle": recovery_vehicle_oid,
                "recoveryPath": recovery_path,
                "pickupCase": pickup,
                "driverMessage": notify.message,
                "analysisStatus": (analysis or {}).get("status")
                or incident.get("analysisStatus")
                or "RECOVERY_PLAN_AVAILABLE",
                "updatedAt": now,
            }
        },
    )

    db["shipments"].update_one(
        {"_id": ship_oid},
        {
            "$set": {
                "assignedVehicle": recovery_vehicle_oid,
                "status": "misplaced",
                "updatedAt": now,
            }
        },
    )

    if incident.get("recoveryCase"):
        db["recoverycases"].update_one(
            {"_id": incident["recoveryCase"]},
            {"$set": {"status": "option_selected", "updatedAt": now}},
        )

    db["shipmentevents"].insert_one(
        {
            "shipment": ship_oid,
            "type": "recovery_started",
            "location": shipment.get("currentLocation"),
            "vehicle": recovery_vehicle_oid,
            "timestamp": now,
            "description": (
                f"Recovery assigned via candidate {candidate} "
                f"vehicle {_vehicle_number(db, recovery_vehicle_oid)}"
            ),
            "createdAt": now,
            "updatedAt": now,
        }
    )

    updated_incident = db["incidents"].find_one({"_id": incident["_id"]})
    updated_shipment = db["shipments"].find_one({"_id": ship_oid})
    assert updated_incident is not None and updated_shipment is not None

    incident_payload = serialize_incident(db, updated_incident)
    lifecycle = _lifecycle_status(updated_shipment.get("status", ""), updated_incident)
    incident_payload["lifecycleStatus"] = lifecycle

    return {
        "incident": incident_payload,
        "shipment": {
            "id": str(ship_oid),
            "trackingNumber": updated_shipment.get("trackingNumber"),
            "status": updated_shipment.get("status"),
            "lifecycleStatus": lifecycle,
            "currentLocation": _loc_name(db, updated_shipment.get("currentLocation")),
            "destination": _loc_name(db, updated_shipment.get("destination")),
            "assignedVehicleId": str(recovery_vehicle_oid),
            "assignedVehicleNumber": _vehicle_number(db, recovery_vehicle_oid),
            "needsRecovery": True,
        },
        "assignment": {
            "candidateId": candidate,
            "vehicleId": str(recovery_vehicle_oid),
            "vehicleNumber": _vehicle_number(db, recovery_vehicle_oid),
            "path": recovery_path,
            "pickupCase": pickup,
        },
        "driverNotification": {
            "vehicleId": notify.vehicle_id,
            "message": notify.message,
            "channel": notify.channel,
            "delivered": notify.delivered,
            "sentAt": notify.sent_at,
            "detail": notify.detail,
        },
        "recovery": analysis,
        "message": "Recovery assigned",
    }


# ---------------------------------------------------------------------------
# Resolve
# ---------------------------------------------------------------------------


def resolve_recovery(db: Database, shipment_id: str) -> dict[str, Any]:
    """Mark shipment recovered and incident resolved."""
    shipment = _find_shipment(db, shipment_id)
    if shipment is None:
        raise ShipmentNotFoundError(shipment_id)

    ship_oid = shipment["_id"]
    incident = get_active_incident_for_shipment(db, ship_oid)
    if incident is None:
        # Allow resolving a recently assigned incident that might already be half-done
        incident = get_latest_incident_for_shipment(db, ship_oid)
        if incident is None or incident.get("status") == "RESOLVED":
            raise RecoveryError(
                "NO_ACTIVE_INCIDENT",
                f"No resolvable incident for shipment {shipment_id}",
                http_status=400,
            )

    now = _now()
    db["incidents"].update_one(
        {"_id": incident["_id"]},
        {"$set": {"status": "RESOLVED", "resolvedAt": now, "updatedAt": now}},
    )
    db["shipments"].update_one(
        {"_id": ship_oid},
        {"$set": {"status": "recovered", "updatedAt": now}},
    )
    if incident.get("recoveryCase"):
        db["recoverycases"].update_one(
            {"_id": incident["recoveryCase"]},
            {
                "$set": {
                    "status": "resolved",
                    "resolvedAt": now,
                    "updatedAt": now,
                }
            },
        )

    db["shipmentevents"].insert_one(
        {
            "shipment": ship_oid,
            "type": "recovered",
            "location": shipment.get("destination") or shipment.get("currentLocation"),
            "vehicle": incident.get("recoveryVehicle") or shipment.get("assignedVehicle"),
            "timestamp": now,
            "description": f"Recovery completed for incident {incident.get('incidentId')}",
            "createdAt": now,
            "updatedAt": now,
        }
    )

    updated_incident = db["incidents"].find_one({"_id": incident["_id"]})
    updated_shipment = db["shipments"].find_one({"_id": ship_oid})
    assert updated_incident is not None and updated_shipment is not None

    incident_payload = serialize_incident(db, updated_incident)
    lifecycle = _lifecycle_status(updated_shipment.get("status", ""), updated_incident)
    incident_payload["lifecycleStatus"] = lifecycle

    path = list(updated_incident.get("recoveryPath") or [])
    return {
        "incident": incident_payload,
        "shipment": {
            "id": str(ship_oid),
            "trackingNumber": updated_shipment.get("trackingNumber"),
            "status": updated_shipment.get("status"),
            "lifecycleStatus": lifecycle,
            "currentLocation": _loc_name(db, updated_shipment.get("currentLocation")),
            "destination": _loc_name(db, updated_shipment.get("destination")),
            "assignedVehicleId": (
                str(updated_shipment["assignedVehicle"])
                if updated_shipment.get("assignedVehicle")
                else None
            ),
            "assignedVehicleNumber": _vehicle_number(
                db, updated_shipment.get("assignedVehicle")
            ),
            "needsRecovery": False,
        },
        "completion": {
            "recoveryVehicleId": (
                str(updated_incident["recoveryVehicle"])
                if updated_incident.get("recoveryVehicle")
                else None
            ),
            "recoveryVehicleNumber": _vehicle_number(
                db, updated_incident.get("recoveryVehicle")
            ),
            "recoveryRoute": path,
            "recoveryRouteLabel": " → ".join(path) if path else None,
            "status": "RECOVERED",
        },
        "message": "Recovery completed",
    }


def list_active_incidents(db: Database) -> dict[str, Any]:
    docs = list(
        db["incidents"].find(
            {"status": {"$in": ["OPEN", "RECOVERY_REQUIRED", "ASSIGNED"]}},
            sort=[("createdAt", -1)],
        )
    )
    items = []
    for doc in docs:
        payload = serialize_incident(db, doc)
        ship = db["shipments"].find_one({"_id": doc["shipment"]})
        status = ship.get("status", "") if ship else ""
        payload["lifecycleStatus"] = _lifecycle_status(status, doc)
        payload["shipmentTrackingNumber"] = (
            ship.get("trackingNumber") if ship else None
        )
        payload["destinationName"] = (
            _loc_name(db, ship.get("destination")) if ship else None
        )
        items.append(payload)
    return {"count": len(items), "incidents": items}
