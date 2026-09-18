import * as Location from 'expo-location';
import { DriverLocationProvider, LocationCoordinate } from '../types/navigation';
import { INITIAL_DRIVER_LOCATION } from '../data/mockDriver';
import { interpolateCoordinate, calculateBearing, calculateDistanceMeters } from '../utils/distance';

export class MockDriverLocationProvider implements DriverLocationProvider {
  private currentLocation: LocationCoordinate = { ...INITIAL_DRIVER_LOCATION };
  private listeners: Set<(loc: LocationCoordinate) => void> = new Set();
  private hasGpsPermission: boolean = false;
  private watchSubscription: Location.LocationSubscription | null = null;
  private isSimulationActive: boolean = false;
  private hasReceivedRealGps: boolean = false;

  // Simulation Engine State
  private simulationWaypoints: LocationCoordinate[] = [];
  private simulationInterval: ReturnType<typeof setInterval> | null = null;
  private currentWaypointIndex: number = 0;
  private segmentProgress: number = 0; // 0 to 1 between current and next waypoint
  private simulationSpeedMultiplier: number = 1.0;
  private isSimPaused: boolean = false;

  constructor() {
    this.initGps();
  }

  public getGpsStatus(): 'ACTIVE' | 'SEARCHING' | 'DENIED' | 'SIMULATING' {
    if (this.isSimulationActive) return 'SIMULATING';
    if (!this.hasGpsPermission) return 'DENIED';
    if (this.hasReceivedRealGps) return 'ACTIVE';
    return 'SEARCHING';
  }

  /**
   * Request device GPS permissions and start passive listening if granted
   */
  public async initGps(): Promise<boolean> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      this.hasGpsPermission = status === 'granted';

