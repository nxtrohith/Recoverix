import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import {
  LocationCoordinate,
  Warehouse,
  Route,
  NavigationMode,
  RecoveryAssignment,
  DriverProfile,
  NavigationGuidanceState,
} from '../types/navigation';
import { TELANGANA_WAREHOUSES, getWarehouseById } from '../data/warehouses';
import { MOCK_DRIVER, INITIAL_DRIVER_LOCATION } from '../data/mockDriver';
import { locationService } from '../services/locationService';
import { navigationService } from '../services/navigationService';
import { recoveryService } from '../services/mockRecoveryService';
import { guidanceEngine } from '../services/guidanceService';
import { voiceGuidanceService } from '../services/voiceGuidanceService';
import {
  ROUTE_HYD_TO_WARANGAL_WAYPOINTS,
  ROUTE_HYD_TO_MEDCHAL_WAYPOINTS,
  ROUTE_MEDCHAL_TO_WARANGAL_WAYPOINTS,
} from '../data/routes';

interface NavigationContextType {
  driver: DriverProfile;
  driverLocation: LocationCoordinate;
  warehouses: Warehouse[];
  mode: NavigationMode;
  selectedWarehouse: Warehouse | null;
  destinationWarehouse: Warehouse | null;
  recoveryWarehouse: Warehouse | null;
  activeRoute: Route | null;
  recoveryAssignment: RecoveryAssignment | null;

  // Turn-by-Turn Guidance & Voice Navigation
  guidanceState: NavigationGuidanceState;
  isVoiceMuted: boolean;
  isRerouting: boolean;
  gpsSignalStatus: 'ACTIVE' | 'SEARCHING' | 'DENIED' | 'SIMULATING';
  toggleVoiceMute: () => boolean;
  recalculateRoute: () => Promise<void>;

  // Simulation telemetry
  isSimulating: boolean;
  isSimPaused: boolean;
  simSpeed: number;
  simProgress: number;

  // Modals & Banners
  recoveryAlertVisible: boolean;
  arrivalModalVisible: boolean;
  deliveryCompleteVisible: boolean;

  // Actions
  selectWarehouse: (w: Warehouse) => void;
  startNavigation: (target?: Warehouse) => void;
  stopNavigation: () => void;
  triggerRecoveryAlert: () => void;
  acceptRecovery: () => void;
  confirmPickup: () => void;
  finishDelivery: () => void;
  dismissRecoveryAlert: () => void;

  // Navigator View & Google Maps Integration
  isNavigatorFollowing: boolean;
  googleMapsStatus: 'CONNECTED' | 'FALLBACK_MODE';
  toggleNavigatorFollowing: () => void;
  launchExternalNavigation: () => Promise<boolean>;

  // Simulation Controls
  startSimulation: () => void;
  pauseSimulation: () => void;
  resumeSimulation: () => void;
  resetSimulation: () => void;
  setSimulationSpeed: (speed: number) => void;
  toggleSimulationMode: () => void;
  recenterMap: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const NavigationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [driver] = useState<DriverProfile>(MOCK_DRIVER);
  const [driverLocation, setDriverLocation] = useState<LocationCoordinate>({ ...INITIAL_DRIVER_LOCATION });
  const [warehouses] = useState<Warehouse[]>(TELANGANA_WAREHOUSES);

  // Default initial destination: Warangal Regional Depot
  const warangalWh = getWarehouseById('WH-WAR-01') || TELANGANA_WAREHOUSES[3];
  const medchalWh = getWarehouseById('WH-HYD-02') || TELANGANA_WAREHOUSES[1];

  const [mode, setMode] = useState<NavigationMode>('IDLE');
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(warangalWh);
  const [destinationWarehouse, setDestinationWarehouse] = useState<Warehouse | null>(warangalWh);
  const [recoveryWarehouse, setRecoveryWarehouse] = useState<Warehouse | null>(medchalWh);
  const [activeRoute, setActiveRoute] = useState<Route | null>(null);
  const [recoveryAssignment, setRecoveryAssignment] = useState<RecoveryAssignment | null>(null);

