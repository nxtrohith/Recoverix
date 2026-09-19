import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getActiveIncidents,
  getDriverCallStatus,
  getGraph,
  getShipment,
  getVehicle,
  getVehicles,
  pickupRecovery,
  resolveRecovery,
} from '../services/api';
import { DEMO_DRIVERS } from '../config/drivers';
import { POLL_INTERVAL_MS } from '../config/theme';
import { buildNodeMap, resolveDirections, type DirectionsResult } from '../services/directions';
import { classifyProximity, metersToTarget } from '../services/geofence';
import { mockGps } from '../services/mockGps';
import {
  deriveMissionStatus,
  isRecoveryMission,
  type GraphNode,
  type Incident,
  type LatLng,
  type MissionStatus,
  type Vehicle,
} from '../services/mission';
import {
  acknowledgeIncident,
  loadAcknowledgedIncidents,
  loadActiveDriver,
  saveActiveDriver,
  clearActiveDriver,
  type ActiveDriverSession,
} from '../services/session';
import { speakMissionTransition } from '../services/voiceGuidance';

export type ResolvedDriver = ActiveDriverSession & {
  vehicle: Vehicle;
  locationLabel: string;
};

export function useDriverRoster() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<ResolvedDriver[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getVehicles();
      const vehicles: Vehicle[] = data.vehicles || [];
      const byNumber = new Map(vehicles.map((v) => [v.vehicleNumber, v]));
      const byDriverId = new Map(
        vehicles.filter((v) => v.driverId).map((v) => [String(v.driverId), v]),
      );

      const resolved: ResolvedDriver[] = DEMO_DRIVERS.map((profile) => {
        const vehicle =
          byDriverId.get(profile.driverId) ||
          byNumber.get(profile.preferredVehicleNumber) ||
          vehicles.find((v) => v.driverName === profile.name);

        if (!vehicle) {
          return null;
        }
        return {
          driverId: profile.driverId,
          name: vehicle.driverName || profile.name,
          phone: vehicle.phone || profile.phone,
          vehicleId: vehicle.id,
          vehicleNumber: vehicle.vehicleNumber,
          vehicle,
          locationLabel: vehicle.currentLocationName || vehicle.currentNode || 'Unknown hub',
        };
      }).filter(Boolean) as ResolvedDriver[];

      if (resolved.length < 3) {
        setError(
          `Only found ${resolved.length}/3 demo driver vehicles. Run: npm run seed:demo-drivers`,
        );
      }
      setDrivers(resolved);
    } catch (err: any) {
      setError(err?.message || 'Failed to load vehicles');
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { loading, error, drivers, refresh };
}

