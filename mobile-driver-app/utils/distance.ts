import { LocationCoordinate } from '../types/navigation';

const EARTH_RADIUS_KM = 6371;

/**
 * Calculates Great-Circle distance between two coordinates using the Haversine formula.
 * Returns distance in kilometers.
 */
export function calculateDistance(
  coord1: LocationCoordinate,
  coord2: LocationCoordinate
): number {
  const dLat = toRad(coord2.latitude - coord1.latitude);
  const dLon = toRad(coord2.longitude - coord1.longitude);

  const lat1 = toRad(coord1.latitude);
  const lat2 = toRad(coord2.latitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Calculates distance in meters between two coordinates.
 */
export function calculateDistanceMeters(
  coord1: LocationCoordinate,
  coord2: LocationCoordinate
): number {
  return calculateDistance(coord1, coord2) * 1000;
}

/**
 * Calculates initial compass bearing from start to destination in degrees [0, 360).
 */
export function calculateBearing(
  start: LocationCoordinate,
  dest: LocationCoordinate
): number {
  const lat1 = toRad(start.latitude);
  const lat2 = toRad(dest.latitude);
  const dLon = toRad(dest.longitude - start.longitude);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  let brng = Math.atan2(y, x);
  brng = toDeg(brng);

  return (brng + 360) % 360;
}

/**
 * Check if current position is within a specified radius (in meters) of a target.
 */
export function isWithinRadius(
  current: LocationCoordinate,
  target: LocationCoordinate,
  radiusMeters: number = 350
): boolean {
  return calculateDistanceMeters(current, target) <= radiusMeters;
}

/**
 * Linearly interpolates a coordinate between two points for smooth simulation movement.
 */
export function interpolateCoordinate(
  start: LocationCoordinate,
  end: LocationCoordinate,
  fraction: number
): LocationCoordinate {
  const clamped = Math.max(0, Math.min(1, fraction));
  const lat = start.latitude + (end.latitude - start.latitude) * clamped;
  const lon = start.longitude + (end.longitude - start.longitude) * clamped;
  const bearing = calculateBearing(start, end);

  return {
    latitude: lat,
    longitude: lon,
    heading: bearing,
  };
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}