  // Turn-by-Turn Guidance State
  const [isVoiceMuted, setIsVoiceMuted] = useState<boolean>(false);
  const [isRerouting, setIsRerouting] = useState<boolean>(false);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [guidanceState, setGuidanceState] = useState<NavigationGuidanceState>({
    currentStepIndex: 0,
    currentManeuver: null,
    nextManeuver: null,
    distanceToNextManeuverMeters: 0,
    remainingDistanceKm: 0,
    remainingMinutes: 0,
    routeProgressPercent: 0,
    isOffRoute: false,
    isRerouting: false,
    isVoiceMuted: false,
    gpsStatus: 'SEARCHING',
    routeSource: 'GOOGLE_DIRECTIONS',
    deviationDistanceMeters: 0,
  });

  // Simulation state
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isSimPaused, setIsSimPaused] = useState<boolean>(false);
  const [simSpeed, setSimSpeed] = useState<number>(3);
  const [simProgress, setSimProgress] = useState<number>(0);

  // Navigator follow mode & Google Maps status
  const [isNavigatorFollowing, setIsNavigatorFollowing] = useState<boolean>(true);
  const [googleMapsStatus, setGoogleMapsStatus] = useState<'CONNECTED' | 'FALLBACK_MODE'>('CONNECTED');

  // Modals
  const [recoveryAlertVisible, setRecoveryAlertVisible] = useState<boolean>(false);
  const [arrivalModalVisible, setArrivalModalVisible] = useState<boolean>(false);
  const [deliveryCompleteVisible, setDeliveryCompleteVisible] = useState<boolean>(false);

  // Ref to prevent reroute race conditions
  const isReroutingRef = useRef<boolean>(false);
  const activeRouteRef = useRef<Route | null>(null);
  activeRouteRef.current = activeRoute;

  const targetWarehouse =
    mode === 'RECOVERY_LEG_1' ? recoveryWarehouse : destinationWarehouse;
  const targetWarehouseRef = useRef<Warehouse | null>(targetWarehouse);
  targetWarehouseRef.current = targetWarehouse;

  const modeRef = useRef<NavigationMode>(mode);
  modeRef.current = mode;

  const isVoiceMutedRef = useRef<boolean>(isVoiceMuted);
  isVoiceMutedRef.current = isVoiceMuted;

  const currentStepIndexRef = useRef<number>(currentStepIndex);
  currentStepIndexRef.current = currentStepIndex;

  const driverLocationRef = useRef<LocationCoordinate>(driverLocation);
  driverLocationRef.current = driverLocation;

  // 1. Recalculate route helper (used on manual request or auto off-route deviation)
  const recalculateRoute = useCallback(async () => {
    const target = targetWarehouseRef.current;
    if (!target || isReroutingRef.current) return;

    isReroutingRef.current = true;
    setIsRerouting(true);

    try {
      const newRoute = await navigationService.getRouteToWarehouseAsync(
        driverLocationRef.current,
        target,
        'Current Position'
      );

      guidanceEngine.resetDeviation();
      setCurrentStepIndex(0);
      setActiveRoute(newRoute);
      setGoogleMapsStatus(
        newRoute.id.startsWith('GOOGLE') ? 'CONNECTED' : 'FALLBACK_MODE'
      );

      voiceGuidanceService.announceRerouteCompleted(target.name);
    } catch {
      // Fallback cleanly
    } finally {
      setIsRerouting(false);
      isReroutingRef.current = false;
    }
  }, []);

  const recalculateRouteRef = useRef(recalculateRoute);
  recalculateRouteRef.current = recalculateRoute;

  // 2. Listen to location changes from locationService (subscribes ONCE)
  useEffect(() => {
    const unsubscribe = locationService.watchLocation((loc) => {
      setDriverLocation(loc);

      const gpsStatus = locationService.getGpsStatus();
      const currentRoute = activeRouteRef.current;
      const currentMode = modeRef.current;
      const currentTarget = targetWarehouseRef.current;
      const currentMuted = isVoiceMutedRef.current;
      const stepIdx = currentStepIndexRef.current;

      const isNavigating =
        currentMode === 'NAVIGATING' ||
        currentMode === 'RECOVERY_LEG_1' ||
        currentMode === 'RECOVERY_LEG_2';

      if (isNavigating && currentRoute && currentTarget) {
        // Run Turn-by-Turn Guidance Engine
        const updated = guidanceEngine.evaluateGuidance(
          loc,
          currentRoute,
          stepIdx,
          currentTarget,
          currentMuted,
          gpsStatus
        );

        setCurrentStepIndex(updated.currentStepIndex);
        setGuidanceState({
          ...updated,
          isRerouting: isReroutingRef.current,
        });

        // Trigger voice announcement when approaching maneuver
        if (updated.currentManeuver && !isReroutingRef.current) {
          voiceGuidanceService.handleManeuverProximity(
            updated.currentManeuver,
            updated.distanceToNextManeuverMeters
          );
        }

        // Automatic Off-Route Detection & Auto Reroute
        if (updated.isOffRoute && !isReroutingRef.current) {
          voiceGuidanceService.announceRerouting();
          recalculateRouteRef.current();
        }

        // Geofenced Arrival Check
        if (guidanceEngine.checkArrival(loc, currentTarget, 150)) {
          voiceGuidanceService.announceArrival(currentTarget.name);

          if (currentMode === 'RECOVERY_LEG_1') {
            setArrivalModalVisible(true);
            setMode('AT_RECOVERY');
            locationService.pauseSimulation();
            setIsSimPaused(true);
          } else if (currentMode === 'RECOVERY_LEG_2') {
            setDeliveryCompleteVisible(true);
            setMode('DELIVERED');
            locationService.pauseSimulation();
            setIsSimPaused(true);
          } else if (currentMode === 'NAVIGATING') {
            setArrivalModalVisible(true);
            locationService.pauseSimulation();
            setIsSimPaused(true);
          }
        }
      } else {
        // IDLE state guidance fallback
        setGuidanceState((prev) => ({
          ...prev,
          gpsStatus,
          remainingDistanceKm: currentRoute ? currentRoute.distanceKm : 0,
          remainingMinutes: currentRoute ? currentRoute.estimatedMinutes : 0,
        }));
      }
    });

    return unsubscribe;
  }, []);

  // 3. Subscribe to recovery assignments
  useEffect(() => {
    const unsub = recoveryService.subscribe((assign) => {
      setRecoveryAssignment(assign);
    });
    return unsub;
  }, []);

  // 4. Compute initial route whenever destination changes in IDLE or NAVIGATING
  useEffect(() => {
    let isCancelled = false;
    if (destinationWarehouse && (mode === 'IDLE' || mode === 'NAVIGATING')) {
      navigationService
        .getRouteToWarehouseAsync(
          driverLocation,
          destinationWarehouse,
          'Hyderabad Central DC'
        )
        .then((route) => {
          if (!isCancelled) {
            setActiveRoute(route);
            setGoogleMapsStatus(
              route.id.startsWith('GOOGLE') ? 'CONNECTED' : 'FALLBACK_MODE'
            );
          }
        });
    }
    return () => {
      isCancelled = true;
    };
  }, [destinationWarehouse]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const toggleVoiceMute = useCallback((): boolean => {
    const next = voiceGuidanceService.toggleMute();
    setIsVoiceMuted(next);
    setGuidanceState((prev) => ({ ...prev, isVoiceMuted: next }));
    return next;
  }, []);

  const selectWarehouse = useCallback(
    (w: Warehouse) => {
      setSelectedWarehouse(w);
      setDestinationWarehouse(w);
      navigationService
        .getRouteToWarehouseAsync(driverLocation, w, 'Current Location')
        .then((route) => {
          setActiveRoute(route);
          setGoogleMapsStatus(
            route.id.startsWith('GOOGLE') ? 'CONNECTED' : 'FALLBACK_MODE'
          );
        });
    },
    [driverLocation]
  );

  const startNavigation = useCallback((target?: Warehouse) => {
    const dest = target || destinationWarehouse;
    if (!dest) return;
    setDestinationWarehouse(dest);
    setMode('NAVIGATING');
    setIsNavigatorFollowing(true);
    setCurrentStepIndex(0);
    guidanceEngine.resetDeviation();

    navigationService
      .getRouteToWarehouseAsync(driverLocation, dest, 'Current Location')
      .then((route) => {
        setActiveRoute(route);
        setGoogleMapsStatus(
          route.id.startsWith('GOOGLE') ? 'CONNECTED' : 'FALLBACK_MODE'
        );

        const firstManeuver = route.maneuvers?.[0]?.instruction || 'Proceed onto route';
        voiceGuidanceService.speak(
          `Starting route to ${dest.name}. ${firstManeuver}.`,
          { force: true, dedupKey: `start-${dest.id}` }
        );
      });
  }, [destinationWarehouse, driverLocation]);

  const launchExternalNavigation = useCallback(async (): Promise<boolean> => {
    if (!destinationWarehouse) return false;
    return navigationService.launchGoogleNavigation(driverLocation, destinationWarehouse);
  }, [driverLocation, destinationWarehouse]);

  const toggleNavigatorFollowing = useCallback(() => {
    setIsNavigatorFollowing((prev) => !prev);
  }, []);

  const stopNavigation = useCallback(() => {
    setMode('IDLE');
    voiceGuidanceService.stop();
    locationService.stopSimulation();
    setIsSimulating(false);
    setIsSimPaused(false);
    setSimProgress(0);
  }, []);

  const triggerRecoveryAlert = useCallback(() => {
    recoveryService.resetRecovery();
    setRecoveryAlertVisible(true);
    setMode('RECOVERY_ALERT');
  }, []);

  const dismissRecoveryAlert = useCallback(() => {
    setRecoveryAlertVisible(false);
    if (mode === 'RECOVERY_ALERT') {
      setMode('IDLE');
    }
  }, [mode]);

  const acceptRecovery = useCallback(() => {
    setRecoveryAlertVisible(false);
    if (recoveryAssignment) {
      recoveryService.acceptRecovery(recoveryAssignment.id);
      recoveryService.markEnRouteLeg1(recoveryAssignment.id);
    }
    setMode('RECOVERY_LEG_1');

    // Route for Leg 1: Driver -> Medchal Recovery Hub
    const leg1Dest = recoveryWarehouse || medchalWh;
    setDestinationWarehouse(leg1Dest);
    setCurrentStepIndex(0);
    guidanceEngine.resetDeviation();

    navigationService
      .getRouteToWarehouseAsync(driverLocation, leg1Dest, 'Current Position')
      .then((leg1Route) => {
        setActiveRoute(leg1Route);
        setGoogleMapsStatus(
          leg1Route.id.startsWith('GOOGLE') ? 'CONNECTED' : 'FALLBACK_MODE'
        );

        voiceGuidanceService.speak(
          `Emergency recovery accepted. Diverting to ${leg1Dest.name} for cargo pickup.`,
          { force: true, dedupKey: 'recovery-leg1-start' }
        );
      });

    // Auto-start simulation for demonstration convenience
    setIsSimulating(true);
    setIsSimPaused(false);
    setSimProgress(0);
    locationService.startSimulation(
      ROUTE_HYD_TO_MEDCHAL_WAYPOINTS,
      simSpeed,
      (prog) => setSimProgress(prog)
    );
  }, [recoveryAssignment, recoveryWarehouse, medchalWh, driverLocation, simSpeed]);

  const confirmPickup = useCallback(() => {
    setArrivalModalVisible(false);
    if (recoveryAssignment) {
      recoveryService.confirmPickup(recoveryAssignment.id);
      recoveryService.markEnRouteLeg2(recoveryAssignment.id);
    }
    setMode('RECOVERY_LEG_2');

    // Route for Leg 2: Medchal Recovery Hub -> Warangal Regional Depot
    const finalDest = warangalWh;
    setDestinationWarehouse(finalDest);
    setCurrentStepIndex(0);
    guidanceEngine.resetDeviation();

    navigationService
      .getRouteToWarehouseAsync(driverLocation, finalDest, 'Medchal Recovery Hub')
      .then((leg2Route) => {
        setActiveRoute(leg2Route);
        setGoogleMapsStatus(
          leg2Route.id.startsWith('GOOGLE') ? 'CONNECTED' : 'FALLBACK_MODE'
        );

        voiceGuidanceService.speak(
          `Cargo loaded and secured. Navigating Leg 2 to ${finalDest.name}.`,
          { force: true, dedupKey: 'recovery-leg2-start' }
        );
      });

    // Continue simulation from Medchal to Warangal
    setIsSimulating(true);
    setIsSimPaused(false);
    setSimProgress(0);
    locationService.startSimulation(
      ROUTE_MEDCHAL_TO_WARANGAL_WAYPOINTS,
      simSpeed,
      (prog) => setSimProgress(prog)
    );
  }, [recoveryAssignment, warangalWh, driverLocation, simSpeed]);

  const finishDelivery = useCallback(() => {
    setDeliveryCompleteVisible(false);
    if (recoveryAssignment) {
      recoveryService.completeRecovery(recoveryAssignment.id);
    }
    setMode('IDLE');
    setDestinationWarehouse(warangalWh);
    setIsSimulating(false);
    setIsSimPaused(false);
    setSimProgress(0);
    voiceGuidanceService.speak('Delivery completed and checked into depot inventory.', {
      force: true,
      dedupKey: 'delivery-finished',
    });
  }, [recoveryAssignment, warangalWh]);

  // ── Simulation Engine Controls ───────────────────────────────────────────────

  const startSimulation = useCallback(() => {
    if (!activeRoute || activeRoute.waypoints.length === 0) return;

    setIsSimulating(true);
    setIsSimPaused(false);
    setSimProgress(0);

    let waypoints = activeRoute.waypoints;
    if (mode === 'RECOVERY_LEG_1') {
      waypoints = ROUTE_HYD_TO_MEDCHAL_WAYPOINTS;
    } else if (mode === 'RECOVERY_LEG_2') {
      waypoints = ROUTE_MEDCHAL_TO_WARANGAL_WAYPOINTS;
    } else if (destinationWarehouse?.id === 'WH-WAR-01') {
      waypoints = ROUTE_HYD_TO_WARANGAL_WAYPOINTS;
    }

    locationService.startSimulation(waypoints, simSpeed, (prog) => {
      setSimProgress(prog);
    });
  }, [activeRoute, mode, destinationWarehouse, simSpeed]);

  const pauseSimulation = useCallback(() => {
    locationService.pauseSimulation();
    setIsSimPaused(true);
  }, []);

  const resumeSimulation = useCallback(() => {
    locationService.resumeSimulation();
    setIsSimPaused(false);
  }, []);

  const resetSimulation = useCallback(() => {
    locationService.resetSimulation();
    setIsSimPaused(false);
    setSimProgress(0);
  }, []);

  const setSimulationSpeed = useCallback((speed: number) => {
    setSimSpeed(speed);
    locationService.setSimulationSpeed(speed);
  }, []);

  const toggleSimulationMode = useCallback(() => {
    const next = !isSimulating;
    setIsSimulating(next);
    locationService.setSimulating(next);
    if (!next) {
      locationService.stopSimulation();
      setIsSimPaused(false);
      setSimProgress(0);
    }
  }, [isSimulating]);

  const recenterMap = useCallback(() => {
    setIsNavigatorFollowing(true);
  }, []);

  return (
    <NavigationContext.Provider
      value={{
        driver,
        driverLocation,
        warehouses,
        mode,
        selectedWarehouse,
        destinationWarehouse,
        recoveryWarehouse,
        activeRoute,
        recoveryAssignment,
        guidanceState,
        isVoiceMuted,
        isRerouting,
        gpsSignalStatus: locationService.getGpsStatus(),
        toggleVoiceMute,
        recalculateRoute,
        isSimulating,
        isSimPaused,
        simSpeed,
        simProgress,
        recoveryAlertVisible,
        arrivalModalVisible,
        deliveryCompleteVisible,
        isNavigatorFollowing,
        googleMapsStatus,
        toggleNavigatorFollowing,
        launchExternalNavigation,
        selectWarehouse,
        startNavigation,
        stopNavigation,
        triggerRecoveryAlert,
        acceptRecovery,
        confirmPickup,
        finishDelivery,
        dismissRecoveryAlert,
        startSimulation,
        pauseSimulation,
        resumeSimulation,
        resetSimulation,
        setSimulationSpeed,
        toggleSimulationMode,
        recenterMap,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigationContext = (): NavigationContextType => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigationContext must be used within a NavigationProvider');
  }
  return context;
};
