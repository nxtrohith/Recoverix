"""
Service layer for the SH-205 REST API.

Each function encapsulates a MongoDB query + lightweight transformation.
No business logic lives here — only data retrieval and serialisation helpers.

Performance note: collection-level endpoints (vehicles, shipments) pre-load
all referenced locations and routes in a single batch query to avoid N+1
round-trips to MongoDB Atlas.

Layer:  FastAPI routes → api_services → graph_cache / shipment_state / vehicle_state
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import networkx as nx
from bson import ObjectId
from pymongo.database import Database

from graph.api_models import (
    CapacityModel,
    CoordinatesModel,
    GraphEdgeModel,
    GraphNodeModel,
    GraphResponse,
    GraphStatusModel,
    HubListResponse,
    HubResponse,
    ShipmentDetailResponse,
    ShipmentEventModel,
    ShipmentListItem,
    ShipmentListResponse,
    VehicleDetailResponse,
    VehicleListItem,
    VehicleListResponse,
)
from graph.graph_cache import cache_status, get_db, get_graph
from graph.incident_service import (
    _lifecycle_status,
    get_active_incident_for_shipment,
    get_latest_incident_for_shipment,
    serialize_incident,
)
from graph.shipment_state import MISPLACED_STATUSES, DELAYED_STATUSES


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _iso(dt: datetime | None) -> str | None:
    """Convert datetime → ISO-8601 string (UTC-aware). None-safe."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _to_oid(value: Any) -> ObjectId | None:
    """Convert ObjectId or string → ObjectId. Returns None on failure."""
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return value
    try:
        return ObjectId(value)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Batch loaders — single round-trip for a set of IDs
# ---------------------------------------------------------------------------


def _load_locations_map(db: Database, ids: list[Any]) -> dict[str, dict[str, Any]]:
    """
    Return a dict keyed by str(ObjectId) → location document.
    Fetches all requested IDs in one query.
    """
    oids = [o for o in (_to_oid(i) for i in ids) if o is not None]
    if not oids:
        return {}
    docs = db["locations"].find(
        {"_id": {"$in": oids}}, {"name": 1, "graphNodeKey": 1, "coordinates": 1}
    )
    return {str(doc["_id"]): doc for doc in docs}


def _load_routes_map(db: Database, ids: list[Any]) -> dict[str, dict[str, Any]]:
    """Return a dict keyed by str(ObjectId) → route document (minimal fields)."""
    oids = [o for o in (_to_oid(i) for i in ids) if o is not None]
    if not oids:
        return {}
    docs = db["routes"].find({"_id": {"$in": oids}}, {"destination": 1})
    return {str(doc["_id"]): doc for doc in docs}


def _loc_info(
    locs: dict[str, dict], location_id: Any
) -> tuple[str | None, str | None, str | None]:
    """
    Look up (name, graphNodeKey, id_str) from a pre-loaded locations map.
    Tolerates None / missing entries.
    """
    oid = _to_oid(location_id)
    if oid is None:
        return None, None, None
    doc = locs.get(str(oid))
    if doc is None:
        return None, None, str(oid)
    return doc.get("name"), doc.get("graphNodeKey"), str(oid)


# ---------------------------------------------------------------------------
# Hub service
# ---------------------------------------------------------------------------


def get_all_hubs(db: Database) -> HubListResponse:
    """Return all operational locations from the `locations` collection."""
    docs = list(db["locations"].find({}))
    hubs: list[HubResponse] = []
    for doc in docs:
        coords_doc = doc.get("coordinates") or {}
        lat = coords_doc.get("latitude") or coords_doc.get("lat")
        lon = (
            coords_doc.get("longitude")
            or coords_doc.get("lng")
            or coords_doc.get("lon")
        )
        hubs.append(
            HubResponse(
                id=str(doc["_id"]),
                name=doc.get("name", ""),
                code=doc.get("code", ""),
                type=doc.get("type", ""),
                city=doc.get("city", ""),
                address=doc.get("address", ""),
                graphNodeKey=doc.get("graphNodeKey"),
                coordinates=CoordinatesModel(latitude=lat, longitude=lon)
                if (lat is not None or lon is not None)
                else None,
            )
        )
    return HubListResponse(count=len(hubs), hubs=hubs)


# ---------------------------------------------------------------------------
# Graph service
# ---------------------------------------------------------------------------


