/**
 * Driver mission status derived from backend incident lifecycle.
 * Never fabricates assignment data — only maps known backend states + local UI ack.
 */
export type MissionStatus =
  | 'NORMAL'
  | 'RECOVERY_ASSIGNED'
  | 'EN_ROUTE_TO_PICKUP'
  | 'PICKUP_CONFIRMED'
  | 'DELIVERING'
  | 'RESOLVED';

export type LatLng = { latitude: number; longitude: number };

export type GraphNode = {
  id: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type Incident = {
  id: string;
  incidentId?: string | null;
  shipmentId: string;
  shipmentTrackingNumber?: string | null;
  status: string;
  lifecycleStatus?: string | null;
  recoveryVehicleId?: string | null;
  recoveryVehicleNumber?: string | null;
  recoveryDriverId?: string | null;
  hubName?: string | null;
  pickupNode?: string | null;
  destinationNode?: string | null;
  destinationName?: string | null;
  recoveryPath?: string[];
  existingRouteNodes?: string[];
  vehicleToPickupPath?: string[];
  vehicleToDestinationPath?: string[];
  pickupCase?: string | null;
  recoveryScore?: number | null;
  driverMessage?: string | null;
  driverCallStatus?: string | null;
  driverCallChannel?: string | null;
  driverCallPhone?: string | null;
  driverCallTriggeredAt?: string | null;
  assignedAt?: string | null;
  pickupConfirmedAt?: string | null;
  resolvedAt?: string | null;
};

export type Vehicle = {
  id: string;
  vehicleNumber: string;
  type: string;
  status: string;
  currentLocationName?: string | null;
  currentNode?: string | null;
  destination?: string | null;
  destinationNode?: string | null;
  currentPath?: string[] | null;
  driverId?: string | null;
  driverName?: string | null;
  phone?: string | null;
  coordinates?: { latitude?: number | null; longitude?: number | null } | null;
};

export function deriveMissionStatus(
  incident: Incident | null,
  opts: { acknowledged: boolean; nearPickup?: boolean; nearDestination?: boolean } = {
    acknowledged: false,
  },
): MissionStatus {
  if (!incident) return 'NORMAL';

  const status = (incident.status || '').toUpperCase();
  const life = (incident.lifecycleStatus || '').toUpperCase();

  if (status === 'RESOLVED' || life === 'RECOVERED') return 'RESOLVED';
  if (status === 'PICKUP_CONFIRMED' || life === 'PICKUP_CONFIRMED') {
    return opts.nearDestination ? 'DELIVERING' : 'PICKUP_CONFIRMED';
  }
  if (status === 'ASSIGNED' || life === 'RECOVERY_ASSIGNED') {
    if (opts.acknowledged) return 'EN_ROUTE_TO_PICKUP';
    return 'RECOVERY_ASSIGNED';
  }
  return 'NORMAL';
}

export function missionLabel(status: MissionStatus): string {
  switch (status) {
    case 'NORMAL':
      return 'NORMAL';
    case 'RECOVERY_ASSIGNED':
      return 'RECOVERY ASSIGNED';
    case 'EN_ROUTE_TO_PICKUP':
      return 'EN ROUTE TO PICKUP';
    case 'PICKUP_CONFIRMED':
      return 'PICKUP CONFIRMED';
    case 'DELIVERING':
      return 'DELIVERING';
    case 'RESOLVED':
      return 'RESOLVED';
    default:
      return status;
  }
}

export function isRecoveryMission(status: MissionStatus): boolean {
  return status !== 'NORMAL' && status !== 'RESOLVED';
}

/** Haversine distance in meters. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters == null || Number.isNaN(meters)) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return '—';
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}
