import { LocationCoordinate, Route } from '../types/navigation';
import { calculateDistance, calculateBearing } from '../utils/distance';

/**
 * High-fidelity highway waypoint coordinates across Telangana corridors.
 * Allows realistic route polylines and smooth waypoint-by-waypoint vehicle simulation.
 */

// Corridors:
// 1. NH-163: Hyderabad Central -> Warangal Regional Depot (~144 km)
export const ROUTE_HYD_TO_WARANGAL_WAYPOINTS: LocationCoordinate[] = [
  { latitude: 17.3850, longitude: 78.4867, heading: 68 },  // Hyderabad Central DC
  { latitude: 17.3995, longitude: 78.5320, heading: 72 },  // Uppal Junction
  { latitude: 17.4380, longitude: 78.6150, heading: 70 },  // Peerzadiguda
  { latitude: 17.4520, longitude: 78.6830, heading: 65 },  // Ghatkesar Tollway
  { latitude: 17.4720, longitude: 78.7840, heading: 62 },  // Bibinagar
  { latitude: 17.5120, longitude: 78.8910, heading: 58 },  // Bhongir Bypass
  { latitude: 17.5850, longitude: 79.0350, heading: 55 },  // Aler Junction
  { latitude: 17.6520, longitude: 79.1450, heading: 52 },  // Kolanupaka Turn
  { latitude: 17.7280, longitude: 79.1830, heading: 50 },  // Jangaon Town
  { latitude: 17.7840, longitude: 79.2890, heading: 48 },  // Pembarti
  { latitude: 17.8460, longitude: 79.3790, heading: 54 },  // Station Ghanpur
  { latitude: 17.9150, longitude: 79.4620, heading: 62 },  // Madikonda
  { latitude: 17.9730, longitude: 79.5210, heading: 70 },  // Kazipet Junction
  { latitude: 17.9780, longitude: 79.5630, heading: 82 },  // Subedari, Hanamkonda
  { latitude: 17.9689, longitude: 79.5941, heading: 90 },  // Warangal Regional Depot
];

// 2. NH-44 North: Hyderabad Central -> Hyderabad North Recovery Center (Medchal) (~32 km)
export const ROUTE_HYD_TO_MEDCHAL_WAYPOINTS: LocationCoordinate[] = [
  { latitude: 17.3850, longitude: 78.4867, heading: 5 },   // Hyderabad Central DC
  { latitude: 17.4120, longitude: 78.4880, heading: 10 },  // Tank Bund Road
  { latitude: 17.4410, longitude: 78.4980, heading: 8 },   // Secunderabad Station Area
  { latitude: 17.4780, longitude: 78.4880, heading: 355 }, // Bowenpally
  { latitude: 17.5190, longitude: 78.4840, heading: 352 }, // Suchitra Junction
  { latitude: 17.5450, longitude: 78.4820, heading: 350 }, // Kompally Corridor
  { latitude: 17.5820, longitude: 78.4810, heading: 354 }, // Kandlakoya Junction
  { latitude: 17.6297, longitude: 78.4815, heading: 2 },   // Medchal Recovery Hub
];

// 3. Recovery Leg 2: Medchal Recovery Center -> Warangal Regional Depot (~136 km)
export const ROUTE_MEDCHAL_TO_WARANGAL_WAYPOINTS: LocationCoordinate[] = [
  { latitude: 17.6297, longitude: 78.4815, heading: 95 },  // Medchal Recovery Hub
  { latitude: 17.6210, longitude: 78.5420, heading: 105 }, // Outer Ring Road Exit 6
  { latitude: 17.5820, longitude: 78.6310, heading: 110 }, // Shamirpet ORR Junction
  { latitude: 17.5540, longitude: 78.7420, heading: 98 },  // Keesara Link
  { latitude: 17.5410, longitude: 78.8520, heading: 82 },  // Bhongir Connector
  { latitude: 17.5850, longitude: 79.0350, heading: 60 },  // Aler Junction (merges to NH-163)
  { latitude: 17.6520, longitude: 79.1450, heading: 52 },  // Kolanupaka
  { latitude: 17.7280, longitude: 79.1830, heading: 50 },  // Jangaon
  { latitude: 17.7840, longitude: 79.2890, heading: 48 },  // Pembarti
  { latitude: 17.8460, longitude: 79.3790, heading: 54 },  // Station Ghanpur
  { latitude: 17.9150, longitude: 79.4620, heading: 62 },  // Madikonda
  { latitude: 17.9730, longitude: 79.5210, heading: 70 },  // Kazipet
  { latitude: 17.9689, longitude: 79.5941, heading: 90 },  // Warangal Regional Depot
];

