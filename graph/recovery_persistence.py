"""
Persist selected (and rejected) recovery plans into MongoDB.

Uses the existing ``recoverycases`` / ``recoveryoptions`` collections.
Does NOT change scoring or candidate-generation logic.

Idempotency: repeated analysis for the same open recovery case updates the
selected option in place when the fingerprint matches, instead of inserting
uncontrolled duplicates.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from pymongo.database import Database


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _to_oid(value: Any) -> ObjectId | None:
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return value
    try:
        return ObjectId(value)
    except Exception:
        return None


def _loc_by_node(db: Database, node_key: str | None) -> ObjectId | None:
    if not node_key:
        return None
    doc = db["locations"].find_one(
        {"graphNodeKey": node_key}, {"_id": 1}
    ) or db["locations"].find_one({"name": node_key}, {"_id": 1})
    return doc["_id"] if doc else None


def _vehicle_route_id(db: Database, vehicle_oid: ObjectId) -> ObjectId | None:
    doc = db["vehicles"].find_one({"_id": vehicle_oid}, {"currentRoute": 1})
    if not doc:
        return None
    return _to_oid(doc.get("currentRoute"))


def _vehicle_number(db: Database, vehicle_oid: ObjectId) -> str | None:
    doc = db["vehicles"].find_one({"_id": vehicle_oid}, {"vehicleNumber": 1})
    return doc.get("vehicleNumber") if doc else None


def _fingerprint(candidate_id: str | None, vehicle_id: str | None, pickup_case: str | None) -> tuple:
    return (candidate_id or "", vehicle_id or "", pickup_case or "")


def _scores_from_breakdown(breakdown: dict[str, Any] | None) -> dict[str, Any] | None:
    if not breakdown:
        return None
    # Map scorer keys → RecoveryOption.scores field names
    return {
        "cost": breakdown.get("cost"),
        "deliveryTime": breakdown.get("time"),
        "capacity": breakdown.get("capacity"),
        "deadline": breakdown.get("deadline"),
        "priority": breakdown.get("priority"),
        "detour": breakdown.get("detour"),
        "connectivity": breakdown.get("connectivity"),
    }


def _option_doc_from_candidate(
    *,
    recovery_case_oid: ObjectId,
    shipment_oid: ObjectId,
    incident_oid: ObjectId | None,
    candidate: dict[str, Any],
    shipment: dict[str, Any],
    pickup_node: str | None,
    destination_node: str | None,
    rank: int,
    status: str,
    route_oid: ObjectId | None,
    pickup_loc: ObjectId | None,
    dropoff_loc: ObjectId | None,
    driver_id: str | None,
    now: datetime,
) -> dict[str, Any]:
    """Build a recoveryoptions document from orchestrator candidate payload.

    Only stores values present on the candidate / shipment — never fabricates.
    """
    vehicle_oid = _to_oid(candidate.get("vehicleId"))
    metrics = candidate.get("metrics") or {}
    breakdown = candidate.get("breakdown") or candidate.get("componentScores")
    path = list(candidate.get("path") or [])
    avail = metrics.get("availableCapacity") or {}

    weight = shipment.get("weight")
    volume = shipment.get("volume")
    required_capacity = None
    if weight is not None or volume is not None:
        required_capacity = {
            "weight": float(weight) if weight is not None else 0.0,
            "volume": float(volume) if volume is not None else 0.0,
        }

    available_capacity = None
    if avail.get("weight") is not None or avail.get("volume") is not None:
        available_capacity = {
            "weight": float(avail.get("weight") or 0.0),
            "volume": float(avail.get("volume") or 0.0),
        }

    component_scores = None
    if breakdown:
        component_scores = {
            "time": breakdown.get("time"),
            "cost": breakdown.get("cost"),
            "capacity": breakdown.get("capacity"),
            "deadline": breakdown.get("deadline"),
            "priority": breakdown.get("priority"),
            "detour": breakdown.get("detour"),
            "connectivity": breakdown.get("connectivity"),
        }

    distance = metrics.get("distance")
    if distance is None:
        distance = candidate.get("estimatedDistance")
    travel_min = metrics.get("travelTime")
    if travel_min is None:
        travel_min = candidate.get("estimatedTravelTimeMin")
    cost = metrics.get("cost")
    if cost is None:
        cost = candidate.get("estimatedCost")
    buffer = metrics.get("deadlineBuffer")

    doc: dict[str, Any] = {
        "recoveryCase": recovery_case_oid,
        "shipment": shipment_oid,
        "vehicle": vehicle_oid,
        "incident": incident_oid,
        "candidateId": candidate.get("candidateId"),
        "pickupCase": candidate.get("pickupCase"),
        "recoveryPath": path,
        "pickupNode": pickup_node or (path[0] if path else None),
        "destinationNode": destination_node or (path[-1] if path else None),
        "driverId": driver_id,
        "route": route_oid,
        "pickupLocation": pickup_loc,
        "dropoffLocation": dropoff_loc,
        "transferHubs": [],
        "requiredCapacity": required_capacity,
        "availableCapacity": available_capacity,
        "estimatedCost": cost,
        "estimatedTravelTimeMin": travel_min,
        "distanceKm": distance,
        "deadlineBufferMinutes": buffer,
        "scores": _scores_from_breakdown(breakdown if isinstance(breakdown, dict) else None),
        "componentScores": component_scores,
        "explanation": candidate.get("explanation"),
        "totalScore": candidate.get("score"),
        "rank": rank,
        "isFeasible": bool(candidate.get("feasible", True)),
        "infeasibilityReasons": (
            [candidate["rejectionReason"]]
            if candidate.get("rejectionReason")
            else []
        ),
        "status": status,
        "updatedAt": now,
    }
    return doc


def serialize_recovery_plan(option: dict[str, Any] | None) -> dict[str, Any] | None:
    """JSON-safe recovery plan summary for API responses."""
    if option is None:
        return None
    return {
        "id": str(option["_id"]),
        "recoveryCaseId": str(option["recoveryCase"]) if option.get("recoveryCase") else None,
        "incidentId": str(option["incident"]) if option.get("incident") else None,
        "shipmentId": str(option["shipment"]) if option.get("shipment") else None,
        "selectedVehicleId": str(option["vehicle"]) if option.get("vehicle") else None,
        "driverId": option.get("driverId"),
        "pickupNode": option.get("pickupNode"),
        "destinationNode": option.get("destinationNode"),
        "candidateType": option.get("pickupCase"),
        "candidateId": option.get("candidateId"),
        "path": list(option.get("recoveryPath") or []),
        "score": option.get("totalScore"),
        "componentScores": option.get("componentScores"),
        "estimatedTime": option.get("estimatedTravelTimeMin"),
        "estimatedDistance": option.get("distanceKm"),
        "estimatedCost": option.get("estimatedCost"),
        "explanation": option.get("explanation"),
        "status": option.get("status"),
        "rank": option.get("rank"),
        "createdAt": (
            option["createdAt"].isoformat()
            if isinstance(option.get("createdAt"), datetime)
            else option.get("createdAt")
        ),
    }


def get_selected_recovery_option(
    db: Database, recovery_case_oid: ObjectId | None
) -> dict[str, Any] | None:
    if recovery_case_oid is None:
        return None
    case = db["recoverycases"].find_one({"_id": recovery_case_oid})
    if case is None:
        return None
    selected_oid = _to_oid(case.get("selectedOption"))
    if selected_oid is None:
        return None
    return db["recoveryoptions"].find_one({"_id": selected_oid})


def selected_option_as_assignment(option: dict[str, Any]) -> dict[str, Any]:
    """Adapt a persisted recoveryoption into the assign_recovery selected shape."""
    path = list(option.get("recoveryPath") or [])
    return {
        "candidateId": option.get("candidateId"),
        "vehicleId": str(option["vehicle"]) if option.get("vehicle") else None,
        "path": path,
        "pickupCase": option.get("pickupCase"),
        "score": option.get("totalScore"),
        "feasible": bool(option.get("isFeasible", True)),
        "estimatedCost": option.get("estimatedCost"),
        "estimatedDistance": option.get("distanceKm"),
        "estimatedTravelTimeMin": option.get("estimatedTravelTimeMin"),
        "explanation": option.get("explanation"),
        "breakdown": option.get("componentScores"),
        "recoveryOptionId": str(option["_id"]),
    }


# ---------------------------------------------------------------------------
# Ensure recovery case
# ---------------------------------------------------------------------------


def ensure_recovery_case(
    db: Database,
    *,
    shipment_oid: ObjectId,
    hub_id: Any,
    incident: dict[str, Any] | None,
    now: datetime | None = None,
) -> ObjectId:
    """Return the recovery case ObjectId for this incident/shipment, creating if needed."""
    now = now or _now()
    if incident and incident.get("recoveryCase"):
        case_oid = _to_oid(incident["recoveryCase"])
        if case_oid and db["recoverycases"].find_one({"_id": case_oid}, {"_id": 1}):
            return case_oid

    # Prefer an open case for this shipment
    existing = db["recoverycases"].find_one(
        {
            "shipment": shipment_oid,
            "status": {
                "$in": ["open", "options_generated", "option_selected", "in_progress"]
            },
        },
        sort=[("detectedAt", -1)],
    )
    if existing:
        case_oid = existing["_id"]
        if incident and not incident.get("recoveryCase"):
            db["incidents"].update_one(
                {"_id": incident["_id"]},
                {"$set": {"recoveryCase": case_oid, "updatedAt": now}},
            )
        return case_oid

    case_oid = ObjectId()
    hub_oid = _to_oid(hub_id)
    db["recoverycases"].insert_one(
        {
            "_id": case_oid,
            "shipment": shipment_oid,
            "detectedAt": now,
            "detectedLocation": hub_oid,
            "reason": "wrong_hub",
            "severity": "high",
            "status": "open",
            "createdAt": now,
            "updatedAt": now,
        }
    )
    if incident:
        db["incidents"].update_one(
            {"_id": incident["_id"]},
            {"$set": {"recoveryCase": case_oid, "updatedAt": now}},
        )
    return case_oid


# ---------------------------------------------------------------------------
# Persist after analysis
# ---------------------------------------------------------------------------


def persist_analysis_plan(
    db: Database,
    *,
    shipment: dict[str, Any],
    analysis: dict[str, Any],
    incident: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """
    Persist the selected recovery plan (and rejected alternatives) for a shipment.

    Returns a serialized recoveryPlan dict when a plan is stored, else None.
    Idempotent for repeated analysis of the same open recovery case.
    """
    now = _now()
    ship_oid = shipment["_id"]
    status = analysis.get("status")
    network = analysis.get("network") or {}
    pickup_node = network.get("actualNode") or network.get("currentNode")
    destination_node = network.get("destinationNode")
    hub_id = shipment.get("currentLocation")

    case_oid = ensure_recovery_case(
        db,
        shipment_oid=ship_oid,
        hub_id=hub_id,
        incident=incident,
        now=now,
    )
    incident_oid = incident["_id"] if incident else None

    if status != "RECOVERY_PLAN_AVAILABLE":
        # Clear any prior selection so assign cannot use a stale plan
        db["recoveryoptions"].update_many(
            {
                "recoveryCase": case_oid,
                "status": {"$in": ["proposed", "selected"]},
            },
            {"$set": {"status": "rejected", "updatedAt": now}},
        )
        db["recoverycases"].update_one(
            {"_id": case_oid},
            {
                "$set": {
                    "selectedOption": None,
                    "status": "open",
                    "updatedAt": now,
                }
            },
        )
        if incident:
            db["incidents"].update_one(
                {"_id": incident["_id"]},
                {
                    "$set": {
                        "analysisStatus": status,
                        "selectedRecoveryOption": None,
                        "updatedAt": now,
                    }
                },
            )
        return None

    selected = analysis.get("selectedRecovery")
    candidates = analysis.get("candidates") or []
    if not selected:
        return None

    # Prefer the full scored candidate (has breakdown/metrics)
    full_selected = next(
        (
            c
            for c in candidates
            if c.get("candidateId") == selected.get("candidateId")
        ),
        None,
    )
    selected_payload = {**(full_selected or {}), **selected, "feasible": True}

    vehicle_oid = _to_oid(selected_payload.get("vehicleId"))
    if vehicle_oid is None:
        return None

    driver_id = selected_payload.get("vehicleNumber") or _vehicle_number(db, vehicle_oid)
    route_oid = _vehicle_route_id(db, vehicle_oid)
    pickup_loc = _loc_by_node(db, selected_payload.get("path", [None])[0] if selected_payload.get("path") else pickup_node)
    if pickup_loc is None:
        pickup_loc = _loc_by_node(db, pickup_node)
    dropoff_loc = _loc_by_node(db, destination_node)

    fp = _fingerprint(
        selected_payload.get("candidateId"),
        str(vehicle_oid),
        selected_payload.get("pickupCase"),
    )

    existing_selected = get_selected_recovery_option(db, case_oid)
    reuse = False
    if existing_selected and existing_selected.get("status") in ("proposed", "selected"):
        existing_fp = _fingerprint(
            existing_selected.get("candidateId"),
            str(existing_selected.get("vehicle") or ""),
            existing_selected.get("pickupCase"),
        )
        reuse = existing_fp == fp

    option_fields = _option_doc_from_candidate(
        recovery_case_oid=case_oid,
        shipment_oid=ship_oid,
        incident_oid=incident_oid,
        candidate=selected_payload,
        shipment=shipment,
        pickup_node=pickup_node,
        destination_node=destination_node,
        rank=1,
        status="selected",
        route_oid=route_oid,
        pickup_loc=pickup_loc,
        dropoff_loc=dropoff_loc,
        driver_id=driver_id,
        now=now,
    )

    if reuse and existing_selected:
        option_oid = existing_selected["_id"]
        update_doc = {k: v for k, v in option_fields.items() if k != "recoveryCase"}
        # Preserve createdAt
        update_doc.pop("createdAt", None)
        db["recoveryoptions"].update_one(
            {"_id": option_oid},
            {"$set": update_doc},
        )
    else:
        # Reject prior proposed/selected for this case (keep completed/executing)
        db["recoveryoptions"].update_many(
            {
                "recoveryCase": case_oid,
                "status": {"$in": ["proposed", "selected"]},
            },
            {"$set": {"status": "rejected", "updatedAt": now}},
        )
        option_fields["createdAt"] = now
        option_oid = ObjectId()
        option_fields["_id"] = option_oid
        db["recoveryoptions"].insert_one(option_fields)

    # Refresh rejected alternatives for audit (replace prior rejected set only)
    db["recoveryoptions"].delete_many(
        {"recoveryCase": case_oid, "status": "rejected"}
    )
    rejected_docs: list[dict[str, Any]] = []
    rank = 2
    for cand in candidates:
        if cand.get("candidateId") == selected_payload.get("candidateId"):
            continue
        v_oid = _to_oid(cand.get("vehicleId"))
        if v_oid is None:
            continue
        path = list(cand.get("path") or [])
        rejected_docs.append(
            {
                "_id": ObjectId(),
                "recoveryCase": case_oid,
                "shipment": ship_oid,
                "vehicle": v_oid,
                "incident": incident_oid,
                "candidateId": cand.get("candidateId"),
                "pickupCase": cand.get("pickupCase"),
                "recoveryPath": path,
                "pickupNode": path[0] if path else pickup_node,
                "destinationNode": path[-1] if path else destination_node,
                "driverId": cand.get("vehicleNumber"),
                "route": None,
                "pickupLocation": None,
                "dropoffLocation": None,
                "estimatedCost": (cand.get("metrics") or {}).get("cost"),
                "estimatedTravelTimeMin": (cand.get("metrics") or {}).get("travelTime"),
                "distanceKm": (cand.get("metrics") or {}).get("distance"),
                "scores": _scores_from_breakdown(cand.get("breakdown")),
                "componentScores": cand.get("breakdown") or cand.get("componentScores"),
                "explanation": cand.get("explanation") or cand.get("rejectionReason"),
                "totalScore": cand.get("score"),
                "rank": rank,
                "isFeasible": bool(cand.get("feasible")),
                "infeasibilityReasons": (
                    [cand["rejectionReason"]] if cand.get("rejectionReason") else []
                ),
                "status": "rejected",
                "createdAt": now,
                "updatedAt": now,
            }
        )
        rank += 1

    if rejected_docs:
        db["recoveryoptions"].insert_many(rejected_docs)

    db["recoverycases"].update_one(
        {"_id": case_oid},
        {
            "$set": {
                "selectedOption": option_oid,
                "status": "options_generated",
                "updatedAt": now,
            }
        },
    )

    if incident:
        db["incidents"].update_one(
            {"_id": incident["_id"]},
            {
                "$set": {
                    "analysisStatus": status,
                    "recoveryCase": case_oid,
                    "selectedRecoveryOption": option_oid,
                    "updatedAt": now,
                }
            },
        )

    stored = db["recoveryoptions"].find_one({"_id": option_oid})
    return serialize_recovery_plan(stored)


def mark_option_status(
    db: Database,
    option_oid: ObjectId | None,
    status: str,
    *,
    case_status: str | None = None,
    case_oid: ObjectId | None = None,
) -> None:
    """Update recovery option (+ optional case) status during assign/pickup/resolve."""
    now = _now()
    if option_oid:
        db["recoveryoptions"].update_one(
            {"_id": option_oid},
            {"$set": {"status": status, "updatedAt": now}},
        )
    if case_oid and case_status:
        update: dict[str, Any] = {"status": case_status, "updatedAt": now}
        if case_status == "resolved":
            update["resolvedAt"] = now
        db["recoverycases"].update_one({"_id": case_oid}, {"$set": update})