def get_graph_response() -> GraphResponse:
    """
    Serialise the cached NetworkX DiGraph into a frontend-friendly payload.
    Uses the in-memory graph; never reads MongoDB directly.
    """
    cached = get_graph()
    G: nx.DiGraph = cached.graph

    nodes: list[GraphNodeModel] = [
        GraphNodeModel(
            id=node_id,
            name=attrs.get("hub_name") or node_id,
            type=attrs.get("hub_type", ""),
            district=attrs.get("city", ""),
            latitude=attrs.get("latitude"),
            longitude=attrs.get("longitude"),
        )
        for node_id, attrs in G.nodes(data=True)
    ]

    edges: list[GraphEdgeModel] = [
        GraphEdgeModel(
            source=src,
            target=dst,
            distance=attrs.get("avg_distance_km"),
            travelTime=attrs.get("avg_time_min"),
            routeId=attrs.get("_id", ""),
        )
        for src, dst, attrs in G.edges(data=True)
    ]

    return GraphResponse(nodes=nodes, edges=edges)


def get_graph_status() -> GraphStatusModel:
    status = cache_status()
    return GraphStatusModel(
        loaded=status.get("loaded", False),
        nodeCount=status.get("nodeCount", 0),
        edgeCount=status.get("edgeCount", 0),
        skippedEdges=status.get("skippedEdges"),
        warningCount=status.get("warningCount"),
    )


# ---------------------------------------------------------------------------
# Vehicle service
# ---------------------------------------------------------------------------


def _build_vehicle_item(
    doc: dict[str, Any],
    locs: dict[str, dict],
    routes: dict[str, dict],
    locs_by_node: dict[str, dict],
) -> VehicleListItem:
    """Build a VehicleListItem from pre-loaded maps (no DB calls)."""
    cap = doc.get("capacity") or {}
    load = doc.get("currentLoad") or {}
    cap_w = float(cap.get("weight") or 0)
    cap_v = float(cap.get("volume") or 0)
    load_w = float(load.get("weight") or 0)
    load_v = float(load.get("volume") or 0)

    curr_name, curr_node, curr_loc_id = _loc_info(locs, doc.get("currentLocation"))

    # Route → destination node
    route_id_str: str | None = None
    dest_node: str | None = None
    dest_name: str | None = None
    route_raw = doc.get("currentRoute")
    if route_raw is not None:
        route_id_str = str(_to_oid(route_raw)) if _to_oid(route_raw) else str(route_raw)
        route_doc = routes.get(route_id_str)
        if route_doc:
            _, dest_node, _ = _loc_info(locs, route_doc.get("destination"))
            if dest_node:
                dest_loc_doc = locs_by_node.get(dest_node)
                if dest_loc_doc:
                    dest_name = dest_loc_doc.get("name")

    return VehicleListItem(
        id=str(doc["_id"]),
        vehicleNumber=doc.get("vehicleNumber", ""),
        type=doc.get("type", ""),
        status=doc.get("status", ""),
        currentLocationName=curr_name,
        currentNode=curr_node,
        capacity=CapacityModel(weight=cap_w, volume=cap_v),
        currentLoad=CapacityModel(weight=load_w, volume=load_v),
        availableWeight=max(0.0, cap_w - load_w),
        availableVolume=max(0.0, cap_v - load_v),
        currentRouteId=route_id_str,
        destination=dest_name,
        destinationNode=dest_node,
    )


def _get_locs_by_node(db: Database) -> dict[str, dict]:
    """Index all locations by graphNodeKey for fast reverse lookup."""
    docs = db["locations"].find(
        {"graphNodeKey": {"$ne": None}}, {"name": 1, "graphNodeKey": 1}
    )
    return {doc["graphNodeKey"]: doc for doc in docs if doc.get("graphNodeKey")}


def get_all_vehicles(db: Database) -> VehicleListResponse:
    """
    Return all vehicles regardless of status.
    Uses batched location + route lookups — 3 MongoDB round-trips total.
    """
    docs = list(db["vehicles"].find({}))
    if not docs:
        return VehicleListResponse(count=0, vehicles=[])

    # Batch-load all referenced locations (2 round-trips: locations + routes)
    loc_ids = set()
    route_ids = set()
    for doc in docs:
        if doc.get("currentLocation"):
            loc_ids.add(doc["currentLocation"])
        if doc.get("currentRoute"):
            route_ids.add(doc["currentRoute"])

    locs = _load_locations_map(db, list(loc_ids))
    routes = _load_routes_map(db, list(route_ids))

    # Also need destination locations (referenced from routes)
    dest_loc_ids = set()
    for rdoc in routes.values():
        if rdoc.get("destination"):
            dest_loc_ids.add(rdoc["destination"])
    dest_locs = _load_locations_map(db, list(dest_loc_ids))
    locs.update(dest_locs)

    locs_by_node = _get_locs_by_node(db)

    vehicles = [_build_vehicle_item(doc, locs, routes, locs_by_node) for doc in docs]
    return VehicleListResponse(count=len(vehicles), vehicles=vehicles)