// 4. NH-65 South-East: Hyderabad -> Suryapet (~130 km)
export const ROUTE_HYD_TO_SURYAPET_WAYPOINTS: LocationCoordinate[] = [
  { latitude: 17.3850, longitude: 78.4867, heading: 125 }, // Hyderabad Central
  { latitude: 17.3410, longitude: 78.5620, heading: 120 }, // L.B. Nagar Ring Road
  { latitude: 17.3210, longitude: 78.6310, heading: 115 }, // Hayathnagar Tollway
  { latitude: 17.2650, longitude: 78.7890, heading: 112 }, // Pedda Amberpet
  { latitude: 17.2340, longitude: 78.9120, heading: 108 }, // Choutuppal
  { latitude: 17.1890, longitude: 79.0820, heading: 105 }, // Chityal
  { latitude: 17.1580, longitude: 79.2310, heading: 102 }, // Narketpally Junction
  { latitude: 17.1350, longitude: 79.4120, heading: 98 },  // Nakrekal
  { latitude: 17.1400, longitude: 79.6200, heading: 92 },  // Suryapet Cargo Hub
];

/**
 * Helper to build smooth intermediate waypoints between any two coordinates
 */
export function buildInterpolatedRouteWaypoints(
  start: LocationCoordinate,
  end: LocationCoordinate,
  numSegments: number = 18
): LocationCoordinate[] {
  const waypoints: LocationCoordinate[] = [];
  const bearing = calculateBearing(start, end);

  for (let i = 0; i <= numSegments; i++) {
    const t = i / numSegments;
    // Add subtle curvature to simulate road highway bends
    const arc = Math.sin(t * Math.PI) * 0.035;
    const perpLat = -(end.longitude - start.longitude);
    const perpLon = end.latitude - start.latitude;
    const len = Math.sqrt(perpLat * perpLat + perpLon * perpLon) || 1;

    const lat = start.latitude + (end.latitude - start.latitude) * t + (perpLat / len) * arc;
    const lon = start.longitude + (end.longitude - start.longitude) * t + (perpLon / len) * arc;

    waypoints.push({
      latitude: lat,
      longitude: lon,
      heading: bearing,
    });
  }

  return waypoints;
}

/**
 * Builds a full Route object between two warehouses
 */
export function createRoute(
  fromId: string,
  toId: string,
  fromName: string,
  toName: string,
  waypoints: LocationCoordinate[]
): Route {
  let totalDist = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    totalDist += calculateDistance(waypoints[i], waypoints[i + 1]);
  }

  // Average commercial truck speed ~ 55 km/h on Telangana state highways
  const estimatedMin = Math.round((totalDist / 55) * 60);

  const n = waypoints.length;
  const pStart = waypoints[0];
  const pMerge = waypoints[Math.min(1, n - 1)];
  const pMid = waypoints[Math.floor(n / 2)];
  const pExit = waypoints[Math.max(0, n - 2)];
  const pEnd = waypoints[n - 1];

  return {
    id: `ROUTE-${fromId}-${toId}`,
    name: `${fromName} → ${toName}`,
    fromWarehouseId: fromId,
    toWarehouseId: toId,
    originName: fromName,
    destinationName: toName,
    distanceKm: Math.round(totalDist * 10) / 10,
    estimatedMinutes: estimatedMin,
    waypoints,
    maneuvers: [
      {
        id: 'm1',
        instruction: `Depart ${fromName}`,
        distanceMeters: 500,
        iconName: 'navigation',
        maneuverType: 'depart',
        coordinate: pStart,
        spokenInstruction: `Depart ${fromName} and head toward main corridor`,
      },
      {
        id: 'm2',
        instruction: 'Merge onto primary freight corridor',
        distanceMeters: 1200,
        iconName: 'git-commit',
        maneuverType: 'merge',
        coordinate: pMerge,
        spokenInstruction: 'In 1.2 kilometers, merge onto primary freight corridor',
      },
      {
        id: 'm3',
        instruction: `Continue on highway towards ${toName}`,
        distanceMeters: Math.round(totalDist * 800),
        iconName: 'arrow-up',
        maneuverType: 'straight',
        coordinate: pMid,
        spokenInstruction: `Continue on highway towards ${toName}`,
      },
      {
        id: 'm4',
        instruction: `Exit right towards ${toName} Gate 1`,
        distanceMeters: 800,
        iconName: 'corner-down-right',
        maneuverType: 'turn-right',
        coordinate: pExit,
        spokenInstruction: `In 800 meters, exit right towards ${toName} Gate 1`,
      },
      {
        id: 'm5',
        instruction: `Arrive at ${toName}`,
        distanceMeters: 100,
        iconName: 'check-circle',
        maneuverType: 'arrive',
        coordinate: pEnd,
        spokenInstruction: `Arrive at ${toName}`,
      },
    ],
  };
}
