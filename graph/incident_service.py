"""
Incident + recovery assignment service.

Persists incident / shipment state in MongoDB and reuses the existing
RecoveryOrchestrator for option ranking (no duplicated scoring).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from bson import ObjectId
from pymongo.database import Database

logger = logging.getLogger(__name__)

from graph.analysis_cache import invalidate_analysis_cache
from graph.recovery_orchestrator import (
    RecoveryError,
    ShipmentNotFoundError,
    analyze_shipment_recovery,
)
from graph.recovery_persistence import (
    get_selected_recovery_option,
    mark_option_status,
    selected_option_as_assignment,
    serialize_recovery_plan,
)
from graph.services.driver_communication import (
    build_late_detection_message,
    build_recovery_assignment_message,
    resolve_driver_phone,
    send_driver_notification,
)
from graph.services.recovery_xai import build_simulate_step
from graph.services.sarvam_outbound import (
    call_driver,
    get_outbound_call_status,
    mask_phone,
)
from graph.shipment_state import apply_shipment_event, sync_expected_location


def _invalidate_shipment_analysis(shipment: dict[str, Any], shipment_id: str) -> None:
    """Drop demo analysis cache entries for this shipment."""
    invalidate_analysis_cache(shipment_id)
    invalidate_analysis_cache(str(shipment.get("_id") or ""))
    tracking = shipment.get("trackingNumber")
    if tracking:
        invalidate_analysis_cache(str(tracking))


# Active (unresolved) incident statuses for the demo workflow:
# OPEN / RECOVERY_REQUIRED → ASSIGNED → PICKUP_CONFIRMED → RESOLVED
ACTIVE_INCIDENT_STATUSES = (
    "OPEN",
    "RECOVERY_REQUIRED",
    "ASSIGNED",
    "PICKUP_CONFIRMED",
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


def _persist_driver_call(
    db: Database,
    *,
    call_id: str | None,
    driver_phone: str | None,
    shipment_id: Any,
    incident_id: Any,
    status: str,
    channel: str | None,
    language: str | None,
    message: str | None,
    failure_reason: str | None = None,
    call_kind: str | None = None,
    is_retry: bool = False,
    simulated: bool = False,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Insert a durable outbound-call / notification record into MongoDB."""
    now = _now()
    record = {
        "call_id": call_id or str(uuid4()),
        "driver_phone": driver_phone,
        "shipment_id": str(shipment_id),
        "assignment_id": str(incident_id) if incident_id is not None else None,
        "incident_id": str(incident_id) if incident_id is not None else None,
        "status": status,
        "channel": channel,
        "language": language or "Telugu",
        "message": message,
        "call_kind": call_kind,
        "is_retry": is_retry,
        "simulated": simulated,
        "created_at": now,
        "updated_at": now,
        "completed_at": None,
        "failure_reason": failure_reason,
        "metadata": dict(metadata or {}),
    }
    db["driver_calls"].insert_one(record)
    return record


def _lifecycle_status(
    shipment_status: str,
    incident: dict[str, Any] | None,
) -> str:
    """
    Demo lifecycle derived from MongoDB shipment + incident (source of truth).

    NORMAL → MISPLACED → RECOVERY_ANALYSIS → RECOVERY_ASSIGNED
      → PICKUP_CONFIRMED → RECOVERED

    Incident DB status RESOLVED maps to lifecycle RECOVERED (end of demo).
    Pickup confirmation does not resolve the incident.
    """
    # Resolved / no active incident
    if incident is None or incident.get("status") == "RESOLVED":
        if shipment_status == "recovered":
            return "RECOVERED"
        if shipment_status == "misplaced":
            return "MISPLACED"
        return "NORMAL"

    if incident.get("status") == "PICKUP_CONFIRMED":
        return "PICKUP_CONFIRMED"

    if incident.get("status") == "ASSIGNED":
        return "RECOVERY_ASSIGNED"

    if incident.get("status") in ("OPEN", "RECOVERY_REQUIRED"):
        if incident.get("analysisStatus") == "RECOVERY_PLAN_AVAILABLE":
            return "RECOVERY_ANALYSIS"
        return "MISPLACED"

    if shipment_status == "recovered":
        return "RECOVERED"
    if shipment_status == "misplaced":
        return "MISPLACED"
    return "NORMAL"


