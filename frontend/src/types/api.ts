/**
 * Frontend types mirroring FastAPI / Node-proxy JSON responses.
 * Fields are taken from graph/api_models.py, recovery_orchestrator.py,
 * recovery_persistence.serialize_recovery_plan, and incident_service.serialize_incident.
 */

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export interface Capacity {
  weight: number;
  volume: number;
}

export interface Coordinates {
  latitude?: number | null;
  longitude?: number | null;
}

export type CandidateType = 'at_node' | 'pass_through' | 'detour' | 'none' | string;

export type RecoveryAnalysisStatus =
  | 'RECOVERY_PLAN_AVAILABLE'
  | 'NO_FEASIBLE_RECOVERY'
  | 'RECOVERY_ASSIGNED'
  | 'PICKUP_CONFIRMED'
  | string;

/** Computed lifecycle shown on shipments / incidents (not the Mongo incident.status). */
export type LifecycleStatus =
  | 'NORMAL'
  | 'MISPLACED'
  | 'RECOVERY_ANALYSIS'
  | 'RECOVERY_ASSIGNED'
  | 'PICKUP_CONFIRMED'
  | 'RECOVERED'
  | string;

/** Persisted Incident.status values from MongoDB. */
export type IncidentStatus =
  | 'OPEN'
  | 'RECOVERY_REQUIRED'
  | 'ASSIGNED'
  | 'PICKUP_CONFIRMED'
  | 'RESOLVED'
  | string;

/**
 * Operator-facing recovery steps (UI mapping).
 * DRIVER_CONTACTED is not a Mongo status — ASSIGNED implies driver contacted.
 */
export type RecoveryDisplayStatus =
  | 'RECOVERY_REQUIRED'
  | 'ASSIGNED'
  | 'DRIVER_CONTACTED'
  | 'PICKUP_CONFIRMED'
  | 'RECOVERED'
  | 'RESOLVED';

export type RecoveryOptionStatus =
  | 'proposed'
  | 'selected'
  | 'rejected'
  | 'executing'
  | 'completed'
  | 'failed'
  | string;

export type RejectionReason = string;

// ---------------------------------------------------------------------------
// Location / Hub
// ---------------------------------------------------------------------------

export interface Location {
  id: string;
  name: string;
  code: string;
  type: string;
  city: string;
  address: string;
  graphNodeKey?: string | null;
  coordinates?: Coordinates | null;
}

export interface HubListResponse {
  count: number;
  hubs: Location[];
}

// ---------------------------------------------------------------------------
// Vehicle
// ---------------------------------------------------------------------------