def get_vehicle_detail(db: Database, vehicle_id: str) -> VehicleDetailResponse | None:
    """
    Return full vehicle detail.  Computes the shortest NetworkX path from
    current node to destination when both are present in the graph.
    """
    oid = _to_oid(vehicle_id)
    if oid is None:
        return None

    doc = db["vehicles"].find_one({"_id": oid})
    if doc is None:
        return None

    # Per-document batch loads
    loc_ids: list[Any] = []
    for field in ("currentLocation",):
        if doc.get(field):
            loc_ids.append(doc[field])
    route_ids: list[Any] = []
    if doc.get("currentRoute"):
        route_ids.append(doc["currentRoute"])

    locs = _load_locations_map(db, loc_ids)
    routes = _load_routes_map(db, route_ids)

    if routes:
        dest_loc_ids = [r.get("destination") for r in routes.values() if r.get("destination")]
        locs.update(_load_locations_map(db, dest_loc_ids))

    locs_by_node = _get_locs_by_node(db)
    base = _build_vehicle_item(doc, locs, routes, locs_by_node)

    _, _, curr_loc_id = _loc_info(locs, doc.get("currentLocation"))

    # Compute NetworkX path when both endpoints are known
    current_path: list[str] | None = None
    if base.currentNode and base.destinationNode:
        try:
            cached = get_graph()
            G: nx.DiGraph = cached.graph
            if base.currentNode in G and base.destinationNode in G:
                current_path = nx.shortest_path(
                    G,
                    source=base.currentNode,
                    target=base.destinationNode,
                    weight="avg_distance_km",
                )
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            current_path = None
        except Exception:
            current_path = None

    return VehicleDetailResponse(
        **base.model_dump(),
        currentLocationId=curr_loc_id,
        vehicleType=doc.get("type", ""),
        currentPath=current_path,
        createdAt=_iso(doc.get("createdAt")),
        updatedAt=_iso(doc.get("updatedAt")),
    )


# ---------------------------------------------------------------------------
# Shipment service
# ---------------------------------------------------------------------------


def get_all_shipments(db: Database) -> ShipmentListResponse:
    """
    Return lightweight shipment list for the admin dashboard.
    Uses batch location lookups; one event query per shipment (unavoidable).
    """
    docs = list(db["shipments"].find({}))
    if not docs:
        return ShipmentListResponse(count=0, shipments=[])

    # Batch-load all referenced locations
    loc_ids: set[Any] = set()
    for doc in docs:
        for field in ("origin", "destination", "currentLocation"):
            if doc.get(field):
                loc_ids.add(doc[field])
    locs = _load_locations_map(db, list(loc_ids))

    # Batch latest events via aggregation ($group by shipment, max timestamp)
    ship_oids = [doc["_id"] for doc in docs]
    latest_events: dict[str, dict] = {}
    pipeline = [
        {"$match": {"shipment": {"$in": ship_oids}}},
        {"$sort": {"timestamp": -1}},
        {"$group": {
            "_id": "$shipment",
            "type": {"$first": "$type"},
            "timestamp": {"$first": "$timestamp"},
        }},
    ]
    for ev in db["shipmentevents"].aggregate(pipeline):
        latest_events[str(ev["_id"])] = ev

    items: list[ShipmentListItem] = []
    for doc in docs:
        ship_oid = doc["_id"]
        origin_name, _, _ = _loc_info(locs, doc.get("origin"))
        dest_name, _, _ = _loc_info(locs, doc.get("destination"))
        curr_name, _, _ = _loc_info(locs, doc.get("currentLocation"))

        ev = latest_events.get(str(ship_oid))
        items.append(
            ShipmentListItem(
                id=str(ship_oid),
                trackingNumber=doc.get("trackingNumber", ""),
                origin=origin_name,
                destination=dest_name,
                currentLocation=curr_name,
                status=doc.get("status", ""),
                priority=doc.get("priority", ""),
                deadline=_iso(doc.get("deadline")),
                weight=float(doc.get("weight") or 0),
                latestEventType=ev.get("type") if ev else None,
                latestEventTime=_iso(ev.get("timestamp")) if ev else None,
            )
        )
    return ShipmentListResponse(count=len(items), shipments=items)


