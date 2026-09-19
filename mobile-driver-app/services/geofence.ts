import { GEOFENCE } from '../config/theme';
import { distanceMeters, type LatLng } from './mission';

export type GeofenceZone = 'far' | 'approaching' | 'arrived';

export function classifyProximity(current: LatLng | null, target: LatLng | null): GeofenceZone {
  if (!current || !target) return 'far';
  const d = distanceMeters(current, target);
  if (d <= GEOFENCE.arrivalMeters) return 'arrived';
  if (d <= GEOFENCE.approachMeters) return 'approaching';
  return 'far';
}

export function metersToTarget(current: LatLng | null, target: LatLng | null): number | null {
  if (!current || !target) return null;
  return distanceMeters(current, target);
}
