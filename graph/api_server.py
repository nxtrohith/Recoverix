"""
FastAPI server for the SH-205 backend.

Exposes the RecoveryOrchestrator and all logistics data over HTTP.

Endpoints
---------
  GET  /api/health
  GET  /api/hubs
  GET  /api/graph
  GET  /api/vehicles
  GET  /api/vehicles/{vehicle_id}
  GET  /api/shipments
  GET  /api/shipments/{shipment_id}
  GET  /api/recovery/{shipment_id}
  POST /api/recovery/{shipment_id}/calculate
  POST /api/recovery/{shipment_id}/assign
  POST /api/recovery/{shipment_id}/resolve
  POST /api/recovery/analyze/{shipment_id}
  POST /api/recovery/graph/refresh
  POST /api/incidents/simulate
  GET  /api/incidents/active
  GET  /api/incidents/by-shipment/{shipment_id}

Layer:
  FastAPI routes
        ↓
  api_services (data retrieval + serialisation)
        ↓
  graph_cache / shipment_state / vehicle_state
        ↓
  MongoDB / NetworkX
"""

from __future__ import annotations

import argparse
import os
from contextlib import asynccontextmanager
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from graph.api_models import (
    AssignRecoveryRequest,
    ErrorDetail,
    ErrorResponse,
    GraphResponse,
    GraphStatusModel,
    HealthResponse,
    HubListResponse,
    ShipmentDetailResponse,
    ShipmentListResponse,
    SimulateIncidentRequest,
    VehicleDetailResponse,
    VehicleListResponse,
)
from graph.api_services import (
    get_all_hubs,
    get_all_shipments,
    get_all_vehicles,
    get_graph_response,
    get_graph_status,
    get_shipment_detail,
    get_vehicle_detail,
)
from graph.graph_cache import cache_status, get_db, get_graph, refresh_graph
from graph.incident_service import (
    assign_recovery,
    list_active_incidents,
    resolve_recovery,
    simulate_misplaced_incident,
)
from graph.recovery_orchestrator import (
    RecoveryError,
    analyze_shipment_recovery,
)


# ---------------------------------------------------------------------------
# CORS — configurable via CORS_ORIGINS env var (comma-separated origins).
# Default: local development origins.  Set CORS_ORIGINS=* for wildcard.
# ---------------------------------------------------------------------------

_DEFAULT_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
]

_raw_origins = (os.getenv("CORS_ORIGINS") or "").strip()
if _raw_origins == "*":
    _ALLOWED_ORIGINS = ["*"]
elif _raw_origins:
    _ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]
else:
    _ALLOWED_ORIGINS = _DEFAULT_ORIGINS


# ---------------------------------------------------------------------------
# App + lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Warm the in-memory NetworkX graph once at startup."""
    try:
        cached = get_graph()
        print(
            f"Graph ready: {cached.report.node_count} nodes, "
            f"{cached.report.edge_count} edges",
            flush=True,
        )
    except Exception as exc:
        print(f"Warning: graph not ready at startup: {exc}", flush=True)
    yield


app = FastAPI(
    title="SH-205 Logistics API",
    description="Logistics network visualisation and shipment recovery API",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Exception handlers — do not leak stack traces to the frontend
# ---------------------------------------------------------------------------


@app.exception_handler(RecoveryError)
async def recovery_error_handler(
    _request: Request, exc: RecoveryError
) -> JSONResponse:
    return JSONResponse(
        status_code=exc.http_status,
        content={"error": {"code": exc.code, "message": exc.message}},
    )


@app.exception_handler(HTTPException)
async def http_error_handler(
    _request: Request, exc: HTTPException
) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": "HTTP_ERROR", "message": exc.detail}},
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(
    _request: Request, _exc: Exception
) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected server error occurred",
            }
        },
    )


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.get(
    "/health",
    response_model=HealthResponse,
    summary="Service health",
    tags=["health"],
)
@app.get(
    "/api/health",
    response_model=HealthResponse,
    summary="Service health",
    tags=["health"],
)
def health() -> Any:
    """Return service health including MongoDB connectivity and graph status."""
    # MongoDB connectivity check
    db_status = "connected"
    try:
        db = get_db()
        db.command("ping")
    except Exception:
        db_status = "unavailable"

    # Graph status
    graph_status = get_graph_status()

    overall = "ok" if db_status == "connected" and graph_status.loaded else "degraded"

    if db_status != "connected" or not graph_status.loaded:
        return JSONResponse(
            status_code=503,
            content={
                "status": overall,
                "database": db_status,
                "graph": graph_status.model_dump(),
            },
        )

    return HealthResponse(
        status=overall,
        database=db_status,
        graph=graph_status,
    )


