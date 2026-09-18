/**
 * Core Types & Interfaces for Telangana Logistics Driver Navigation Module
 *
 * Isolated interface boundary:
 * DriverLocationProvider and RecoveryProvider define contracts that allow
 * swapping local mock services with real backend APIs in future phases.
 */

export interface LocationCoordinate {
  latitude: number;
  longitude: number;
  heading?: number; // 0 to 360 degrees
  speed?: number;   // m/s or km/h
  altitude?: number;
  accuracy?: number;
}

export interface Warehouse {
  id: string;
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  address?: string;
  capacityUnits?: number;
  contactNumber?: string;
  hubType?: 'PRIMARY_DC' | 'REGIONAL_HUB' | 'TRANSIT_POINT' | 'RECOVERY_CENTER';
}

export type ManeuverType =
  | 'depart'
  | 'turn-slight-left'
  | 'turn-left'
  | 'turn-sharp-left'
  | 'turn-slight-right'
  | 'turn-right'
  | 'turn-sharp-right'
  | 'straight'
  | 'ramp-right'
  | 'ramp-left'
  | 'merge'
  | 'fork-left'
  | 'fork-right'
  | 'roundabout'
  | 'uturn'
  | 'arrive';

export interface NavigationManeuver {
  id: string;
  instruction: string;
  distanceMeters: number;
  iconName?: string;
  maneuverType?: ManeuverType;
  coordinate?: LocationCoordinate;
  roadName?: string;
  spokenInstruction?: string;
}

export interface NavigationGuidanceState {
  currentStepIndex: number;
  currentManeuver: NavigationManeuver | null;
  nextManeuver: NavigationManeuver | null;
  distanceToNextManeuverMeters: number;
  remainingDistanceKm: number;
  remainingMinutes: number;
  routeProgressPercent: number;
  isOffRoute: boolean;
  isRerouting: boolean;
  isVoiceMuted: boolean;
  gpsStatus: 'ACTIVE' | 'SEARCHING' | 'DENIED' | 'SIMULATING';
  routeSource: 'GOOGLE_DIRECTIONS' | 'OFFLINE_CORRIDOR';
  deviationDistanceMeters: number;
}

export interface Route {
  id: string;
  name: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  originName: string;
  destinationName: string;
  distanceKm: number;
  estimatedMinutes: number;
  waypoints: LocationCoordinate[];
  maneuvers: NavigationManeuver[];
}

export type RecoveryPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM';

export type RecoveryStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'EN_ROUTE_LEG_1'
  | 'AT_RECOVERY'
  | 'PICKED_UP'
  | 'EN_ROUTE_LEG_2'
  | 'DELIVERED';

export interface RecoveryAssignment {
  id: string;
  shipmentId: string;
  priority: RecoveryPriority;
  recoveryWarehouseId: string;
  destinationWarehouseId: string;
  units: number;
  cargoType: string;
  reason: string;
  instructions: string;
  status: RecoveryStatus;
  dispatchedAt: string;
}

export type NavigationMode =
  | 'IDLE'             // Free roaming / Standby
  | 'NAVIGATING'        // Active normal navigation to selected warehouse
  | 'RECOVERY_ALERT'   // Incoming urgent recovery assignment modal
  | 'RECOVERY_LEG_1'   // En route to recovery warehouse for pickup
  | 'AT_RECOVERY'      // Arrived at recovery warehouse, pending pickup confirmation
  | 'RECOVERY_LEG_2'   // En route to final delivery destination with recovered cargo
  | 'DELIVERED';       // Arrived at final destination, delivery confirmed

export interface DriverProfile {
  id: string;
  name: string;
  truckId: string;
  fleet: string;
  status: 'ON_DUTY' | 'EN_ROUTE' | 'ON_BREAK';
  baseStation: string;
}

// ── Integration Boundary Interfaces ──────────────────────────────────────────

export interface DriverLocationProvider {
  getCurrentLocation(): Promise<LocationCoordinate>;
  watchLocation(callback: (location: LocationCoordinate) => void): () => void;
  isSimulating(): boolean;
  setSimulating(simulating: boolean): void;
}

export interface RecoveryProvider {
  getRecoveryAssignment(): Promise<RecoveryAssignment | null>;
  acceptRecovery(id: string): Promise<void>;
  confirmPickup(id: string): Promise<void>;
  completeRecovery(id: string): Promise<void>;
}
