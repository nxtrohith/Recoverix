"""
Recovery Orchestrator — end-to-end Recoverix recovery pipeline.

Coordinates existing modules without owning graph algorithms or scoring:

  shipment → state → graph → vehicles → candidates → feasibility → score → plan

Public entry point: ``analyze_shipment_recovery(shipment_id)``.
Each step contributes to ``explanationTrace`` (code + optional TypeSafe Jev).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from graph.analysis_cache import (
    get_cached_analysis,
    invalidate_analysis_cache,
    put_cached_analysis,
)
from graph.candidate_generator import generate_candidates_with_audit
from graph.graph_cache import get_db, get_graph, refresh_graph
from graph.recovery_context import (
    get_recovery_context,
    get_recovery_context_from_state,
)
from graph.recovery_persistence import persist_analysis_plan
from graph.recovery_scorer import (
    load_route_baselines,
    score_recovery_candidates,
)
from graph.services.recovery_xai import (
    apply_jev_selection,
    assemble_analysis_trace,
    build_context_step,
    build_feasibility_step,
    build_generate_step,
    build_score_step,
)
from graph.shipment_state import ShipmentState, get_shipment_state
from bson import ObjectId


# ---------------------------------------------------------------------------
# Errors (mapped to HTTP by the API layer)
# ---------------------------------------------------------------------------

class RecoveryError(Exception):
    """Base orchestrator error with a stable machine-readable code."""

    def __init__(self, code: str, message: str, *, http_status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status


class ShipmentNotFoundError(RecoveryError):
    def __init__(self, shipment_id: str):
        super().__init__(
            "SHIPMENT_NOT_FOUND",
            f"Shipment not found: {shipment_id}",
            http_status=404,
        )


class InvalidShipmentLocationError(RecoveryError):
    def __init__(self, detail: str):
        super().__init__(
            "INVALID_SHIPMENT_LOCATION",
            detail,
            http_status=400,
        )


class InvalidDestinationError(RecoveryError):
    def __init__(self, detail: str):
        super().__init__(
            "INVALID_DESTINATION",
            detail,
            http_status=400,
        )


class GraphConstructionError(RecoveryError):
    def __init__(self, detail: str):
        super().__init__(
            "GRAPH_CONSTRUCTION_FAILED",
            detail,
            http_status=503,
        )


class NodeNotInGraphError(RecoveryError):
    def __init__(self, which: str, node: str):
        super().__init__(
            "NODE_NOT_IN_GRAPH",
            f"{which} '{node}' is not present in the logistics graph",
            http_status=400,
        )


# ---------------------------------------------------------------------------
# Response helpers
# ---------------------------------------------------------------------------

def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _estimated_arrival(travel_min: float | None) -> str | None:
    if travel_min is None:
        return None
    return _iso(datetime.now(tz=timezone.utc) + timedelta(minutes=travel_min))


def _path_segment_fields(scored: Any) -> dict[str, list[str]]:
    """Pass through generator path segments (never invent routes here)."""
    return {
        "existingRouteNodes": list(getattr(scored, "existing_route_nodes", None) or []),
        "vehicleToPickupPath": list(
            getattr(scored, "vehicle_to_pickup_path", None) or []
        ),
        "vehicleToDestinationPath": list(
            getattr(scored, "vehicle_to_destination_path", None) or []
        ),
    }


def _candidate_payload(scored: Any) -> dict[str, Any]:
    """Adapt ScoredCandidate.to_dict() into the orchestrator response shape."""
    raw = scored.to_dict()
    metrics = raw.get("metrics") or {}
    return {
        "candidateId": raw["candidateId"],
        "vehicleId": raw["vehicleId"],
        "vehicleNumber": raw.get("vehicleNumber"),
        "pickupCase": raw.get("pickupCase"),
        "path": raw.get("path") or [],
        "existingRouteNodes": raw.get("existingRouteNodes") or [],
        "vehicleToPickupPath": raw.get("vehicleToPickupPath") or [],
        "vehicleToDestinationPath": raw.get("vehicleToDestinationPath") or [],
        "feasible": raw["feasible"],
        "rejectionReason": raw.get("rejectionReason"),
        "score": raw.get("score"),
        "metrics": metrics or None,
        "breakdown": raw.get("breakdown"),
        "explanation": raw.get("explanation"),
        "factorsHelped": raw.get("factorsHelped") or [],
        "factorsHurt": raw.get("factorsHurt") or [],
    }


def _selected_payload(scored: Any) -> dict[str, Any] | None:
    if scored is None or not scored.feasible:
        return None
    m = scored.metrics
    raw = scored.to_dict() if hasattr(scored, "to_dict") else {}
    component_scores = raw.get("componentScores") or raw.get("breakdown")
    return {
        "candidateId": scored.candidate_id,
        "vehicleId": scored.vehicle_id,
        "vehicleNumber": scored.vehicle_number,
        "pickupCase": scored.pickup_case,
        "path": list(scored.path),
        **_path_segment_fields(scored),
        "estimatedArrival": _estimated_arrival(
            m.travel_time_min if m else None
        ),
        "estimatedCost": m.cost if m else None,
        "estimatedDistance": m.distance_km if m else None,
        "estimatedTravelTimeMin": m.travel_time_min if m else None,
        "score": scored.score,
        "componentScores": component_scores,
        "breakdown": component_scores,
        "explanation": scored.explanation,
    }


def _rejection_reasons(candidates: list[Any]) -> list[str]:
    """Deduplicated human-readable reasons when no feasible option exists."""
    reasons: list[str] = []
    seen: set[str] = set()
    for c in candidates:
        reason = c.rejection_reason
        if reason and reason not in seen:
            seen.add(reason)
            reasons.append(reason)
    return reasons


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

@dataclass
class RecoveryOrchestrator:
    """
    Coordinates the recovery pipeline. Holds no graph algorithms or formulas.

    Graph is loaded via ``graph.graph_cache`` so repeated analyses reuse the
    same in-memory NetworkX DiGraph.
    """

    auto_refresh_graph: bool = False

    def analyze_shipment_recovery(
        self,
        shipment_id: str,
        *,
        force: bool = False,
    ) -> dict[str, Any]:
        """
        Run the full recovery pipeline for a shipment.

        Parameters
        ----------
        shipment_id :
            MongoDB ObjectId string or trackingNumber.
        force :
            When True, skip the demo analysis cache and recompute.

        Returns
        -------
        dict
            Structured recovery analysis (see module docstring / ARCHITECTURE).

        Raises
        ------
        RecoveryError
            Validation / data errors with ``code`` + ``http_status``.
        """
        identifier = (shipment_id or "").strip()
        if not identifier:
            raise RecoveryError(
                "INVALID_SHIPMENT_ID",
                "Shipment ID is required",
                http_status=400,
            )

        if not force:
            cached = get_cached_analysis(identifier)
            if cached is not None:
                return cached

        db = get_db()

        # 1–2. Validate + load shipment
        shipment = get_shipment_state(db, identifier)
        if shipment is None:
            raise ShipmentNotFoundError(identifier)

        if force:
            invalidate_analysis_cache(identifier)
            invalidate_analysis_cache(shipment.shipment_id)
            invalidate_analysis_cache(shipment.tracking_number)

        return self._run_pipeline(shipment, identifier=identifier)

    def analyze_from_state(
        self, shipment: ShipmentState
    ) -> dict[str, Any]:
        """
        Run the pipeline for an already-loaded (or in-memory mock) shipment.

        Does not write to MongoDB. Used by local demos when shipments are empty.
        """
        return self._run_pipeline(shipment, identifier=None)

    def _run_pipeline(
        self,
        shipment: ShipmentState,
        *,
        identifier: str | None,
    ) -> dict[str, Any]:
        # 3–4. Actual (pickup) location / destination — never use expectedNode
        pickup_node = shipment.actual_node or shipment.current_node
        if not pickup_node:
            raise InvalidShipmentLocationError(
                "Shipment has no valid actual/current location "
                "(missing currentLocation or graphNodeKey)"
            )
        if not shipment.destination_node:
            raise InvalidDestinationError(
                "Shipment has no valid destination "
                "(missing destination or graphNodeKey)"
            )

        # 5. Load / build NetworkX graph (cached)
        try:
            cached = (
                refresh_graph()
                if self.auto_refresh_graph
                else get_graph()
            )
        except RuntimeError as exc:
            raise GraphConstructionError(str(exc)) from exc

        G = cached.graph
        db = get_db()

        if pickup_node not in G:
            raise NodeNotInGraphError(
                "Shipment actual/recovery location", pickup_node
            )
        if shipment.destination_node not in G:
            raise NodeNotInGraphError(
                "Shipment destination", shipment.destination_node
            )

        # 6. Recovery context (vehicles + routes + graph facts)
        if identifier is not None:
            context = get_recovery_context(db, G, identifier)
            if context is None:
                raise ShipmentNotFoundError(identifier)
        else:
            context = get_recovery_context_from_state(db, G, shipment)

        context_step = build_context_step(
            active_count=context.active_vehicle_count,
            relevant_count=len(context.relevant_vehicles),
            excluded=list(context.excluded_vehicles),
            graph_nodes=cached.report.node_count,
            graph_edges=cached.report.edge_count,
        )

        # 7–9. Candidates → feasibility → scoring (+ Jev select)
        generation = generate_candidates_with_audit(G, context)
        candidates = generation.candidates
        generate_step = build_generate_step(
            candidate_count=len(candidates),
            skips=list(generation.skips),
        )

        baselines = load_route_baselines(
            db, [c.vehicle_id for c in candidates]
        )
        scoring = score_recovery_candidates(
            G,
            candidates,
            route_baselines=baselines,
        )

        feasibility_step = build_feasibility_step(scoring.candidates)
        feasible = [c for c in scoring.candidates if c.feasible]

        score_step = build_score_step(
            weights=dict(scoring.weights),
            feasible_count=len(feasible),
            selected=scoring.selected_option,
        )

        shipment_summary = {
            "id": shipment.shipment_id,
            "trackingNumber": shipment.tracking_number,
            "priority": shipment.priority,
            "actualHub": shipment.current_location_name,
            "expectedHub": shipment.expected_location_name,
            "destination": shipment.destination_name,
            "weight": shipment.weight,
            "volume": shipment.volume,
            "deadline": _iso(shipment.deadline),
        }
        selected, select_step = apply_jev_selection(
            scoring,
            shipment_summary=shipment_summary,
        )

        # Application-level outcomes (HTTP 200)
        reasons: list[str] = []
        if not context.relevant_vehicles:
            status = "NO_FEASIBLE_RECOVERY"
            reasons.append(
                "No available vehicles with capacity and known location"
            )
        elif not candidates:
            status = "NO_FEASIBLE_RECOVERY"
            reasons.append("No candidate recovery routes were generated")
        elif selected is None:
            status = "NO_FEASIBLE_RECOVERY"
            reasons = _rejection_reasons(scoring.candidates)
            if not reasons:
                reasons.append("All candidates were infeasible")
        else:
            status = "RECOVERY_PLAN_AVAILABLE"

        explanation_trace = assemble_analysis_trace(
            context_step=context_step,
            generate_step=generate_step,
            feasibility_step=feasibility_step,
            score_step=score_step,
            select_step=select_step,
        )

        result: dict[str, Any] = {
            "shipment": {
                "id": shipment.shipment_id,
                "trackingNumber": shipment.tracking_number,
                "status": shipment.status,
                "currentLocation": shipment.current_location_name,
                "expectedLocation": shipment.expected_location_name,
                "actualLocation": shipment.current_location_name,
                "destination": shipment.destination_name,
                "priority": shipment.priority,
                "deadline": _iso(shipment.deadline),
                "weight": shipment.weight,
                "volume": shipment.volume,
                "needsRecovery": shipment.needs_recovery,
                "isMisplaced": shipment.is_misplaced,
                "expectedFromRoute": shipment.expected_from_route,
            },
            "network": {
                # Pickup / recovery node = actual (last-confirmed) hub
                "currentNode": shipment.current_node,
                "actualNode": shipment.actual_node,
                "expectedNode": shipment.expected_node,
                "plannedRoute": list(shipment.planned_route_nodes),
                "destinationNode": shipment.destination_node,
                "candidateCount": len(scoring.candidates),
                "feasibleCount": len(feasible),
                "vehicleCount": len(context.relevant_vehicles),
                "directPathExists": context.graph_context.direct_path_exists,
                "graphNodes": cached.report.node_count,
                "graphEdges": cached.report.edge_count,
            },
            "scoringConfig": {
                "weights": dict(scoring.weights),
            },
            "candidates": [_candidate_payload(c) for c in scoring.candidates],
            "selectedRecovery": _selected_payload(selected),
            "selectionExplanation": scoring.selection_explanation,
            "reasons": reasons,
            "status": status,
            "explanationTrace": explanation_trace,
            "recoveryPlan": None,
        }

        # Persist selected plan when analyzing a real shipment (not mock demos)
        if identifier is not None:
            result["recoveryPlan"] = self._persist_plan(
                db, shipment, result
            )
            put_cached_analysis(result, identifier=identifier)

        return result

    def _persist_plan(
        self,
        db: Any,
        shipment: ShipmentState,
        result: dict[str, Any],
    ) -> dict[str, Any] | None:
        """Write selected recovery plan to recoverycases / recoveryoptions."""
        ship_oid: ObjectId | None = None
        try:
            ship_oid = ObjectId(shipment.shipment_id)
        except Exception:
            ship_doc = db["shipments"].find_one(
                {"trackingNumber": shipment.tracking_number}
            )
            if ship_doc:
                ship_oid = ship_doc["_id"]
        if ship_oid is None:
            return None

        ship_doc = db["shipments"].find_one({"_id": ship_oid}) or {
            "_id": ship_oid,
            "weight": shipment.weight,
            "volume": shipment.volume,
            "currentLocation": None,
        }
        # Inline lookup avoids circular import with incident_service
        incident = db["incidents"].find_one(
            {
                "shipment": ship_oid,
                "status": {
                    "$in": [
                        "OPEN",
                        "RECOVERY_REQUIRED",
                        "ASSIGNED",
                        "PICKUP_CONFIRMED",
                    ]
                },
            },
            sort=[("createdAt", -1)],
        )
        try:
            plan = persist_analysis_plan(
                db,
                shipment=ship_doc,
                analysis=result,
                incident=incident,
            )
        except Exception:
            # Non-fatal — analysis response is still returned
            return None

        if plan and result.get("selectedRecovery"):
            result["selectedRecovery"]["recoveryOptionId"] = plan.get("id")
            result["selectedRecovery"]["recoveryPlanStatus"] = plan.get("status")
        return plan


# Module-level singleton for demos / API
_default_orchestrator = RecoveryOrchestrator()


def analyze_shipment_recovery(
    shipment_id: str,
    *,
    force: bool = False,
) -> dict[str, Any]:
    """Convenience wrapper around ``RecoveryOrchestrator.analyze_shipment_recovery``."""
    return _default_orchestrator.analyze_shipment_recovery(
        shipment_id, force=force
    )


def print_recovery_summary(result: dict[str, Any]) -> None:
    """Readable console summary for local demos."""
    ship = result["shipment"]
    net = result["network"]
    selected = result.get("selectedRecovery")
    feasible = [c for c in result["candidates"] if c.get("feasible")]

    print("\n" + "=" * 62)
    print("  RECOVERY ANALYSIS")
    print("=" * 62)
    print(f"  Status           : {result['status']}")
    print(f"  Shipment         : {ship['id']} ({ship.get('trackingNumber')})")
    print(f"  Shipment status  : {ship['status']}  priority={ship['priority']}")
    print(f"  Expected hub     : {ship.get('expectedLocation')} [{net.get('expectedNode')}]")
    print(f"  Actual hub       : {ship.get('actualLocation')} [{net.get('actualNode')}]")
    print(f"  Recovery pickup  : {ship['currentLocation']} [{net['currentNode']}]")
    print(f"  Destination      : {ship['destination']} [{net['destinationNode']}]")
    planned = net.get("plannedRoute") or []
    if planned:
        print(f"  Planned route    : {' → '.join(planned)}")
    print(f"  Deadline         : {ship.get('deadline')}")
    print(f"  Candidates       : {net['candidateCount']} "
          f"({net['feasibleCount']} feasible)")

    if result.get("reasons"):
        print("  Reasons:")
        for r in result["reasons"]:
            print(f"    • {r}")

    trace = result.get("explanationTrace") or []
    if trace:
        print("\n  ── Explanation trace ──")
        for step in trace:
            print(
                f"  [{step.get('outcome')}] {step.get('title')}: "
                f"{step.get('summary')}"
            )

    if selected is None:
        print("\n  Selected recovery: (none)")
        if result.get("selectionExplanation"):
            print(f"  {result['selectionExplanation']}")
        return

    print("\n  ── Selected recovery ──")
    print(f"  Vehicle          : {selected.get('vehicleNumber')} "
          f"({selected['vehicleId']})")
    print(f"  Candidate        : {selected['candidateId']}")
    path = selected.get("path") or []
    if len(path) <= 8:
        print(f"  Path             : {' → '.join(path)}")
    elif path:
        print(
            f"  Path             : {' → '.join(path[:3])} → … → "
            f"{' → '.join(path[-2:])}  ({len(path) - 1} hops)"
        )
    dist = selected.get("estimatedDistance")
    time_min = selected.get("estimatedTravelTimeMin")
    cost = selected.get("estimatedCost")
    print(f"  Distance         : {dist:.1f} km" if dist is not None else "  Distance         : N/A")
    if time_min is not None:
        h, m = divmod(int(round(time_min)), 60)
        print(f"  Travel time      : {h}h {m}m" if h else f"  Travel time      : {m}m")
    else:
        print("  Travel time      : N/A")
    print(f"  Cost             : ≈{cost:.0f} INR" if cost is not None else "  Cost             : N/A")
    print(f"  Score            : {selected.get('score')}")
    print(f"  ETA              : {selected.get('estimatedArrival')}")
    print(f"  Reason           : {selected.get('explanation')}")
    print(f"\n  Feasible options listed: {len(feasible)}")
