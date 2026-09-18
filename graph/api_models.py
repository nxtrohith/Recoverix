"""
Pydantic response models for the SH-205 REST API.

All models are strictly typed and JSON-safe.  ObjectId and datetime values
must be converted to str before constructing these models.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Shared sub-models
# ---------------------------------------------------------------------------


class CapacityModel(BaseModel):
    weight: float
    volume: float


class CoordinatesModel(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


class GraphStatusModel(BaseModel):
    loaded: bool
    nodeCount: int
    edgeCount: int
    skippedEdges: Optional[int] = None
    warningCount: Optional[int] = None


class HealthResponse(BaseModel):
    status: str
    database: str
    graph: GraphStatusModel


# ---------------------------------------------------------------------------
# Hubs  (operational locations / Mongoose `locations` collection)
# ---------------------------------------------------------------------------


class HubResponse(BaseModel):
    id: str
    name: str
    code: str
    type: str
    city: str
    address: str
    graphNodeKey: Optional[str] = None
    coordinates: Optional[CoordinatesModel] = None


class HubListResponse(BaseModel):
    count: int
    hubs: list[HubResponse]


# ---------------------------------------------------------------------------
# Graph topology  (telangana_nodes + telangana_edges)
# ---------------------------------------------------------------------------


class GraphNodeModel(BaseModel):
    id: str
    name: str
    type: str
    district: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class GraphEdgeModel(BaseModel):
    source: str
    target: str
    distance: Optional[float] = None
    travelTime: Optional[float] = None
    routeId: str


class GraphResponse(BaseModel):
    nodes: list[GraphNodeModel]
    edges: list[GraphEdgeModel]


# ---------------------------------------------------------------------------
# Vehicles
# ---------------------------------------------------------------------------


class VehicleListItem(BaseModel):
    id: str
    vehicleNumber: str
    type: str
    status: str
    currentLocationName: Optional[str] = None
    currentNode: Optional[str] = None
    capacity: CapacityModel
    currentLoad: CapacityModel
    availableWeight: float
    availableVolume: float
    currentRouteId: Optional[str] = None
    destination: Optional[str] = None       # destination location name
    destinationNode: Optional[str] = None
    eta: Optional[str] = None


class VehicleListResponse(BaseModel):
    count: int
    vehicles: list[VehicleListItem]


class VehicleDetailResponse(VehicleListItem):
    currentLocationId: Optional[str] = None
    vehicleType: Optional[str] = None
    # NetworkX path if vehicle has a current node + destination
    currentPath: Optional[list[str]] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None


# ---------------------------------------------------------------------------
# Shipments
# ---------------------------------------------------------------------------


class ShipmentListItem(BaseModel):
    id: str
    trackingNumber: str
    origin: Optional[str] = None
    destination: Optional[str] = None
    currentLocation: Optional[str] = None
    status: str
    priority: str
    deadline: Optional[str] = None
    weight: float
    latestEventType: Optional[str] = None
    latestEventTime: Optional[str] = None


class ShipmentListResponse(BaseModel):
    count: int
    shipments: list[ShipmentListItem]


class ShipmentEventModel(BaseModel):
    id: str
    type: str
    timestamp: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None


class ShipmentDetailResponse(ShipmentListItem):
    volume: float
    packageCount: int
    fragile: bool
    specialHandling: Optional[str] = None
    originNode: Optional[str] = None
    destinationNode: Optional[str] = None
    currentNode: Optional[str] = None
    needsRecovery: bool
    events: list[ShipmentEventModel] = []
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