export interface Vehicle {
  id: string;
  vehicleNumber: string;
  type: string;
  status: string;
  currentLocationName?: string | null;
  currentNode?: string | null;
  capacity: Capacity;
  currentLoad: Capacity;
  availableWeight: number;
  availableVolume: number;
  currentRouteId?: string | null;
  destination?: string | null;
  destinationNode?: string | null;
  eta?: string | null;
  currentLocationId?: string | null;
  vehicleType?: string | null;
  currentPath?: string[] | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface VehicleListResponse {
  count: number;
  vehicles: Vehicle[];
}

// ---------------------------------------------------------------------------
// Shipment / events
// ---------------------------------------------------------------------------

export interface ShipmentEvent {
  id: string;
  type: string;
  timestamp?: string | null;
  location?: string | null;
  notes?: string | null;
}

export interface Shipment {
  id: string;
  trackingNumber: string;
  origin?: string | null;
  destination?: string | null;
  currentLocation?: string | null;
  status: string;
  priority: string;
  deadline?: string | null;
  weight: number;
  volume?: number;
  packageCount?: number;
  fragile?: boolean;
  specialHandling?: string | null;
  originNode?: string | null;
  destinationNode?: string | null;
  currentNode?: string | null;
  expectedNode?: string | null;
  actualNode?: string | null;
  expectedLocation?: string | null;
  /** Present on recovery analysis; shipment detail uses currentLocation as actual. */
  actualLocation?: string | null;
  plannedRoute?: string[];
  isMisplaced?: boolean | null;
  needsRecovery?: boolean;
  events?: ShipmentEvent[];
  createdAt?: string | null;
  updatedAt?: string | null;
  lifecycleStatus?: LifecycleStatus | null;
  assignedVehicleId?: string | null;
  assignedVehicleNumber?: string | null;
  activeIncident?: Incident | null;
  latestEventType?: string | null;
  latestEventTime?: string | null;
}

export interface ShipmentListResponse {
  count: number;
  shipments: Shipment[];
}

// ---------------------------------------------------------------------------
// Incident
// ---------------------------------------------------------------------------

export interface Incident {
  incidentId?: string | null;
  id: string;
  shipmentId: string;
  vehicleId?: string | null;
  vehicleNumber?: string | null;
  recoveryVehicleId?: string | null;
  recoveryVehicleNumber?: string | null;
  recoveryDriverId?: string | null;
  incidentType?: string | null;
  hubId?: string | null;
  hubName?: string | null;
  status: IncidentStatus;
  selectedCandidateId?: string | null;
  recoveryPath?: string[];
  pickupCase?: CandidateType | null;
  pickupNode?: string | null;
  destinationNode?: string | null;
  recoveryScore?: number | null;
  recoveryCaseId?: string | null;
  selectedRecoveryOptionId?: string | null;
  driverMessage?: string | null;
  lateDetectionMessage?: string | null;
  lateDetectionCallAttemptId?: string | null;
  lateDetectionCallChannel?: string | null;
  driverCallAttemptId?: string | null;
  driverCallChannel?: string | null;
  analysisStatus?: string | null;
  lifecycleStatus?: LifecycleStatus | null;
  assignedAt?: string | null;
  pickupConfirmedAt?: string | null;
  createdAt?: string | null;
  resolvedAt?: string | null;
  updatedAt?: string | null;
  shipmentTrackingNumber?: string | null;
  destinationName?: string | null;
}

export interface ActiveIncidentsResponse {
  count: number;
  incidents: Incident[];
}

export interface IncidentByShipmentResponse extends Incident {
  lifecycleStatus?: LifecycleStatus | null;
}

// ---------------------------------------------------------------------------
// Recovery analysis / candidates / plan
// ---------------------------------------------------------------------------

export interface RecoveryCandidateMetrics {
  distance?: number | null;
  travelTime?: number | null;
  cost?: number | null;
  availableCapacity?: Capacity | null;
  deadlineBuffer?: number | null;
  detourDistanceKm?: number | null;
  detourTimeMin?: number | null;
  detourAvailable?: boolean | null;
  connectivityDegree?: number | null;
  connectivityCentrality?: number | null;
}

export interface ComponentScores {
  time?: number;
  cost?: number;
  capacity?: number;
  deadline?: number;
  priority?: number;
  detour?: number;
  connectivity?: number;
}

export interface RecoveryCandidate {
  candidateId: string;
  vehicleId: string;
  vehicleNumber?: string | null;
  pickupCase?: CandidateType | null;
  path: string[];
  feasible: boolean;
  feasibility?: boolean;
  rejectionReason?: RejectionReason | null;
  score?: number | null;
  totalScore?: number | null;
  metrics?: RecoveryCandidateMetrics | null;
  breakdown?: ComponentScores | null;
  componentScores?: ComponentScores | null;
  explanation?: string | null;
  factorsHelped?: string[];
  factorsHurt?: string[];
}

export interface SelectedRecovery {
  candidateId?: string | null;
  vehicleId?: string | null;
  vehicleNumber?: string | null;
  pickupCase?: CandidateType | null;
  path?: string[];
  estimatedArrival?: string | null;
  estimatedCost?: number | null;
  estimatedDistance?: number | null;
  estimatedTravelTimeMin?: number | null;
  score?: number | null;
  explanation?: string | null;
  recoveryOptionId?: string | null;
  recoveryPlanStatus?: RecoveryOptionStatus | null;
}

/** Persisted recovery plan summary (recoveryoptions). */
export interface RecoveryPlan {
  id: string;
  recoveryCaseId?: string | null;
  incidentId?: string | null;
  shipmentId?: string | null;
  selectedVehicleId?: string | null;
  driverId?: string | null;
  pickupNode?: string | null;
  destinationNode?: string | null;
  candidateType?: CandidateType | null;
  candidateId?: string | null;
  path?: string[];
  score?: number | null;
  componentScores?: ComponentScores | null;
  estimatedTime?: number | null;
  estimatedDistance?: number | null;
  estimatedCost?: number | null;
  explanation?: string | null;
  status?: RecoveryOptionStatus | null;
  rank?: number | null;
  createdAt?: string | null;
}

export interface RecoveryNetwork {
  currentNode?: string | null;
  actualNode?: string | null;
  expectedNode?: string | null;
  plannedRoute?: string[];
  destinationNode?: string | null;
  candidateCount?: number;
  feasibleCount?: number;
  vehicleCount?: number;
  directPathExists?: boolean | null;
  graphNodes?: number;
  graphEdges?: number;
}

export interface RecoveryShipmentSummary {
  id: string;
  trackingNumber?: string | null;
  status?: string | null;
  currentLocation?: string | null;
  expectedLocation?: string | null;
  actualLocation?: string | null;
  destination?: string | null;
  priority?: string | null;
  deadline?: string | null;
  weight?: number | null;
  volume?: number | null;
  needsRecovery?: boolean;
  isMisplaced?: boolean | null;
  expectedFromRoute?: boolean | null;
}

export interface RecoveryAnalysis {
  shipment: RecoveryShipmentSummary;
  network: RecoveryNetwork;
  candidates: RecoveryCandidate[];
  selectedRecovery: SelectedRecovery | null;
  selectionExplanation?: string | null;
  reasons: string[];
  status: RecoveryAnalysisStatus;
  recoveryPlan: RecoveryPlan | null;
}

export interface AssignRecoveryPayload {
  candidateId?: string | null;
  vehicleId?: string | null;
  path?: string[] | null;
  pickupCase?: CandidateType | null;
  score?: number | null;
}

export interface RecoveryAssignment {
  candidateId?: string | null;
  vehicleId?: string | null;
  vehicleNumber?: string | null;
  driverId?: string | null;
  path?: string[];
  pickupCase?: CandidateType | null;
  pickupNode?: string | null;
  destinationNode?: string | null;
  recoveryScore?: number | null;
  recoveryOptionId?: string | null;
  assignedAt?: string | null;
}

export interface DriverNotification {
  vehicleId?: string | null;
  message?: string | null;
  channel?: string | null;
  delivered?: boolean;
  sentAt?: string | null;
  detail?: string | null;
  simulated?: boolean;
  attemptId?: string | null;
  callKind?: string | null;
  phone?: string | null;
  language?: string | null;
}

export interface AssignRecoveryResponse {
  incident: Incident;
  shipment: Partial<Shipment>;
  assignment: RecoveryAssignment;
  recoveryPlan?: RecoveryPlan | null;
  driverNotification?: DriverNotification | null;
  recovery?: RecoveryAnalysis | null;
  message?: string;
}

export interface PickupRecoveryResponse {
  incident: Incident;
  shipment: Partial<Shipment>;
  pickup: {
    confirmed: boolean;
    simulated: boolean;
    confirmedAt?: string | null;
    pickupNode?: string | null;
    destinationNode?: string | null;
    vehicleId?: string | null;
    vehicleNumber?: string | null;
    eventType?: string | null;
  };
  message?: string;
}

export interface ResolveRecoveryResponse {
  incident: Incident;
  shipment: Partial<Shipment>;
  completion: {
    recoveryVehicleId?: string | null;
    recoveryVehicleNumber?: string | null;
    recoveryRoute?: string[];
    recoveryRouteLabel?: string | null;
    status?: string;
    resolved?: boolean;
  };
  message?: string;
}

export interface SimulateIncidentResponse {
  incident: Incident;
  shipment: Partial<Shipment>;
  recovery?: RecoveryAnalysis | null;
  message?: string;
}

/** Recovery-related shipment event types observed in the demo workflow. */
export type RecoveryEventType =
  | 'recovery_pickup_confirmed'
  | string;

export interface RecoveryEvent {
  id?: string;
  type: RecoveryEventType;
  timestamp?: string | null;
  location?: string | null;
  notes?: string | null;
}
