import { LocationCoordinate, NavigationManeuver, Route, NavigationGuidanceState, Warehouse } from '../types/navigation';
import { calculateDistance, calculateDistanceMeters, calculateBearing } from '../utils/distance';

/**
 * Guidance & Navigation Engine
 *
 * Handles real-time projection onto route geometry, cross-track deviation
 * detection (off-route triggers), step progression, remaining distance/ETA,
 * and arrival geofence detection.
 */

export const DEVIATION_THRESHOLD_METERS = 75; // 75 meters deviation flags off-route
export const ARRIVAL_THRESHOLD_METERS = 150;  // 150 meters from warehouse triggers arrival
export const STEP_ADVANCE_METERS = 35;        // 35 meters to maneuver transitions to next step

export interface PolylineProjection {
  closestPoint: LocationCoordinate;
  segmentIndex: number;
  distanceToRouteMeters: number;
  fractionAlongSegment: number;
}

/**
 * Calculates perpendicular projection of a point onto a line segment (P1 to P2)
 */
function projectPointOnSegment(
  p: LocationCoordinate,
  p1: LocationCoordinate,
  p2: LocationCoordinate
): { point: LocationCoordinate; fraction: number; distanceMeters: number } {
  const dx = p2.longitude - p1.longitude;
  const dy = p2.latitude - p1.latitude;

  if (dx === 0 && dy === 0) {
    return {
      point: { ...p1 },
      fraction: 0,
      distanceMeters: calculateDistanceMeters(p, p1),
    };
  }

  // Parameter t of projection onto line p1 + t*(p2 - p1)
  const t =
    ((p.longitude - p1.longitude) * dx + (p.latitude - p1.latitude) * dy) /
    (dx * dx + dy * dy);

  const clampedT = Math.max(0, Math.min(1, t));

  const projPoint: LocationCoordinate = {
    latitude: p1.latitude + clampedT * dy,
    longitude: p1.longitude + clampedT * dx,
    heading: calculateBearing(p1, p2),
  };

  return {
    point: projPoint,
    fraction: clampedT,
    distanceMeters: calculateDistanceMeters(p, projPoint),
  };
}

/**
 * Finds the closest point on the route polyline to the vehicle
 */
export function findClosestPointOnPolyline(
  vehicle: LocationCoordinate,
  waypoints: LocationCoordinate[]
): PolylineProjection {
  if (waypoints.length === 0) {
    return {
      closestPoint: { ...vehicle },
      segmentIndex: 0,
      distanceToRouteMeters: 0,
      fractionAlongSegment: 0,
    };
  }

  if (waypoints.length === 1) {
    return {
      closestPoint: { ...waypoints[0] },
      segmentIndex: 0,
      distanceToRouteMeters: calculateDistanceMeters(vehicle, waypoints[0]),
      fractionAlongSegment: 0,
    };
  }

  let minDistanceMeters = Infinity;
  let bestProjection: LocationCoordinate = waypoints[0];
  let bestSegmentIndex = 0;
  let bestFraction = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const p1 = waypoints[i];
    const p2 = waypoints[i + 1];

    const proj = projectPointOnSegment(vehicle, p1, p2);

    if (proj.distanceMeters < minDistanceMeters) {
      minDistanceMeters = proj.distanceMeters;
      bestProjection = proj.point;
      bestSegmentIndex = i;
      bestFraction = proj.fraction;
    }
  }

  return {
    closestPoint: bestProjection,
    segmentIndex: bestSegmentIndex,
    distanceToRouteMeters: minDistanceMeters,
    fractionAlongSegment: bestFraction,
  };
}

/**
 * Calculates remaining route distance along polyline starting from the projected segment
 */
export function calculateRemainingRouteDistanceKm(
  projection: PolylineProjection,
  waypoints: LocationCoordinate[]
): number {
  if (waypoints.length <= 1) return 0;

  // 1. Remaining distance on the current segment
  const currentP2 = waypoints[Math.min(waypoints.length - 1, projection.segmentIndex + 1)];
  let remainingMeters = calculateDistanceMeters(projection.closestPoint, currentP2);

  // 2. Sum full distances for all subsequent segments
  for (let i = projection.segmentIndex + 1; i < waypoints.length - 1; i++) {
    remainingMeters += calculateDistanceMeters(waypoints[i], waypoints[i + 1]);
  }

  return Math.round((remainingMeters / 1000) * 10) / 10;
}

export class GuidanceEngine {
  private consecutiveDeviationCount: number = 0;
  private readonly DEVIATION_CONFIRMATION_TICKS = 3;

  /**
   * Resets deviation state (e.g. after fresh route calculation)
   */
  public resetDeviation(): void {
    this.consecutiveDeviationCount = 0;
  }