      if (this.hasGpsPermission && !this.isSimulationActive) {
        const initial = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation ?? Location.Accuracy.High,
        });

        this.hasReceivedRealGps = true;
        this.currentLocation = {
          latitude: initial.coords.latitude,
          longitude: initial.coords.longitude,
          heading: initial.coords.heading && initial.coords.heading > 0 ? initial.coords.heading : 0,
          speed: initial.coords.speed ?? 0,
          accuracy: initial.coords.accuracy ?? 5,
        };
        this.notifyListeners(this.currentLocation);

        this.startGpsWatcher();
      }
      return this.hasGpsPermission;
    } catch {
      this.hasGpsPermission = false;
      return false;
    }
  }

  private async startGpsWatcher(): Promise<void> {
    if (this.watchSubscription) {
      this.watchSubscription.remove();
      this.watchSubscription = null;
    }

    try {
      this.watchSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation ?? Location.Accuracy.High,
          timeInterval: 1000,
          distanceInterval: 2,
        },
        (loc) => {
          if (this.isSimulationActive) return;

          this.hasReceivedRealGps = true;
          const prev = this.currentLocation;
          const currCoord: LocationCoordinate = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };

          // Compute bearing from movement if device compass is unavailable
          let computedHeading = loc.coords.heading ?? 0;
          if ((!computedHeading || computedHeading <= 0) && calculateDistanceMeters(prev, currCoord) > 2) {
            computedHeading = calculateBearing(prev, currCoord);
          } else if (!computedHeading) {
            computedHeading = prev.heading ?? 0;
          }

          this.currentLocation = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            heading: computedHeading,
            speed: loc.coords.speed ?? 0,
            accuracy: loc.coords.accuracy ?? 5,
          };
          this.notifyListeners(this.currentLocation);
        }
      );
    } catch {
      // Ignore background listener errors
    }
  }

  // ── DriverLocationProvider Contract ──────────────────────────────────────────

  public async getCurrentLocation(): Promise<LocationCoordinate> {
    if (this.hasGpsPermission && !this.isSimulationActive) {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        this.currentLocation = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          heading: loc.coords.heading ?? 0,
          speed: loc.coords.speed ?? 0,
        };
      } catch {
        // Fall back to current cached location
      }
    }
    return { ...this.currentLocation };
  }

  public watchLocation(callback: (location: LocationCoordinate) => void): () => void {
    this.listeners.add(callback);
    // Send immediate initial position
    callback({ ...this.currentLocation });

    return () => {
      this.listeners.delete(callback);
    };
  }

  public isSimulating(): boolean {
    return this.isSimulationActive;
  }

  public setSimulating(simulating: boolean): void {
    this.isSimulationActive = simulating;
    if (!simulating) {
      this.stopSimulation();
      if (this.hasGpsPermission) {
        this.startGpsWatcher();
      }
    }
  }

  // ── Simulation Engine ────────────────────────────────────────────────────────

  /**
   * Loads a waypoint polyline and starts moving simulated driver along it.
   */
  public startSimulation(
    waypoints: LocationCoordinate[],
    speedMultiplier: number = 1.0,
    onProgressUpdate?: (progressPercent: number) => void
  ): void {
    if (waypoints.length === 0) return;

    this.stopSimulation();
    this.isSimulationActive = true;
    this.isSimPaused = false;
    this.simulationWaypoints = waypoints;
    this.simulationSpeedMultiplier = Math.max(0.5, speedMultiplier);
    this.currentWaypointIndex = 0;
    this.segmentProgress = 0;

    // Immediately jump truck to start of route
    this.currentLocation = { ...waypoints[0] };
    this.notifyListeners(this.currentLocation);

    // Tick every 200ms (5 updates per second for silky smooth marker motion)
    const TICK_INTERVAL_MS = 200;

    this.simulationInterval = setInterval(() => {
      if (this.isSimPaused) return;

      if (this.currentWaypointIndex >= this.simulationWaypoints.length - 1) {
        // Reached end of simulation route!
        this.currentLocation = {
          ...this.simulationWaypoints[this.simulationWaypoints.length - 1],
        };
        this.notifyListeners(this.currentLocation);
        onProgressUpdate?.(100);
        this.stopSimulation();
        return;
      }

      const p1 = this.simulationWaypoints[this.currentWaypointIndex];
      const p2 = this.simulationWaypoints[this.currentWaypointIndex + 1];

      // Advance segment progress based on speed
      const step = 0.05 * this.simulationSpeedMultiplier;
      this.segmentProgress += step;

      if (this.segmentProgress >= 1) {
        this.segmentProgress = 0;
        this.currentWaypointIndex++;
      }

      const currentP1 = this.simulationWaypoints[this.currentWaypointIndex];
      const currentP2 =
        this.currentWaypointIndex < this.simulationWaypoints.length - 1
          ? this.simulationWaypoints[this.currentWaypointIndex + 1]
          : currentP1;

      const interpolated = interpolateCoordinate(currentP1, currentP2, this.segmentProgress);
      // Simulated speed ~ 60 km/h
      interpolated.speed = 16.6 * this.simulationSpeedMultiplier;

      this.currentLocation = interpolated;
      this.notifyListeners(this.currentLocation);

      if (onProgressUpdate) {
        const totalWaypoints = this.simulationWaypoints.length - 1;
        const overallPercent = Math.min(
          100,
          Math.round(((this.currentWaypointIndex + this.segmentProgress) / totalWaypoints) * 100)
        );
        onProgressUpdate(overallPercent);
      }
    }, TICK_INTERVAL_MS);
  }

  public pauseSimulation(): void {
    this.isSimPaused = true;
  }

  public resumeSimulation(): void {
    this.isSimPaused = false;
  }

  public resetSimulation(): void {
    this.stopSimulation();
    if (this.simulationWaypoints.length > 0) {
      this.currentLocation = { ...this.simulationWaypoints[0] };
      this.notifyListeners(this.currentLocation);
    }
  }

  public setSimulationSpeed(speedMultiplier: number): void {
    this.simulationSpeedMultiplier = Math.max(0.5, speedMultiplier);
  }

  public stopSimulation(): void {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    this.isSimPaused = false;
  }

  public setManualLocation(coord: LocationCoordinate): void {
    this.currentLocation = { ...coord };
    this.notifyListeners(this.currentLocation);
  }

  private notifyListeners(loc: LocationCoordinate): void {
    for (const listener of this.listeners) {
      try {
        listener({ ...loc });
      } catch (err) {
        console.error('[LocationService] Error notifying listener:', err);
      }
    }
  }
}

// Singleton export for use across app
export const locationService = new MockDriverLocationProvider();
