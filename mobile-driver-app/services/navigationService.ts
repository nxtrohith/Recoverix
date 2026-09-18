import { LocationCoordinate, NavigationManeuver, Route, Warehouse } from '../types/navigation';
import { calculateDistance, calculateBearing, isWithinRadius } from '../utils/distance';
import {
  ROUTE_HYD_TO_WARANGAL_WAYPOINTS,
  ROUTE_HYD_TO_MEDCHAL_WAYPOINTS,
  ROUTE_MEDCHAL_TO_WARANGAL_WAYPOINTS,
  ROUTE_HYD_TO_SURYAPET_WAYPOINTS,
  buildInterpolatedRouteWaypoints,
  createRoute,
} from '../data/routes';
import { fetchGoogleDirections, launchExternalGoogleMapsNavigation } from './googleMapsService';

/**
 * Navigation Service
 *
 * Encapsulates all distance, routing, ETA, and arrival detection calculations.
 * Integrates Google Maps Directions & Routes APIs with offline corridor fallback.
 */
export class NavigationService {
  /**
   * Asynchronously calculates route, prioritizing live Google Maps Directions API.
   * If Google Maps API is unavailable or rate-limited, falls back to pre-calculated
   * high-accuracy corridor geometry.
   */
  public async getRouteToWarehouseAsync(
    currentLocation: LocationCoordinate,
    destination: Warehouse,
    originName: string = 'Current Location'
  ): Promise<Route> {
    // 1. Try Google Maps Directions API
    const googleRoute = await fetchGoogleDirections(
      currentLocation,
      { latitude: destination.latitude, longitude: destination.longitude },
      destination.name
    );

    if (googleRoute) {
      return googleRoute;
    }

    // 2. Fallback to local high-fidelity Telangana highway routes
    return this.getRouteToWarehouse(currentLocation, destination, originName);
  }

  /**
   * Synchronous / fallback route generator
   */
  public getRouteToWarehouse(
    currentLocation: LocationCoordinate,
    destination: Warehouse,
    originName: string = 'Current Location'
  ): Route {
    let waypoints: LocationCoordinate[] = [];

    // Check if we have high-fidelity precomputed corridor waypoints
    const isDestWarangal = destination.id === 'WH-WAR-01';
    const isDestMedchal = destination.id === 'WH-HYD-02';
    const isDestSuryapet = destination.id === 'WH-SYP-01';

    // Near Hyderabad central
    const nearHyd =
      calculateDistance(currentLocation, { latitude: 17.3850, longitude: 78.4867 }) < 15;
    // Near Medchal recovery
    const nearMedchal =
      calculateDistance(currentLocation, { latitude: 17.6297, longitude: 78.4815 }) < 10;

    if (nearHyd && isDestWarangal) {
      waypoints = [...ROUTE_HYD_TO_WARANGAL_WAYPOINTS];
    } else if (nearHyd && isDestMedchal) {
      waypoints = [...ROUTE_HYD_TO_MEDCHAL_WAYPOINTS];
    } else if (nearMedchal && isDestWarangal) {
      waypoints = [...ROUTE_MEDCHAL_TO_WARANGAL_WAYPOINTS];
    } else if (nearHyd && isDestSuryapet) {
      waypoints = [...ROUTE_HYD_TO_SURYAPET_WAYPOINTS];
    } else {
      // General dynamic route across Telangana warehouses
      const destCoord: LocationCoordinate = {
        latitude: destination.latitude,
        longitude: destination.longitude,
      };
      waypoints = [
        currentLocation,
        ...buildInterpolatedRouteWaypoints(currentLocation, destCoord, 16),
        destCoord,
      ];
    }

    return createRoute(
      'CURR',
      destination.id,
      originName,
      destination.name,
      waypoints
    );
  }

  /**
   * Distance in km between two coordinates
   */
  public getDistanceKm(from: LocationCoordinate, to: LocationCoordinate): number {
    return Math.round(calculateDistance(from, to) * 10) / 10;
  }

  /**
   * Estimated Travel Time in minutes (assuming average truck speed 55 km/h)
   */
  public getETA(distanceKm: number, averageSpeedKmh: number = 55): number {
    return Math.max(1, Math.round((distanceKm / averageSpeedKmh) * 60));
  }

  /**
   * Bearing in degrees
   */
  public getBearing(from: LocationCoordinate, to: LocationCoordinate): number {
    return calculateBearing(from, to);
  }

  /**
   * Checks if driver has arrived within geofence radius of destination
   */
  public hasArrivedAtWarehouse(
    currentLocation: LocationCoordinate,
    warehouse: Warehouse,
    thresholdMeters: number = 400
  ): boolean {
    return isWithinRadius(
      currentLocation,
      { latitude: warehouse.latitude, longitude: warehouse.longitude },
      thresholdMeters
    );
  }

  /**
   * Launches native Google Maps Turn-by-Turn navigation app
   */
  public async launchGoogleNavigation(
    currentLocation: LocationCoordinate,
    destination: Warehouse
  ): Promise<boolean> {
    return launchExternalGoogleMapsNavigation(
      currentLocation,
      { latitude: destination.latitude, longitude: destination.longitude },
      destination.name
    );
  }

  /**
   * Finds the closest upcoming maneuver along route based on current position
   */
  public getNextManeuver(route: Route, remainingDistanceKm: number): string {
    if (route.maneuvers && route.maneuvers.length > 0) {
      const stepIndex = Math.min(
        route.maneuvers.length - 1,
        Math.floor((1 - remainingDistanceKm / Math.max(1, route.distanceKm)) * route.maneuvers.length)
      );
      if (route.maneuvers[stepIndex]) {
        return route.maneuvers[stepIndex].instruction;
      }
    }

    if (remainingDistanceKm <= 0.4) {
      return `Approaching Gate 1 at ${route.destinationName}`;
    }
    if (remainingDistanceKm <= 3.0) {
      return `Prepare to exit freight highway for ${route.destinationName}`;
    }
    if (remainingDistanceKm <= 15.0) {
      return `Continue on freight corridor towards ${route.destinationName}`;
    }
    return `Stay on primary highway (${route.name})`;
  }
}

export const navigationService = new NavigationService();