def get_shipment_detail(db: Database, shipment_id: str) -> ShipmentDetailResponse | None:
    """Return full shipment with resolved locations + recent events."""
    try:
        query: dict[str, Any] = {"_id": ObjectId(shipment_id)}
    except Exception:
        query = {"trackingNumber": shipment_id}

    doc = db["shipments"].find_one(query)
    if doc is None:
        return None

    ship_oid = doc["_id"]

    # Batch-load this shipment's locations
    loc_ids: list[Any] = []
    for field in ("origin", "destination", "currentLocation"):
        if doc.get(field):
            loc_ids.append(doc[field])
    locs = _load_locations_map(db, loc_ids)

    origin_name, origin_node, _ = _loc_info(locs, doc.get("origin"))
    dest_name, dest_node, _ = _loc_info(locs, doc.get("destination"))
    curr_name, curr_node, _ = _loc_info(locs, doc.get("currentLocation"))

    # Events (most recent 20)
    event_docs = list(
        db["shipmentevents"].find(
            {"shipment": ship_oid},
            sort=[("timestamp", -1)],
            limit=20,
        )
    )

    # Batch-load event locations
    ev_loc_ids = [ev.get("location") for ev in event_docs if ev.get("location")]
    ev_locs = _load_locations_map(db, ev_loc_ids)

    events: list[ShipmentEventModel] = []
    for ev in event_docs:
        loc_name = None
        if ev.get("location"):
            loc_doc = ev_locs.get(str(_to_oid(ev["location"])))
            if loc_doc:
                loc_name = loc_doc.get("name")
        events.append(
            ShipmentEventModel(
                id=str(ev["_id"]),
                type=ev.get("type", ""),
                timestamp=_iso(ev.get("timestamp")),
                location=loc_name,
                notes=ev.get("notes"),
            )
        )

    latest_ev = event_docs[0] if event_docs else None
    evt_type = latest_ev.get("type") if latest_ev else None
    evt_time = _iso(latest_ev.get("timestamp")) if latest_ev else None

    status: str = doc.get("status", "")
    is_misplaced = status in MISPLACED_STATUSES or evt_type == "misplaced"
    is_delayed = status in DELAYED_STATUSES
    needs_recovery = is_misplaced or is_delayed

    active_incident = get_active_incident_for_shipment(db, ship_oid)
    incident_doc = active_incident
    # Include latest resolved incident only while shipment is still recovered
    if incident_doc is None and status == "recovered":
        incident_doc = get_latest_incident_for_shipment(db, ship_oid)

    incident_payload = None
    if incident_doc is not None:
        incident_payload = serialize_incident(db, incident_doc)
        incident_payload["lifecycleStatus"] = _lifecycle_status(status, incident_doc)

    lifecycle = _lifecycle_status(status, active_incident or (
        incident_doc if status == "recovered" else None
    ))
    if lifecycle in ("MISPLACED", "RECOVERY_ANALYSIS", "RECOVERY_ASSIGNED"):
        needs_recovery = True

    assigned_vehicle_id = doc.get("assignedVehicle")
    assigned_vehicle_number = None
    if assigned_vehicle_id is not None:
        vdoc = db["vehicles"].find_one(
            {"_id": _to_oid(assigned_vehicle_id)}, {"vehicleNumber": 1}
        )
        if vdoc:
            assigned_vehicle_number = vdoc.get("vehicleNumber")

    return ShipmentDetailResponse(
        id=str(ship_oid),
        trackingNumber=doc.get("trackingNumber", ""),
        origin=origin_name,
        destination=dest_name,
        currentLocation=curr_name,
        status=status,
        priority=doc.get("priority", ""),
        deadline=_iso(doc.get("deadline")),
        weight=float(doc.get("weight") or 0),
        latestEventType=evt_type,
        latestEventTime=evt_time,
        volume=float(doc.get("volume") or 0),
        packageCount=int(doc.get("packageCount") or 0),
        fragile=bool(doc.get("fragile", False)),
        specialHandling=doc.get("specialHandling"),
        originNode=origin_node,
        destinationNode=dest_node,
        currentNode=curr_node,
        needsRecovery=needs_recovery,
        events=events,
        createdAt=_iso(doc.get("createdAt")),
        updatedAt=_iso(doc.get("updatedAt")),
        lifecycleStatus=lifecycle,
        assignedVehicleId=str(assigned_vehicle_id) if assigned_vehicle_id else None,
        assignedVehicleNumber=assigned_vehicle_number,
        activeIncident=incident_payload,
    )