# ---------------------------------------------------------------------------
# Hubs
# ---------------------------------------------------------------------------


@app.get(
    "/api/hubs",
    response_model=HubListResponse,
    summary="List all operational hubs / locations",
    tags=["hubs"],
)
def get_hubs() -> HubListResponse:
    """Return all operational locations (warehouses, hubs, DCs)."""
    try:
        db = get_db()
        return get_all_hubs(db)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to retrieve hubs")


# ---------------------------------------------------------------------------
# Graph topology
# ---------------------------------------------------------------------------


@app.get(
    "/api/graph",
    response_model=GraphResponse,
    summary="Telangana logistics network topology",
    tags=["graph"],
)
def get_graph_data() -> GraphResponse:
    """
    Return the full Telangana logistics network for map visualisation.

    Nodes carry latitude/longitude for map rendering.
    Edges carry distance (km) and travel time (minutes).
    """
    try:
        return get_graph_response()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to retrieve graph data")


# ---------------------------------------------------------------------------
# Vehicles
# ---------------------------------------------------------------------------


@app.get(
    "/api/vehicles",
    response_model=VehicleListResponse,
    summary="List all vehicles with operational state",
    tags=["vehicles"],
)
def list_vehicles() -> VehicleListResponse:
    """Return all vehicles with capacity, load, location, and route information."""
    try:
        db = get_db()
        return get_all_vehicles(db)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to retrieve vehicles")


@app.get(
    "/api/vehicles/{vehicle_id}",
    response_model=VehicleDetailResponse,
    summary="Get vehicle detail",
    tags=["vehicles"],
    responses={404: {"model": ErrorResponse}},
)
def get_vehicle(vehicle_id: str) -> VehicleDetailResponse:
    """
    Return full vehicle detail including current location, capacity, and
    the computed NetworkX path to its destination when available.
    """
    try:
        db = get_db()
        vehicle = get_vehicle_detail(db, vehicle_id)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to retrieve vehicle")

    if vehicle is None:
        raise HTTPException(status_code=404, detail=f"Vehicle not found: {vehicle_id}")
    return vehicle


# ---------------------------------------------------------------------------
# Shipments
# ---------------------------------------------------------------------------


@app.get(
    "/api/shipments",
    response_model=ShipmentListResponse,
    summary="List all shipments (dashboard view)",
    tags=["shipments"],
)
def list_shipments() -> ShipmentListResponse:
    """
    Return a lightweight shipment list suitable for an admin dashboard.
    Includes the latest event type/time for each shipment.
    """
    try:
        db = get_db()
        return get_all_shipments(db)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to retrieve shipments")


@app.get(
    "/api/shipments/{shipment_id}",
    response_model=ShipmentDetailResponse,
    summary="Get shipment detail",
    tags=["shipments"],
    responses={404: {"model": ErrorResponse}},
)
def get_shipment(shipment_id: str) -> ShipmentDetailResponse:
    """
    Return full shipment detail including resolved locations, recovery flags,
    and the most recent 20 tracking events.

    ``shipment_id`` may be a MongoDB ObjectId string or a tracking number.
    """
    try:
        db = get_db()
        shipment = get_shipment_detail(db, shipment_id)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to retrieve shipment")

    if shipment is None:
        raise HTTPException(
            status_code=404, detail=f"Shipment not found: {shipment_id}"
        )
    return shipment