export function useDriverCockpit() {
  const [session, setSession] = useState<ActiveDriverSession | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [incident, setIncident] = useState<Incident | null>(null);
  const [shipment, setShipment] = useState<any>(null);
  const [callStatus, setCallStatus] = useState<any>(null);
  const [acknowledgedIds, setAcknowledgedIds] = useState<string[]>([]);
  const [missionAccepted, setMissionAccepted] = useState(false);
  const [position, setPosition] = useState<LatLng | null>(null);
  const [route, setRoute] = useState<DirectionsResult | null>(null);
  const [nodeMap, setNodeMap] = useState<Map<string, GraphNode>>(new Map());
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const lastStatus = useRef<MissionStatus>('NORMAL');
  const simStarted = useRef(false);

  const bootstrap = useCallback(async () => {
    const saved = await loadActiveDriver();
    const acks = await loadAcknowledgedIncidents();
    setAcknowledgedIds(acks);
    if (saved) setSession(saved);
    try {
      const graph = await getGraph();
      setNodeMap(buildNodeMap(graph.nodes || []));
    } catch {
      // graph optional at boot
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const selectDriver = useCallback(async (driver: ResolvedDriver) => {
    const next: ActiveDriverSession = {
      driverId: driver.driverId,
      name: driver.name,
      phone: driver.phone,
      vehicleId: driver.vehicleId,
      vehicleNumber: driver.vehicleNumber,
    };
    await saveActiveDriver(next);
    setSession(next);
    setVehicle(driver.vehicle);
    setMissionAccepted(false);
    setIncident(null);
  }, []);

  const signOut = useCallback(async () => {
    await clearActiveDriver();
    mockGps.stop();
    setSession(null);
    setVehicle(null);
    setIncident(null);
    setMissionAccepted(false);
  }, []);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const [v, incidentsRes] = await Promise.all([
        getVehicle(session.vehicleId),
        getActiveIncidents(),
      ]);
      setVehicle(v);
      setNetworkError(null);

      const incidents: Incident[] = incidentsRes.incidents || [];
      const mineAll = incidents.filter(
        (i) =>
          i.recoveryVehicleId === session.vehicleId ||
          i.recoveryVehicleNumber === session.vehicleNumber,
      );
      // Prefer actively assigned missions over pickup-confirmed / others
      const mine =
        mineAll.find((i) => (i.status || '').toUpperCase() === 'ASSIGNED') ||
        mineAll.find((i) => (i.status || '').toUpperCase() === 'PICKUP_CONFIRMED') ||
        mineAll[0] ||
        null;

      setIncident(mine);

      if (mine?.shipmentId) {
        try {
          const ship = await getShipment(mine.shipmentId);
          setShipment(ship);
        } catch {
          setShipment(null);
        }
        try {
          const call = await getDriverCallStatus(
            mine.shipmentTrackingNumber || mine.shipmentId,
          );
          setCallStatus(call);
        } catch {
          setCallStatus(null);
        }
      } else {
        setShipment(null);
        setCallStatus(null);
      }

      // Seed GPS from vehicle hub if needed
      const coords = v.coordinates;
      if (coords?.latitude != null && coords?.longitude != null && !position) {
        const start = { latitude: coords.latitude, longitude: coords.longitude };
        mockGps.setPosition(start);
        setPosition(start);
      }
    } catch (err: any) {
      setNetworkError(err?.message || 'Sync failed');
    }
  }, [session, position]);

  useEffect(() => {
    if (!session) return;
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [session, refresh]);

  useEffect(() => mockGps.subscribe(setPosition), []);

  const acknowledged = Boolean(
    incident && (acknowledgedIds.includes(incident.id) || missionAccepted),
  );

  const missionStatus = useMemo(
    () => deriveMissionStatus(incident, { acknowledged }),
    [incident, acknowledged],
  );

  const sameDestination = useMemo(() => {
    if (!vehicle?.destinationNode || !incident?.destinationNode) return false;
    return vehicle.destinationNode === incident.destinationNode;
  }, [vehicle, incident]);

  const pickupNode = incident?.pickupNode || incident?.hubName || null;
  const finalDestinationNode =
    incident?.destinationNode ||
    shipment?.destinationNode ||
    vehicle?.destinationNode ||
    null;

  const includePickup =
    isRecoveryMission(missionStatus) &&
    missionStatus !== 'PICKUP_CONFIRMED' &&
    missionStatus !== 'DELIVERING';

  // Navigation targets
  const pickupCoord = useMemo(() => {
    if (!pickupNode) return null;
    const n = nodeMap.get(pickupNode);
    if (!n || n.latitude == null || n.longitude == null) return null;
    return { latitude: n.latitude, longitude: n.longitude };
  }, [pickupNode, nodeMap]);

  const destCoord = useMemo(() => {
    if (!finalDestinationNode) return null;
    const n = nodeMap.get(finalDestinationNode);
    if (!n || n.latitude == null || n.longitude == null) return null;
    return { latitude: n.latitude, longitude: n.longitude };
  }, [finalDestinationNode, nodeMap]);

  const truckDestCoord = useMemo(() => {
    if (!vehicle?.destinationNode) return null;
    const n = nodeMap.get(vehicle.destinationNode);
    if (!n || n.latitude == null || n.longitude == null) return null;
    return { latitude: n.latitude, longitude: n.longitude };
  }, [vehicle, nodeMap]);

  const activeTarget = includePickup ? pickupCoord : destCoord || truckDestCoord;
  const proximity = classifyProximity(position, activeTarget);
  const distanceToTarget = metersToTarget(position, activeTarget);

  // Recalculate route when mission / position origin changes significantly
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!position || nodeMap.size === 0) return;

      const pathNodes =
        includePickup
          ? incident?.vehicleToPickupPath ||
            incident?.recoveryPath ||
            vehicle?.currentPath ||
            []
          : incident?.vehicleToDestinationPath ||
            incident?.recoveryPath ||
            vehicle?.currentPath ||
            [];

      const next = await resolveDirections({
        origin: position,
        destinationNode: isRecoveryMission(missionStatus)
          ? finalDestinationNode
          : vehicle?.destinationNode,
        pickupNode,
        pathNodes: pathNodes || [],
        includePickup,
        nodeMap,
      });
      if (!cancelled) {
        setRoute(next);
        if (next?.polyline?.length) {
          mockGps.setRoute(next.polyline, 0);
          if (!simStarted.current) {
            mockGps.start(1400);
            simStarted.current = true;
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally omit `position` from deps to avoid route thrash —
    // recalculate on mission/target changes; mock GPS walks the polyline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    nodeMap,
    includePickup,
    missionStatus,
    pickupNode,
    finalDestinationNode,
    vehicle?.destinationNode,
    incident?.id,
    position?.latitude && position?.longitude ? 'ready' : 'waiting',
  ]);

  useEffect(() => {
    if (missionStatus !== lastStatus.current) {
      speakMissionTransition(missionStatus);
      lastStatus.current = missionStatus;
    }
  }, [missionStatus]);

  const acceptRecovery = useCallback(async () => {
    if (!incident) return;
    await acknowledgeIncident(incident.id);
    setAcknowledgedIds((prev) =>
      prev.includes(incident.id) ? prev : [...prev, incident.id],
    );
    setMissionAccepted(true);
    setActionMessage('Mission accepted — navigating to pickup warehouse.');
  }, [incident]);

  const confirmPickup = useCallback(async () => {
    if (!incident) return;
    setBusy(true);
    setActionMessage(null);
    try {
      const id = incident.shipmentTrackingNumber || incident.shipmentId;
      await pickupRecovery(id);
      setActionMessage('Pickup confirmed. Heading to final destination.');
      await refresh();
    } catch (err: any) {
      setActionMessage(err?.message || 'Pickup confirmation failed');
    } finally {
      setBusy(false);
    }
  }, [incident, refresh]);

  const confirmResolve = useCallback(async () => {
    if (!incident) return;
    setBusy(true);
    setActionMessage(null);
    try {
      const id = incident.shipmentTrackingNumber || incident.shipmentId;
      await resolveRecovery(id);
      setActionMessage('Shipment resolved. Mission complete.');
      await refresh();
    } catch (err: any) {
      setActionMessage(err?.message || 'Resolve failed');
    } finally {
      setBusy(false);
    }
  }, [incident, refresh]);

  const recoveryAlertVisible =
    Boolean(incident) &&
    (incident?.status || '').toUpperCase() === 'ASSIGNED' &&
    !acknowledged;

  return {
    session,
    vehicle,
    incident,
    shipment,
    callStatus,
    missionStatus,
    sameDestination,
    position,
    route,
    proximity,
    distanceToTarget,
    pickupCoord,
    destCoord,
    truckDestCoord,
    includePickup,
    networkError,
    busy,
    actionMessage,
    recoveryAlertVisible,
    showRecoveryAlert: recoveryAlertVisible,
    selectDriver,
    signOut,
    refresh,
    acceptRecovery,
    confirmPickup,
    confirmResolve,
    advanceGps: () => mockGps.advance(4),
    jumpNearTarget: () => mockGps.jumpNearEnd(1),
  };
}