  /**
   * Computes comprehensive live turn-by-turn guidance state
   */
  public evaluateGuidance(
    vehicle: LocationCoordinate,
    route: Route | null,
    currentStepIndex: number,
    destination: Warehouse | null,
    isVoiceMuted: boolean,
    gpsStatus: 'ACTIVE' | 'SEARCHING' | 'DENIED' | 'SIMULATING'
  ): NavigationGuidanceState {
    if (!route || route.waypoints.length === 0) {
      return {
        currentStepIndex: 0,
        currentManeuver: null,
        nextManeuver: null,
        distanceToNextManeuverMeters: 0,
        remainingDistanceKm: 0,
        remainingMinutes: 0,
        routeProgressPercent: 0,
        isOffRoute: false,
        isRerouting: false,
        isVoiceMuted,
        gpsStatus,
        routeSource: 'OFFLINE_CORRIDOR',
        deviationDistanceMeters: 0,
      };
    }

    const projection = findClosestPointOnPolyline(vehicle, route.waypoints);
    const deviationMeters = Math.round(projection.distanceToRouteMeters);

    // Track consecutive deviations to filter out momentary GPS noise
    if (deviationMeters > DEVIATION_THRESHOLD_METERS) {
      this.consecutiveDeviationCount++;
    } else {
      this.consecutiveDeviationCount = Math.max(0, this.consecutiveDeviationCount - 1);
    }

    const isOffRoute = this.consecutiveDeviationCount >= this.DEVIATION_CONFIRMATION_TICKS;

    // Remaining Distance along polyline
    const remainingKm = calculateRemainingRouteDistanceKm(projection, route.waypoints);
    const totalKm = Math.max(0.1, route.distanceKm);
    const progressPercent = Math.min(
      100,
      Math.max(0, Math.round(((totalKm - remainingKm) / totalKm) * 100))
    );

    // Dynamic ETA based on current vehicle speed or default 50 km/h
    const currentSpeedKmh = vehicle.speed ? vehicle.speed * 3.6 : 50;
    const effectiveSpeed = Math.max(25, Math.min(90, currentSpeedKmh));
    const remainingMin = Math.max(1, Math.round((remainingKm / effectiveSpeed) * 60));

    // Maneuver progression
    const maneuvers = route.maneuvers || [];
    let stepIndex = Math.min(maneuvers.length - 1, Math.max(0, currentStepIndex));

    let currentManeuver: NavigationManeuver | null = maneuvers[stepIndex] || null;
    let nextManeuver: NavigationManeuver | null = maneuvers[stepIndex + 1] || null;
    let distToManeuverMeters = 0;

    if (currentManeuver && currentManeuver.coordinate) {
      distToManeuverMeters = Math.round(
        calculateDistanceMeters(vehicle, currentManeuver.coordinate)
      );

      // Advance to next step when within proximity threshold
      if (distToManeuverMeters <= STEP_ADVANCE_METERS && stepIndex < maneuvers.length - 1) {
        stepIndex++;
        currentManeuver = maneuvers[stepIndex];
        nextManeuver = maneuvers[stepIndex + 1] || null;
        if (currentManeuver && currentManeuver.coordinate) {
          distToManeuverMeters = Math.round(
            calculateDistanceMeters(vehicle, currentManeuver.coordinate)
          );
        }
      }
    } else if (currentManeuver) {
      // Fallback distance calculation if step has no explicit coordinate
      const stepFraction = (stepIndex + 1) / Math.max(1, maneuvers.length);
      distToManeuverMeters = Math.max(
        50,
        Math.round(remainingKm * 1000 * (1 - stepFraction))
      );
    }

    const routeSource = route.id.startsWith('GOOGLE')
      ? 'GOOGLE_DIRECTIONS'
      : 'OFFLINE_CORRIDOR';

    return {
      currentStepIndex: stepIndex,
      currentManeuver,
      nextManeuver,
      distanceToNextManeuverMeters: distToManeuverMeters,
      remainingDistanceKm: remainingKm,
      remainingMinutes: remainingMin,
      routeProgressPercent: progressPercent,
      isOffRoute,
      isRerouting: false,
      isVoiceMuted,
      gpsStatus,
      routeSource,
      deviationDistanceMeters: deviationMeters,
    };
  }

  /**
   * Checks if driver has arrived inside destination geofence
   */
  public checkArrival(
    vehicle: LocationCoordinate,
    destination: Warehouse | null,
    radiusMeters: number = ARRIVAL_THRESHOLD_METERS
  ): boolean {
    if (!destination) return false;
    const dist = calculateDistanceMeters(vehicle, {
      latitude: destination.latitude,
      longitude: destination.longitude,
    });
    return dist <= radiusMeters;
  }
}

export const guidanceEngine = new GuidanceEngine();