# ---------------------------------------------------------------------------
# Recovery  (delegates entirely to RecoveryOrchestrator)
# ---------------------------------------------------------------------------


@app.get(
    "/api/recovery/{shipment_id}",
    summary="Full recovery analysis for a shipment",
    tags=["recovery"],
)
def get_recovery(shipment_id: str) -> dict[str, Any]:
    """
    Run the full recovery pipeline for a shipment.

    Returns the shipment, all candidates with scores, the selected recovery
    plan, estimated distance / time / cost, and a human-readable explanation.
    """
    result = analyze_shipment_recovery(shipment_id)
    _stamp_incident_analysis(shipment_id, result.get("status"))
    return result


@app.post(
    "/api/recovery/{shipment_id}/calculate",
    summary="Calculate recovery options for a shipment",
    tags=["recovery"],
)
def post_calculate_recovery(shipment_id: str) -> dict[str, Any]:
    """Explicit calculate verb — same pipeline as GET /api/recovery/{id}."""
    result = analyze_shipment_recovery(shipment_id)
    _stamp_incident_analysis(shipment_id, result.get("status"))
    return result


def _stamp_incident_analysis(shipment_id: str, analysis_status: str | None) -> None:
    """Persist analysis status onto the active incident for lifecycle display."""
    if not analysis_status:
        return
    try:
        from graph.incident_service import (
            _find_shipment,
            get_active_incident_for_shipment,
        )

        db = get_db()
        shipment = _find_shipment(db, shipment_id)
        if shipment is None:
            return
        incident = get_active_incident_for_shipment(db, shipment["_id"])
        if incident is None:
            return
        from datetime import datetime, timezone

        now = datetime.now(tz=timezone.utc)
        db["incidents"].update_one(
            {"_id": incident["_id"]},
            {"$set": {"analysisStatus": analysis_status, "updatedAt": now}},
        )
        if analysis_status == "RECOVERY_PLAN_AVAILABLE" and incident.get("recoveryCase"):
            db["recoverycases"].update_one(
                {"_id": incident["recoveryCase"]},
                {"$set": {"status": "options_generated", "updatedAt": now}},
            )
    except Exception:
        # Non-fatal — analysis response is still returned
        pass



@app.post(
    "/api/recovery/{shipment_id}/assign",
    summary="Assign a recovery option to a shipment",
    tags=["recovery"],
)
def post_assign_recovery(
    shipment_id: str,
    body: AssignRecoveryRequest | None = None,
) -> dict[str, Any]:
    """
    Validate and assign a recovery candidate, update incident/shipment state,
    and trigger the driver communication integration point.
    """
    payload = body or AssignRecoveryRequest()
    db = get_db()
    return assign_recovery(
        db,
        shipment_id,
        candidate_id=payload.candidateId,
        vehicle_id=payload.vehicleId,
        path=payload.path,
        pickup_case=payload.pickupCase,
    )


@app.post(
    "/api/recovery/{shipment_id}/resolve",
    summary="Mark shipment recovery as completed",
    tags=["recovery"],
)
def post_resolve_recovery(shipment_id: str) -> dict[str, Any]:
    """Set shipment → recovered and incident → RESOLVED."""
    db = get_db()
    return resolve_recovery(db, shipment_id)


@app.post(
    "/api/recovery/analyze/{shipment_id}",
    summary="Explicitly trigger recovery analysis",
    tags=["recovery"],
)
def post_analyze_recovery(shipment_id: str) -> dict[str, Any]:
    """Same as GET /api/recovery/{shipment_id} — explicit POST verb for frontend clients."""
    return analyze_shipment_recovery(shipment_id)