def serialize_incident(db: Database, doc: dict[str, Any]) -> dict[str, Any]:
    """JSON-safe incident payload."""
    vehicle_id = doc.get("vehicle")
    recovery_vehicle_id = doc.get("recoveryVehicle")
    hub_id = doc.get("hub")
    recovery_score = doc.get("recoveryScore")
    recovery_component_scores = doc.get("recoveryComponentScores")
    # Backfill from persisted recovery option when analyze stamped the
    # option id but older incidents never stored recoveryScore.
    option_oid = _to_oid(doc.get("selectedRecoveryOption"))
    if option_oid is not None and (
        recovery_score is None or not recovery_component_scores
    ):
        option = db["recoveryoptions"].find_one(
            {"_id": option_oid},
            {"totalScore": 1, "componentScores": 1},
        )
        if option:
            if recovery_score is None and option.get("totalScore") is not None:
                recovery_score = option.get("totalScore")
            if not recovery_component_scores and option.get("componentScores"):
                recovery_component_scores = option.get("componentScores")
    return {
        "incidentId": doc.get("incidentId"),
        "id": str(doc["_id"]),
        "shipmentId": str(doc["shipment"]),
        "vehicleId": str(vehicle_id) if vehicle_id else None,
        "vehicleNumber": _vehicle_number(db, vehicle_id),
        "recoveryVehicleId": str(recovery_vehicle_id) if recovery_vehicle_id else None,
        "recoveryVehicleNumber": _vehicle_number(db, recovery_vehicle_id),
        "recoveryDriverId": doc.get("recoveryDriverId")
        or _vehicle_number(db, recovery_vehicle_id),
        "incidentType": doc.get("incidentType"),
        "hubId": str(hub_id) if hub_id else None,
        "hubName": _loc_name(db, hub_id),
        "status": doc.get("status"),
        "selectedCandidateId": doc.get("selectedCandidateId"),
        "recoveryPath": list(doc.get("recoveryPath") or []),
        "existingRouteNodes": list(doc.get("existingRouteNodes") or []),
        "vehicleToPickupPath": list(doc.get("vehicleToPickupPath") or []),
        "vehicleToDestinationPath": list(doc.get("vehicleToDestinationPath") or []),
        "pickupCase": doc.get("pickupCase"),
        "pickupNode": doc.get("pickupNode"),
        "destinationNode": doc.get("destinationNode"),
        "recoveryScore": recovery_score,
        "recoveryComponentScores": recovery_component_scores,
        "recoveryCaseId": (
            str(doc["recoveryCase"]) if doc.get("recoveryCase") else None
        ),
        "selectedRecoveryOptionId": (
            str(doc["selectedRecoveryOption"])
            if doc.get("selectedRecoveryOption")
            else None
        ),
        "driverMessage": doc.get("driverMessage"),
        "lateDetectionMessage": doc.get("lateDetectionMessage"),
        "lateDetectionCallAttemptId": doc.get("lateDetectionCallAttemptId"),
        "lateDetectionCallChannel": doc.get("lateDetectionCallChannel"),
        "driverCallAttemptId": doc.get("driverCallAttemptId"),
        "driverCallChannel": doc.get("driverCallChannel"),
        "driverCallStatus": doc.get("driverCallStatus"),
        "driverCallPhone": doc.get("driverCallPhone"),
        "driverCallError": doc.get("driverCallError"),
        "driverCallTriggeredAt": _iso(doc.get("driverCallTriggeredAt")),
        "analysisStatus": doc.get("analysisStatus"),
        "lifecycleStatus": None,  # filled by callers with shipment context
        "assignedAt": _iso(doc.get("assignedAt")),
        "pickupConfirmedAt": _iso(doc.get("pickupConfirmedAt")),
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
            "status": {"$in": list(ACTIVE_INCIDENT_STATUSES)},
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

    Recovery / incident hub is the shipment's **actual** last-confirmed
    location (``currentLocation``), not the planned expected hub.
    """
    shipment = _find_shipment(db, shipment_id)
    if shipment is None:
        raise ShipmentNotFoundError(shipment_id)

    _invalidate_shipment_analysis(shipment, shipment_id)

    ship_oid = shipment["_id"]
    # actual / last-confirmed hub → recovery pickup node
    hub_id = shipment.get("currentLocation")
    if hub_id is None:
        raise RecoveryError(
            "INVALID_SHIPMENT_LOCATION",
            "Shipment has no currentLocation (actual) hub",
            http_status=400,
        )

    vehicle_id = shipment.get("assignedVehicle")
    used_nearby_vehicle = False
    # Fall back to a vehicle currently at the same hub (demo-friendly)
    if vehicle_id is None:
        nearby = db["vehicles"].find_one(
            {"currentLocation": hub_id, "status": {"$in": ["in_transit", "available", "loading"]}},
        ) or db["vehicles"].find_one({"currentLocation": hub_id})
        if nearby:
            vehicle_id = nearby["_id"]
            used_nearby_vehicle = True

    now = _now()
    incident_id = f"INC-{uuid4().hex[:8].upper()}"

    # Close any prior open incidents for this shipment
    db["incidents"].update_many(
        {
            "shipment": ship_oid,
            "status": {"$in": list(ACTIVE_INCIDENT_STATUSES)},
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
        "lateDetectionMessage": None,
        "lateDetectionCallAttemptId": None,
        "lateDetectionCallChannel": None,
        "driverCallAttemptId": None,
        "driverCallChannel": None,
        "analysisStatus": None,
        "resolvedAt": None,
        "createdAt": now,
        "updatedAt": now,
    }
    insert_result = db["incidents"].insert_one(incident_doc)
    incident_doc["_id"] = insert_result.inserted_id

    # Ensure expectedLocation is persisted before marking misplaced so
    # actualNode vs expectedNode comparison is available.
    if shipment.get("expectedLocation") is None:
        sync_expected_location(db, ship_oid)

    # Update shipment state (source of truth) + audit event at actual hub
    apply_shipment_event(
        db,
        ship_oid,
        event_type="misplaced",
        location_id=hub_id,
        description=(
            f"Simulated MISPLACED_SHIPMENT incident {incident_id} "
            f"at actual hub {_loc_name(db, hub_id)}"
        ),
        timestamp=now,
        vehicle_id=vehicle_id,
        update_actual_location=True,
        sync_expected=False,  # misplaced must not advance expected hub
    )
    if vehicle_id is not None:
        db["shipments"].update_one(
            {"_id": ship_oid},
            {"$set": {"assignedVehicle": vehicle_id, "updatedAt": now}},
        )

    # Late detection: call the current/wrong vehicle driver (non-blocking).
    # Package is already on this vehicle / outbound — ask them to confirm & prepare.
    late_detection_notification: dict[str, Any] | None = None
    if vehicle_id is not None:
        vehicle_doc = db["vehicles"].find_one({"_id": vehicle_id}) or {}
        vehicle_number = _vehicle_number(db, vehicle_id)
        display_ship_id = shipment.get("trackingNumber") or str(ship_oid)
        late_msg = build_late_detection_message(
            shipment_tracking=shipment.get("trackingNumber", ""),
            shipment_id=display_ship_id,
            pickup_hub=_loc_name(db, hub_id),
            destination=_loc_name(db, shipment.get("destination")),
            vehicle_number=vehicle_number,
        )
        late_notify = send_driver_notification(
            str(vehicle_id),
            late_msg,
            call_kind="late_detection",
            vehicle_doc=vehicle_doc,
            metadata={
                "shipmentId": display_ship_id,
                "incidentId": incident_id,
                "pickupNode": _loc_name(db, hub_id),
                "destinationNode": _loc_name(db, shipment.get("destination")),
                "lateDetection": True,
            },
        )
        late_call_status = (
            "initiated"
            if late_notify.delivered
            else ("simulated" if late_notify.simulated else "failed")
        )
        _persist_driver_call(
            db,
            call_id=late_notify.attempt_id,
            driver_phone=late_notify.phone,
            shipment_id=ship_oid,
            incident_id=incident_doc["_id"],
            status=late_call_status,
            channel=late_notify.channel,
            language=late_notify.language,
            message=late_notify.message,
            failure_reason=None if late_notify.delivered else late_notify.detail,
            call_kind="late_detection",
            simulated=bool(late_notify.simulated),
            metadata={
                "pickupHub": _loc_name(db, hub_id),
                "destinationHub": _loc_name(db, shipment.get("destination")),
                "vehicleNumber": vehicle_number,
                "trackingNumber": shipment.get("trackingNumber"),
            },
        )
        db["incidents"].update_one(
            {"_id": incident_doc["_id"]},
            {
                "$set": {
                    "lateDetectionMessage": late_notify.message,
                    "lateDetectionCallAttemptId": late_notify.attempt_id,
                    "lateDetectionCallChannel": late_notify.channel,
                    "lateDetectionCallStatus": late_call_status,
                    "lateDetectionCallPhone": late_notify.phone,
                    "lateDetectionCallError": (
                        None if late_notify.delivered else late_notify.detail
                    ),
                    "updatedAt": _now(),
                }
            },
        )
        incident_doc["lateDetectionMessage"] = late_notify.message
        incident_doc["lateDetectionCallAttemptId"] = late_notify.attempt_id
        incident_doc["lateDetectionCallChannel"] = late_notify.channel
        late_detection_notification = {
            "vehicleId": late_notify.vehicle_id,
            "message": late_notify.message,
            "channel": late_notify.channel,
            "delivered": late_notify.delivered,
            "sentAt": late_notify.sent_at,
            "detail": late_notify.detail,
            "attemptId": late_notify.attempt_id,
            "callKind": late_notify.call_kind,
            "phone": late_notify.phone,
            "language": late_notify.language,
            "simulated": late_notify.simulated,
            "status": late_call_status,
        }

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

    hub_name = _loc_name(db, hub_id)
    expected_name = _loc_name(
        db, updated_shipment.get("expectedLocation") or shipment.get("expectedLocation")
    )
    simulate_step = build_simulate_step(
        hub_name=hub_name,
        expected_name=expected_name,
        tracking=updated_shipment.get("trackingNumber"),
        vehicle_id=vehicle_id,
        used_nearby_vehicle=used_nearby_vehicle,
    )
    explanation_trace = [simulate_step]
    if recovery and recovery.get("explanationTrace"):
        # Prepend simulate; analysis steps already cover context→select
        explanation_trace = [simulate_step] + list(recovery["explanationTrace"])
        recovery = {**recovery, "explanationTrace": explanation_trace}

    return {
        "incident": incident_payload,
        "shipment": {
            "id": str(ship_oid),
            "trackingNumber": updated_shipment.get("trackingNumber"),
            "status": updated_shipment.get("status"),
            "lifecycleStatus": incident_payload["lifecycleStatus"],
            "currentLocation": _loc_name(db, updated_shipment.get("currentLocation")),
            "actualLocation": _loc_name(db, updated_shipment.get("currentLocation")),
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
        "lateDetectionNotification": late_detection_notification,
        "explanationTrace": explanation_trace,
        "message": (
            "Incident simulated — recovery required at actual/last-confirmed hub "
            f"({hub_name})"
            + (
                "; late-detection driver call placed"
                if late_detection_notification
                and not late_detection_notification.get("simulated")
                else "; late-detection driver notify logged"
                if late_detection_notification
                else ""
            )
        ),
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
    score: float | None = None,
) -> dict[str, Any]:
    """
    Validate a recovery option, assign it, notify driver.

    Preference order:
      1. Persisted selected RecoveryOption (from prior analyze)
      2. Client-supplied candidate snapshot (candidateId + vehicleId + path)
      3. Re-run orchestrator only when neither is available

    Assignment uses the persisted plan when present so the decision survives
    beyond the analyze response and is not recomputed to a different candidate.
    """
    shipment = _find_shipment(db, shipment_id)
    if shipment is None:
        raise ShipmentNotFoundError(shipment_id)

    _invalidate_shipment_analysis(shipment, shipment_id)

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
    persisted_option: dict[str, Any] | None = None

    # 1. Prefer persisted selected plan for this recovery case
    persisted_option = get_selected_recovery_option(
        db, _to_oid(incident.get("recoveryCase"))
    )
    if persisted_option is None and incident.get("selectedRecoveryOption"):
        persisted_option = db["recoveryoptions"].find_one(
            {"_id": incident["selectedRecoveryOption"]}
        )

    if persisted_option and persisted_option.get("status") in (
        "proposed",
        "selected",
        "executing",
    ):
        persisted_as = selected_option_as_assignment(persisted_option)
        # If client asked for a specific different candidate, honour override
        client_override = bool(
            candidate_id
            and candidate_id != persisted_as.get("candidateId")
            and vehicle_id
            and path
        )
        if not client_override:
            selected = persisted_as
        # else fall through to client-provided path below

    if selected is None and candidate_id and vehicle_id and path:
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
            "score": score,
            "feasible": True,
        }
    elif selected is None:
        # Re-run engine only when no persisted plan and no client snapshot
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
            # Prefer freshly persisted plan from this analyze pass
            plan = analysis.get("recoveryPlan")
            if plan and selected:
                selected["recoveryOptionId"] = plan.get("id")

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
    driver_id = _vehicle_number(db, recovery_vehicle_oid)
    recovery_score = selected.get("score")
    if recovery_score is None and analysis:
        sel = analysis.get("selectedRecovery") or {}
        if sel.get("candidateId") == candidate:
            recovery_score = sel.get("score")

    recovery_vehicle_doc = (
        db["vehicles"].find_one({"_id": recovery_vehicle_oid}) or {}
    )
    driver_name = (
        recovery_vehicle_doc.get("driverName")
        or recovery_vehicle_doc.get("driver")
        or driver_id
    )

    # Check idempotency: has a call already been placed for this incident assignment?
    existing_call = db["driver_calls"].find_one(
        {"incident_id": str(incident["_id"])},
        sort=[("created_at", -1)],
    )

    if existing_call and existing_call.get("status") in (
        "initiated",
        "connected",
        "completed",
        "ringing",
        "in_progress",
    ):
        call_id = existing_call.get("call_id")
        call_status = existing_call.get("status", "initiated")
        driver_phone = existing_call.get("driver_phone")
        call_error = None
        call_triggered = True
        notify_delivered = True
        notify_channel = existing_call.get("channel", "sarvam_voice")
        notify_message = existing_call.get("message", "")
        notify_detail = "Existing call already placed for this recovery assignment (duplicate prevented)"
        notify_sent_at = _iso(existing_call.get("created_at")) or now.isoformat()
        notify_simulated = existing_call.get("channel") != "sarvam_voice"
        notify_lang = existing_call.get("language", "Telugu")
    else:
        display_shipment_id = shipment.get("trackingNumber") or str(ship_oid)
        message = build_recovery_assignment_message(
            shipment_tracking=display_shipment_id,
            shipment_id=str(ship_oid),
            pickup_hub=pickup_hub,
            destination=destination,
            recovery_route=recovery_path,
            vehicle_number=driver_id,
        )
        notify = send_driver_notification(
            str(recovery_vehicle_oid),
            message,
            call_kind="recovery_assign",
            vehicle_doc=recovery_vehicle_doc,
            metadata={
                "shipmentId": display_shipment_id,
                "tracking": display_shipment_id,
                "incidentId": incident.get("incidentId"),
                "candidateId": candidate,
                "pickupCase": pickup,
                "pickupNode": pickup_hub,
                "destinationNode": destination,
                "driverName": driver_name,
            },
        )
        call_id = notify.attempt_id
        call_status = "initiated" if notify.delivered else "failed"
        driver_phone = notify.phone
        call_error = notify.detail if not notify.delivered else None
        call_triggered = bool(
            notify.attempt_id
            or (notify.channel == "sarvam_voice" and notify.delivered)
        )
        notify_delivered = notify.delivered
        notify_channel = notify.channel
        notify_message = notify.message
        notify_detail = notify.detail
        notify_sent_at = notify.sent_at
        notify_simulated = notify.simulated
        notify_lang = notify.language or "Telugu"

        _persist_driver_call(
            db,
            call_id=call_id,
            driver_phone=driver_phone,
            shipment_id=ship_oid,
            incident_id=incident["_id"],
            status=call_status,
            channel=notify_channel,
            language=notify_lang,
            message=notify_message,
            failure_reason=call_error,
            call_kind="recovery_assign",
            simulated=bool(notify_simulated),
            metadata={
                "candidateId": candidate,
                "pickupHub": pickup_hub,
                "destinationHub": destination,
                "vehicleNumber": driver_id,
                "driverName": driver_name,
                "trackingNumber": shipment.get("trackingNumber"),
            },
        )

    option_oid = _to_oid(selected.get("recoveryOptionId"))
    if option_oid is None and persisted_option:
        # Confirm fingerprint still matches
        if (
            persisted_option.get("candidateId") == candidate
            or str(persisted_option.get("vehicle")) == str(recovery_vehicle_oid)
        ):
            option_oid = persisted_option["_id"]

    db["incidents"].update_one(
        {"_id": incident["_id"]},
        {
            "$set": {
                "status": "ASSIGNED",
                "selectedCandidateId": candidate,
                "recoveryVehicle": recovery_vehicle_oid,
                "recoveryDriverId": driver_id,
                "recoveryPath": recovery_path,
                "existingRouteNodes": list(selected.get("existingRouteNodes") or []),
                "vehicleToPickupPath": list(selected.get("vehicleToPickupPath") or []),
                "vehicleToDestinationPath": list(
                    selected.get("vehicleToDestinationPath") or []
                ),
                "pickupCase": pickup,
                "pickupNode": pickup_hub,
                "destinationNode": destination,
                "recoveryScore": recovery_score,
                "recoveryComponentScores": (
                    selected.get("breakdown")
                    or selected.get("componentScores")
                    or (persisted_option or {}).get("componentScores")
                ),
                "assignedAt": now,
                "pickupConfirmedAt": None,
                "driverMessage": notify_message,
                "driverCallAttemptId": call_id,
                "driverCallChannel": notify_channel,
                "driverCallStatus": call_status,
                "driverCallPhone": driver_phone,
                "driverCallError": call_error,
                "driverCallTriggeredAt": now,
                "selectedRecoveryOption": option_oid,
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

    case_oid = _to_oid(incident.get("recoveryCase"))
    if option_oid:
        mark_option_status(
            db,
            option_oid,
            "executing",
            case_status="option_selected",
            case_oid=case_oid,
        )
    elif case_oid:
        db["recoverycases"].update_one(
            {"_id": case_oid},
            {
                "$set": {
                    "status": "option_selected",
                    "selectedOption": option_oid,
                    "updatedAt": now,
                }
            },
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
                f"vehicle {driver_id or recovery_vehicle_oid} "
                f"(pickup={pickup_hub}, destination={destination})"
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

    plan_payload = None
    if option_oid:
        opt = db["recoveryoptions"].find_one({"_id": option_oid})
        plan_payload = serialize_recovery_plan(opt)

    if call_status == "initiated":
        summary_message = f"Recovery assigned — Sarvam Telugu outbound call initiated to driver ({mask_phone(driver_phone or '')})"
    elif call_status == "failed":
        summary_message = f"Recovery assigned, but driver call failed: {call_error}"
    else:
        summary_message = "Recovery assigned"

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
            "vehicleNumber": driver_id,
            "driverId": driver_id,
            "driverName": driver_name,
            "path": recovery_path,
            "pickupCase": pickup,
            "pickupNode": pickup_hub,
            "destinationNode": destination,
            "recoveryScore": recovery_score,
            "recoveryOptionId": str(option_oid) if option_oid else None,
            "assignedAt": _iso(now),
        },
        "driver": {
            "phone": driver_phone,
            "driverId": driver_id,
            "driverName": driver_name,
            "vehicleId": str(recovery_vehicle_oid),
            "vehicleNumber": driver_id,
        },
        "call": {
            "triggered": call_triggered,
            "status": call_status,
            "call_id": call_id,
            "phone": driver_phone,
            "error": call_error,
            "language": notify_lang,
        },
        "recoveryPlan": plan_payload,
        "driverNotification": {
            "vehicleId": str(recovery_vehicle_oid),
            "message": notify_message,
            "channel": notify_channel,
            "delivered": notify_delivered,
            "sentAt": notify_sent_at,
            "detail": notify_detail,
            "attemptId": call_id,
            "callKind": "recovery_assign",
            "phone": driver_phone,
            "language": notify_lang,
            "simulated": notify_simulated,
        },
        "recovery": analysis,
        "message": summary_message,
    }


def retry_recovery_call(
    db: Database,
    shipment_id: str,
    *,
    phone: str | None = None,
) -> dict[str, Any]:
    """
    Explicitly trigger or retry an outbound Sarvam phone call to the driver
    for an assigned recovery incident.
    """
    shipment = _find_shipment(db, shipment_id)
    if shipment is None:
        raise ShipmentNotFoundError(shipment_id)

    ship_oid = shipment["_id"]
    incident = get_active_incident_for_shipment(db, ship_oid)
    if incident is None:
        incident = get_latest_incident_for_shipment(db, ship_oid)
    if incident is None:
        raise RecoveryError(
            "NO_INCIDENT",
            f"No incident found for shipment {shipment_id}",
            http_status=404,
        )

    recovery_vehicle_oid = incident.get("recoveryVehicle") or shipment.get("assignedVehicle")
    if not recovery_vehicle_oid:
        raise RecoveryError(
            "NO_RECOVERY_VEHICLE",
            "No recovery vehicle assigned to this incident yet",
            http_status=400,
        )

    vehicle_doc = db["vehicles"].find_one({"_id": recovery_vehicle_oid}) or {}
    driver_id = incident.get("recoveryDriverId") or _vehicle_number(db, recovery_vehicle_oid)
    driver_name = (
        vehicle_doc.get("driverName")
        or vehicle_doc.get("driver")
        or driver_id
    )

    pickup_hub = (
        incident.get("pickupNode")
        or (incident.get("recoveryPath") or [None])[0]
        or _loc_name(db, shipment.get("currentLocation"))
        or "Current Hub"
    )
    destination = (
        incident.get("destinationNode")
        or (incident.get("recoveryPath") or [None])[-1]
        or _loc_name(db, shipment.get("destination"))
        or "Destination Hub"
    )

    display_shipment_id = shipment.get("trackingNumber") or str(ship_oid)
    message = build_recovery_assignment_message(
        shipment_tracking=display_shipment_id,
        shipment_id=str(ship_oid),
        pickup_hub=pickup_hub,
        destination=destination,
        recovery_route=list(incident.get("recoveryPath") or []),
        vehicle_number=driver_id,
    )

    notify = send_driver_notification(
        str(recovery_vehicle_oid),
        message,
        call_kind="recovery_assign",
        phone=phone,
        vehicle_doc=vehicle_doc,
        metadata={
            "shipmentId": display_shipment_id,
            "tracking": display_shipment_id,
            "incidentId": incident.get("incidentId"),
            "candidateId": incident.get("selectedCandidateId"),
            "pickupCase": incident.get("pickupCase"),
            "pickupNode": pickup_hub,
            "destinationNode": destination,
            "driverName": driver_name,
            "isRetry": "true",
        },
    )

    now = _now()
    call_id = notify.attempt_id
    call_status = "initiated" if notify.delivered else "failed"
    call_error = notify.detail if not notify.delivered else None
    driver_phone = notify.phone

    _persist_driver_call(
        db,
        call_id=call_id,
        driver_phone=driver_phone,
        shipment_id=ship_oid,
        incident_id=incident["_id"],
        status=call_status,
        channel=notify.channel,
        language=notify.language or "Telugu",
        message=notify.message,
        failure_reason=call_error,
        call_kind="recovery_assign",
        is_retry=True,
        simulated=bool(notify.simulated),
        metadata={
            "pickupHub": pickup_hub,
            "destinationHub": destination,
            "vehicleNumber": driver_id,
            "driverName": driver_name,
            "trackingNumber": shipment.get("trackingNumber"),
        },
    )

    db["incidents"].update_one(
        {"_id": incident["_id"]},
        {
            "$set": {
                "driverCallAttemptId": call_id,
                "driverCallChannel": notify.channel,
                "driverCallStatus": call_status,
                "driverCallPhone": driver_phone,
                "driverCallError": call_error,
                "driverCallTriggeredAt": now,
                "driverMessage": notify.message,
                "updatedAt": now,
            }
        },
    )

    updated_incident = db["incidents"].find_one({"_id": incident["_id"]})
    return {
        "success": notify.delivered,
        "call": {
            "triggered": bool(
                notify.attempt_id
                or (notify.channel == "sarvam_voice" and notify.delivered)
            ),
            "status": call_status,
            "call_id": call_id,
            "phone": driver_phone,
            "error": call_error,
            "language": notify.language or "Telugu",
        },
        "driver": {
            "phone": driver_phone,
            "driverId": driver_id,
            "driverName": driver_name,
            "vehicleId": str(recovery_vehicle_oid),
            "vehicleNumber": driver_id,
        },
        "incident": serialize_incident(db, updated_incident),
        "message": (
            f"Retry call initiated to driver ({mask_phone(driver_phone or '')})"
            if notify.delivered
            else f"Retry call failed: {call_error}"
        ),
    }


def get_recovery_call_status(
    db: Database,
    shipment_id: str,
) -> dict[str, Any]:
    """
    Get current driver outbound call status for a shipment recovery assignment.
    Polls Sarvam if call_id is active and status is 'initiated' or 'in_progress'.
    """
    shipment = _find_shipment(db, shipment_id)
    if shipment is None:
        raise ShipmentNotFoundError(shipment_id)

    ship_oid = shipment["_id"]
    incident = get_active_incident_for_shipment(db, ship_oid)
    if incident is None:
        incident = get_latest_incident_for_shipment(db, ship_oid)
    if incident is None:
        raise RecoveryError(
            "NO_INCIDENT",
            f"No incident found for shipment {shipment_id}",
            http_status=404,
        )

    latest_call = db["driver_calls"].find_one(
        {"incident_id": str(incident["_id"])},
        sort=[("created_at", -1)],
    )

    call_id = incident.get("driverCallAttemptId") or (
        latest_call.get("call_id") if latest_call else None
    )
    call_status = incident.get("driverCallStatus") or (
        latest_call.get("status") if latest_call else ("initiated" if call_id else "not_triggered")
    )
    call_error = incident.get("driverCallError") or (
        latest_call.get("failure_reason") if latest_call else None
    )
    call_phone = incident.get("driverCallPhone") or (
        latest_call.get("driver_phone") if latest_call else None
    )

    # If call was initiated, check live status from Sarvam
    if call_id and call_status in ("initiated", "in_progress", "ringing"):
        sarvam_status = get_outbound_call_status(call_id)
        if sarvam_status.get("ok"):
            remote_status = sarvam_status.get("status", call_status)
            if remote_status != call_status:
                call_status = remote_status
                now = _now()
                db["driver_calls"].update_one(
                    {"call_id": call_id},
                    {"$set": {"status": remote_status, "updated_at": now}},
                )
                db["incidents"].update_one(
                    {"_id": incident["_id"]},
                    {"$set": {"driverCallStatus": remote_status, "updatedAt": now}},
                )
                if remote_status in ("answered", "connected", "in_progress"):
                    logger.info(
                        "[SARVAM] call connected: call_id=%s, phone=%s",
                        call_id,
                        mask_phone(call_phone or ""),
                    )
                elif remote_status in ("completed", "confirmed"):
                    logger.info(
                        "[SARVAM] call completed: call_id=%s, phone=%s",
                        call_id,
                        mask_phone(call_phone or ""),
                    )
                elif remote_status in ("failed", "declined"):
                    logger.warning(
                        "[SARVAM] call failed: call_id=%s, status=%s",
                        call_id,
                        remote_status,
                    )

    return {
        "ok": True,
        "shipmentId": str(ship_oid),
        "incidentId": incident.get("incidentId"),
        "call": {
            "triggered": bool(call_id or call_status != "not_triggered"),
            "status": call_status,
            "call_id": call_id,
            "phone": call_phone,
            "error": call_error,
            "attemptId": call_id,
        },
        "incident": serialize_incident(db, incident),
    }


def update_recovery_call_status(
    db: Database,
    shipment_id: str,
    status: str,
    failure_reason: str | None = None,
) -> dict[str, Any]:
    """
    Update driver call status (e.g. from webhook, operator action, or driver response).
    Statuses: 'calling', 'answered', 'confirmed', 'declined', 'failed', 'retry_available'.
    """
    shipment = _find_shipment(db, shipment_id)
    if shipment is None:
        raise ShipmentNotFoundError(shipment_id)
    ship_oid = shipment["_id"]
    incident = (
        get_active_incident_for_shipment(db, ship_oid)
        or get_latest_incident_for_shipment(db, ship_oid)
    )
    if incident is None:
        raise RecoveryError(
            "NO_INCIDENT",
            f"No incident found for shipment {shipment_id}",
            http_status=404,
        )

    now = _now()
    clean_status = status.lower().strip()
    update_fields: dict[str, Any] = {
        "driverCallStatus": clean_status,
        "updatedAt": now,
    }
    if failure_reason:
        update_fields["driverCallError"] = failure_reason

    db["incidents"].update_one({"_id": incident["_id"]}, {"$set": update_fields})
    db["driver_calls"].update_many(
        {"incident_id": str(incident["_id"])},
        {
            "$set": {
                "status": clean_status,
                "failure_reason": failure_reason,
                "updated_at": now,
                **(
                    {"completed_at": now}
                    if clean_status in ("completed", "confirmed")
                    else {}
                ),
            }
        },
    )

    if clean_status in ("answered", "connected"):
        logger.info(
            "[SARVAM] call connected: shipment=%s status=%s",
            ship_oid,
            clean_status,
        )
    elif clean_status in ("completed", "confirmed"):
        logger.info(
            "[SARVAM] call completed: shipment=%s status=%s",
            ship_oid,
            clean_status,
        )
    elif clean_status in ("failed", "declined"):
        logger.warning(
            "[SARVAM] call failed: shipment=%s status=%s reason=%s",
            ship_oid,
            clean_status,
            failure_reason,
        )

    return get_recovery_call_status(db, shipment_id)


# ---------------------------------------------------------------------------
# Pickup confirmation (simulated driver confirmation)
# ---------------------------------------------------------------------------


def confirm_recovery_pickup(db: Database, shipment_id: str) -> dict[str, Any]:
    """
    Simulate driver confirmation that the misplaced shipment was picked up.

    Does NOT integrate live GPS / telephony. Does NOT resolve the incident —
    operator resolve remains a separate step after the shipment is recovered.
    """
    shipment = _find_shipment(db, shipment_id)
    if shipment is None:
        raise ShipmentNotFoundError(shipment_id)

    _invalidate_shipment_analysis(shipment, shipment_id)

    ship_oid = shipment["_id"]
    incident = get_active_incident_for_shipment(db, ship_oid)
    if incident is None:
        raise RecoveryError(
            "NO_ACTIVE_INCIDENT",
            f"No active incident for shipment {shipment_id}",
            http_status=400,
        )

    status = incident.get("status")
    if status == "PICKUP_CONFIRMED":
        raise RecoveryError(
            "PICKUP_ALREADY_CONFIRMED",
            "Recovery pickup already confirmed for this incident",
            http_status=400,
        )
    if status != "ASSIGNED":
        raise RecoveryError(
            "PICKUP_BEFORE_ASSIGNMENT",
            "Cannot confirm pickup before a recovery candidate is assigned",
            http_status=400,
        )

    recovery_vehicle_oid = _to_oid(incident.get("recoveryVehicle"))
    if recovery_vehicle_oid is None:
        recovery_vehicle_oid = _to_oid(shipment.get("assignedVehicle"))
    if recovery_vehicle_oid is None:
        raise RecoveryError(
            "NO_RECOVERY_VEHICLE",
            "Assigned incident has no recovery vehicle",
            http_status=400,
        )

    now = _now()
    pickup_location = shipment.get("currentLocation") or incident.get("hub")

    db["incidents"].update_one(
        {"_id": incident["_id"]},
        {
            "$set": {
                "status": "PICKUP_CONFIRMED",
                "pickupConfirmedAt": now,
                "driverCallStatus": "confirmed",
                "updatedAt": now,
            }
        },
    )
    db["driver_calls"].update_many(
        {"incident_id": str(incident["_id"])},
        {"$set": {"status": "confirmed", "completed_at": now}},
    )
    logger.info(
        "[SARVAM] call completed: driver confirmed recovery assignment for shipment %s",
        ship_oid,
    )

    # Shipment is recovered once pickup is confirmed; incident stays open until resolve
    db["shipments"].update_one(
        {"_id": ship_oid},
        {
            "$set": {
                "status": "recovered",
                "assignedVehicle": recovery_vehicle_oid,
                "updatedAt": now,
            }
        },
    )

    if incident.get("recoveryCase"):
        option_oid = _to_oid(incident.get("selectedRecoveryOption"))
        mark_option_status(
            db,
            option_oid,
            "executing",
            case_status="in_progress",
            case_oid=_to_oid(incident["recoveryCase"]),
        )

    db["shipmentevents"].insert_one(
        {
            "shipment": ship_oid,
            "type": "recovery_pickup_confirmed",
            "location": pickup_location,
            "vehicle": recovery_vehicle_oid,
            "timestamp": now,
            "description": (
                "Simulated driver confirmation: shipment picked up at recovery "
                f"node {incident.get('pickupNode') or _loc_name(db, pickup_location)} "
                f"by vehicle {_vehicle_number(db, recovery_vehicle_oid)}"
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
        "pickup": {
            "confirmed": True,
            "simulated": True,
            "confirmedAt": _iso(now),
            "pickupNode": updated_incident.get("pickupNode"),
            "destinationNode": updated_incident.get("destinationNode"),
            "vehicleId": str(recovery_vehicle_oid),
            "vehicleNumber": _vehicle_number(db, recovery_vehicle_oid),
            "eventType": "recovery_pickup_confirmed",
        },
        "message": (
            "Simulated pickup confirmed — shipment recovered; "
            "operator may resolve the incident"
        ),
    }


# ---------------------------------------------------------------------------
# Resolve
# ---------------------------------------------------------------------------


def resolve_recovery(db: Database, shipment_id: str) -> dict[str, Any]:
    """
    End of the demo recovery workflow: mark incident RESOLVED.

    Prefer resolving after simulated pickup confirmation
    (ASSIGNED → PICKUP_CONFIRMED → recovered shipment → RESOLVED).
    """
    shipment = _find_shipment(db, shipment_id)
    if shipment is None:
        raise ShipmentNotFoundError(shipment_id)

    _invalidate_shipment_analysis(shipment, shipment_id)

    ship_oid = shipment["_id"]
    incident = get_active_incident_for_shipment(db, ship_oid)
    if incident is None:
        incident = get_latest_incident_for_shipment(db, ship_oid)
        if incident is None or incident.get("status") == "RESOLVED":
            raise RecoveryError(
                "NO_ACTIVE_INCIDENT",
                f"No resolvable incident for shipment {shipment_id}",
                http_status=400,
            )

    if incident.get("status") == "ASSIGNED":
        raise RecoveryError(
            "PICKUP_NOT_CONFIRMED",
            "Confirm simulated driver pickup before resolving the incident",
            http_status=400,
        )
    if incident.get("status") != "PICKUP_CONFIRMED":
        raise RecoveryError(
            "INVALID_INCIDENT_STATE",
            f"Cannot resolve incident in status {incident.get('status')}",
            http_status=400,
        )

    now = _now()
    recovery_vehicle = incident.get("recoveryVehicle") or shipment.get("assignedVehicle")

    db["incidents"].update_one(
        {"_id": incident["_id"]},
        {"$set": {"status": "RESOLVED", "resolvedAt": now, "updatedAt": now}},
    )
    db["shipments"].update_one(
        {"_id": ship_oid},
        {
            "$set": {
                "status": "recovered",
                "assignedVehicle": recovery_vehicle,
                "updatedAt": now,
            }
        },
    )
    if incident.get("recoveryCase"):
        option_oid = _to_oid(incident.get("selectedRecoveryOption"))
        mark_option_status(
            db,
            option_oid,
            "completed",
            case_status="resolved",
            case_oid=_to_oid(incident["recoveryCase"]),
        )

    db["shipmentevents"].insert_one(
        {
            "shipment": ship_oid,
            "type": "recovered",
            "location": shipment.get("destination") or shipment.get("currentLocation"),
            "vehicle": recovery_vehicle,
            "timestamp": now,
            "description": (
                f"Incident {incident.get('incidentId')} resolved — "
                "shipment continuing toward destination"
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
            "resolved": True,
        },
        "message": "Incident resolved — recovery workflow complete",
    }


def get_incident_stats(db: Database) -> dict[str, Any]:
    """
    Aggregate recovery-optimization KPIs across all incidents for the
    overview dashboard: solved vs. active counts, resolution rate, and
    average recovery score + component breakdown from persisted plans.
    """
    docs = list(db["incidents"].find({}))
    total = len(docs)
    resolved = [d for d in docs if d.get("status") == "RESOLVED"]
    active = [d for d in docs if d.get("status") in ACTIVE_INCIDENT_STATUSES]
    scored = [d for d in docs if isinstance(d.get("recoveryScore"), (int, float))]

    avg_score = (
        sum(float(d["recoveryScore"]) for d in scored) / len(scored)
        if scored
        else None
    )

    component_totals: dict[str, float] = {}
    component_counts: dict[str, int] = {}
    for d in docs:
        components = d.get("recoveryComponentScores") or {}
        for key, value in components.items():
            if isinstance(value, (int, float)):
                component_totals[key] = component_totals.get(key, 0.0) + float(value)
                component_counts[key] = component_counts.get(key, 0) + 1
    avg_components = {
        key: round(component_totals[key] / component_counts[key], 4)
        for key in component_totals
    }

    # "Detection → pickup confirmed" is the actual operational recovery
    # speed. Detection → resolvedAt is intentionally excluded here: `resolve`
    # is a manual demo close-out button an operator can click whenever, so
    # that duration reflects operator timing, not recovery performance.
    recovery_durations_min: list[float] = []
    for d in docs:
        created = d.get("createdAt")
        picked_up_at = d.get("pickupConfirmedAt")
        if created and picked_up_at:
            try:
                recovery_durations_min.append((picked_up_at - created).total_seconds() / 60.0)
            except Exception:
                continue
    avg_recovery_min = (
        sum(recovery_durations_min) / len(recovery_durations_min)
        if recovery_durations_min
        else None
    )

    resolution_rate = (len(resolved) / total) if total else None

    return {
        "totalIncidents": total,
        "resolvedCount": len(resolved),
        "activeCount": len(active),
        "resolutionRate": round(resolution_rate, 4) if resolution_rate is not None else None,
        "avgRecoveryScore": round(avg_score, 4) if avg_score is not None else None,
        "avgComponentScores": avg_components or None,
        "avgRecoveryMinutes": round(avg_recovery_min, 1) if avg_recovery_min is not None else None,
        "recoveryTimedCount": len(recovery_durations_min),
        "scoredCount": len(scored),
    }


def list_active_incidents(db: Database) -> dict[str, Any]:
    docs = list(
        db["incidents"].find(
            {"status": {"$in": list(ACTIVE_INCIDENT_STATUSES)}},
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