@app.post(
    "/api/recovery/graph/refresh",
    summary="Rebuild the in-memory NetworkX graph from MongoDB",
    tags=["recovery"],
)
def post_refresh_graph() -> Any:
    """Force a full rebuild of the logistics graph from telangana_nodes/edges."""
    try:
        cached = refresh_graph()
    except Exception:
        return JSONResponse(
            status_code=503,
            content={
                "error": {
                    "code": "GRAPH_REFRESH_FAILED",
                    "message": "Failed to refresh logistics graph",
                }
            },
        )
    return {
        "status": "refreshed",
        "graph": {
            "nodeCount": cached.report.node_count,
            "edgeCount": cached.report.edge_count,
            "skippedEdges": cached.report.skipped_edges,
        },
    }


# ---------------------------------------------------------------------------
# Incidents
# ---------------------------------------------------------------------------


@app.post(
    "/api/incidents/simulate",
    summary="Simulate a misplaced-shipment incident",
    tags=["incidents"],
)
def post_simulate_incident(body: SimulateIncidentRequest) -> dict[str, Any]:
    """
    Mark an existing shipment as misplaced, record an incident, and trigger
    the recovery engine. Does not create fake shipment records.
    """
    db = get_db()
    return simulate_misplaced_incident(
        db,
        body.shipment_id,
        auto_analyze=body.auto_analyze,
    )


@app.get(
    "/api/incidents/active",
    summary="List active (unresolved) incidents",
    tags=["incidents"],
)
def get_active_incidents() -> dict[str, Any]:
    """Return open / recovery-required / assigned incidents for the dashboard."""
    db = get_db()
    return list_active_incidents(db)


@app.get(
    "/api/incidents/by-shipment/{shipment_id}",
    summary="Get latest incident for a shipment",
    tags=["incidents"],
)
def get_incident_by_shipment(shipment_id: str) -> dict[str, Any]:
    from graph.incident_service import (
        _find_shipment,
        _lifecycle_status,
        get_latest_incident_for_shipment,
        serialize_incident,
    )

    db = get_db()
    shipment = _find_shipment(db, shipment_id)
    if shipment is None:
        raise HTTPException(status_code=404, detail=f"Shipment not found: {shipment_id}")
    incident = get_latest_incident_for_shipment(db, shipment["_id"])
    if incident is None:
        raise HTTPException(
            status_code=404,
            detail=f"No incident for shipment: {shipment_id}",
        )
    payload = serialize_incident(db, incident)
    payload["lifecycleStatus"] = _lifecycle_status(
        shipment.get("status", ""), incident
    )
    return {"incident": payload}


# ---------------------------------------------------------------------------
# Server entry point
# ---------------------------------------------------------------------------


def serve(host: str = "127.0.0.1", port: int = 5055) -> None:
    print(f"SH-205 API (FastAPI) listening on http://{host}:{port}", flush=True)
    print("  GET  /api/health", flush=True)
    print("  GET  /api/hubs", flush=True)
    print("  GET  /api/graph", flush=True)
    print("  GET  /api/vehicles", flush=True)
    print("  GET  /api/vehicles/{vehicle_id}", flush=True)
    print("  GET  /api/shipments", flush=True)
    print("  GET  /api/shipments/{shipment_id}", flush=True)
    print("  GET  /api/recovery/{shipment_id}", flush=True)
    print("  POST /api/recovery/{shipment_id}/calculate", flush=True)
    print("  POST /api/recovery/{shipment_id}/assign", flush=True)
    print("  POST /api/recovery/{shipment_id}/resolve", flush=True)
    print("  POST /api/incidents/simulate", flush=True)
    print("  GET  /api/incidents/active", flush=True)
    print("  POST /api/recovery/analyze/{shipment_id}", flush=True)
    print("  POST /api/recovery/graph/refresh", flush=True)
    print("  docs /docs", flush=True)
    uvicorn.run(
        "graph.api_server:app",
        host=host,
        port=port,
        log_level="info",
    )


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="SH-205 Logistics API (FastAPI)")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5055)
    args = parser.parse_args(argv)
    serve(host=args.host, port=args.port)


if __name__ == "__main__":
    main()
