import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  assignRecovery,
  calculateRecovery,
  getActiveIncidents,
  getApiBaseUrl,
  getGraph,
  getHealth,
  getHubs,
  getShipment,
  getShipments,
  getVehicle,
  getVehicles,
  resolveRecovery,
  simulateIncident,
} from './api/client';
import Header from './components/Header';
import IncidentAlert from './components/IncidentAlert';
import LogisticsMap from './components/LogisticsMap';
import MetricsBar from './components/MetricsBar';
import RecoveryCandidates from './components/RecoveryCandidates';
import RecoveryPlan from './components/RecoveryPlan';
import SearchPanel from './components/SearchPanel';
import ShipmentPanel from './components/ShipmentPanel';
import VehiclePanel from './components/VehiclePanel';
import './App.css';

function errMsg(err, fallback) {
  if (err instanceof ApiError) return err.message;
  if (err?.message) return err.message;
  return fallback;
}

export default function App() {
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);

  const [graph, setGraph] = useState(null);
  const [graphLoading, setGraphLoading] = useState(true);
  const [graphError, setGraphError] = useState(null);

  const [hubs, setHubs] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [listsLoading, setListsLoading] = useState(true);
  const [listsError, setListsError] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchHint, setSearchHint] = useState('');

  const [selectedShipment, setSelectedShipment] = useState(null);
  const [shipmentLoading, setShipmentLoading] = useState(false);
  const [shipmentError, setShipmentError] = useState(null);

  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [vehicleLoading, setVehicleLoading] = useState(false);
  const [vehicleError, setVehicleError] = useState(null);

  const [recoveryAnalysis, setRecoveryAnalysis] = useState(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState(null);

  const [activeIncident, setActiveIncident] = useState(null);
  const [completionBanner, setCompletionBanner] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [driverNotification, setDriverNotification] = useState(null);

  const [focusNodeId, setFocusNodeId] = useState(null);

  const refreshHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const data = await getHealth();
      setHealth(data);
      setHealthError(null);
    } catch (err) {
      setHealth(null);
      setHealthError(errMsg(err, 'Backend unavailable'));
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    setGraphLoading(true);
    setListsLoading(true);
    setGraphError(null);
    setListsError(null);

    const results = await Promise.allSettled([
      getGraph(),
      getHubs(),
      getVehicles(),
      getShipments(),
      getActiveIncidents(),
    ]);

    const [graphRes, hubsRes, vehiclesRes, shipmentsRes, incidentsRes] = results;

    if (graphRes.status === 'fulfilled') {
      setGraph(graphRes.value);
    } else {
      setGraph(null);
      setGraphError(errMsg(graphRes.reason, 'Failed to load graph'));
    }
    setGraphLoading(false);

    const listErrors = [];
    if (hubsRes.status === 'fulfilled') {
      setHubs(hubsRes.value?.hubs || []);
    } else {
      setHubs([]);
      listErrors.push(`hubs: ${errMsg(hubsRes.reason, 'failed')}`);
    }
    if (vehiclesRes.status === 'fulfilled') {
      setVehicles(vehiclesRes.value?.vehicles || []);
    } else {
      setVehicles([]);
      listErrors.push(`vehicles: ${errMsg(vehiclesRes.reason, 'failed')}`);
    }
    if (shipmentsRes.status === 'fulfilled') {
      setShipments(shipmentsRes.value?.shipments || []);
    } else {
      setShipments([]);
      listErrors.push(`shipments: ${errMsg(shipmentsRes.reason, 'failed')}`);
    }
    if (incidentsRes.status === 'fulfilled') {
      const incidents = incidentsRes.value?.incidents || [];
      // If a shipment is already selected, keep its incident; else show newest
      setActiveIncident((prev) => {
        if (prev) {
          const match = incidents.find((i) => i.incidentId === prev.incidentId);
          return match || prev;
        }
        return incidents[0] || null;
      });
    }
    setListsError(listErrors.length ? listErrors.join(' · ') : null);
    setListsLoading(false);
  }, []);

  useEffect(() => {
    refreshHealth();
    loadDashboard();
    const timer = setInterval(refreshHealth, 30000);
    return () => clearInterval(timer);
  }, [refreshHealth, loadDashboard]);

  const loadShipment = useCallback(async (id) => {
    if (!id) return;
    setShipmentLoading(true);
    setShipmentError(null);
    setRecoveryError(null);
    setCompletionBanner(null);
    try {
      const data = await getShipment(id);
      setSelectedShipment(data);
      const incident = data.activeIncident || null;
      setActiveIncident(
        incident && incident.status !== 'RESOLVED' ? incident : incident,
      );
      if (incident?.status === 'RESOLVED') {
        setCompletionBanner({
          trackingNumber: data.trackingNumber,
          recoveryVehicleNumber: incident.recoveryVehicleNumber,
          recoveryRouteLabel: (incident.recoveryPath || []).join(' → ') || null,
          status: 'RECOVERED',
        });
      }
      // Restore assigned recovery path on refresh from MongoDB incident
      if (incident?.recoveryPath?.length) {
        setRecoveryAnalysis((prev) => ({
          ...(prev || {}),
          status: 'RECOVERY_ASSIGNED',
          selectedRecovery: {
            candidateId: incident.selectedCandidateId,
            vehicleId: incident.recoveryVehicleId,
            vehicleNumber: incident.recoveryVehicleNumber,
            path: incident.recoveryPath,
            pickupCase: incident.pickupCase,
          },
          candidates: prev?.candidates || [],
        }));
      } else if (!incident || incident.status === 'RESOLVED') {
        setRecoveryAnalysis(null);
      }
      if (data.currentNode) setFocusNodeId(data.currentNode);
    } catch (err) {
      setSelectedShipment(null);
      if (err instanceof ApiError && err.status === 404) {
        setShipmentError(`Shipment not found: ${id}`);
      } else {
        setShipmentError(errMsg(err, 'Failed to load shipment'));
      }
    } finally {
      setShipmentLoading(false);
    }
  }, []);

  const loadVehicle = useCallback(async (id) => {
    if (!id) return;
    setVehicleLoading(true);
    setVehicleError(null);
    try {
      const data = await getVehicle(id);
      setSelectedVehicle(data);
      if (data.currentNode) setFocusNodeId(data.currentNode);
    } catch (err) {
      setSelectedVehicle(null);
      if (err instanceof ApiError && err.status === 404) {
        setVehicleError(`Vehicle not found: ${id}`);
      } else {
        setVehicleError(errMsg(err, 'Failed to load vehicle'));
      }
    } finally {
      setVehicleLoading(false);
    }
  }, []);

  const analyzeRecovery = useCallback(async () => {
    const id = selectedShipment?.id || selectedShipment?.trackingNumber;
    if (!id) {
      setRecoveryError('Select a shipment before analyzing recovery.');
      return;
    }
    setRecoveryLoading(true);
    setRecoveryError(null);
    try {
      const data = await calculateRecovery(id);
      setRecoveryAnalysis(data);
      const path = data?.selectedRecovery?.path;
      if (path?.length) setFocusNodeId(path[0]);
      // Refresh shipment so lifecycle shows RECOVERY_ANALYSIS when applicable
      await loadShipment(id);
    } catch (err) {
      setRecoveryAnalysis(null);
      if (err instanceof ApiError && err.status === 404) {
        setRecoveryError(`Shipment not found for recovery: ${id}`);
      } else {
        setRecoveryError(errMsg(err, 'Recovery analysis failed'));
      }
    } finally {
      setRecoveryLoading(false);
    }
  }, [selectedShipment, loadShipment]);

  const handleSimulateIncident = useCallback(async () => {
    const id = selectedShipment?.id || selectedShipment?.trackingNumber;
    if (!id) {
      setShipmentError('Select a shipment before simulating an incident.');
      return;
    }
    setSimulating(true);
    setShipmentError(null);
    setCompletionBanner(null);
    setDriverNotification(null);
    try {
      const result = await simulateIncident(id, { autoAnalyze: false });
      setActiveIncident(result.incident);
      await loadShipment(id);
      await loadDashboard();
      setSearchHint(
        `Incident ${result.incident?.incidentId} simulated — recovery required`,
      );
      // Trigger recovery engine as a separate step (keeps simulate fast / durable)
      setRecoveryLoading(true);
      try {
        const data = await calculateRecovery(id);
        setRecoveryAnalysis(data);
        const path = data?.selectedRecovery?.path;
        if (path?.length) setFocusNodeId(path[0]);
        await loadShipment(id);
      } catch (calcErr) {
        setRecoveryError(errMsg(calcErr, 'Recovery analysis failed after incident'));
      } finally {
        setRecoveryLoading(false);
      }
    } catch (err) {
      setShipmentError(errMsg(err, 'Failed to simulate incident'));
    } finally {
      setSimulating(false);
    }
  }, [selectedShipment, loadShipment, loadDashboard]);

  const handleSelectRecovery = useCallback(
    async (candidate) => {
      const id = selectedShipment?.id || selectedShipment?.trackingNumber;
      if (!id || !candidate) return;
      setAssigning(true);
      setRecoveryError(null);
      try {
        const result = await assignRecovery(id, {
          candidateId: candidate.candidateId,
          vehicleId: candidate.vehicleId,
          path: candidate.path,
          pickupCase: candidate.pickupCase,
        });
        setActiveIncident(result.incident);
        setDriverNotification(result.driverNotification || null);
        if (result.recovery) setRecoveryAnalysis(result.recovery);
        if (result.assignment?.path?.length) {
          setRecoveryAnalysis((prev) => ({
            ...(prev || result.recovery || {}),
            status: 'RECOVERY_ASSIGNED',
            selectedRecovery: {
              ...(prev?.selectedRecovery || {}),
              ...result.assignment,
            },
          }));
          setFocusNodeId(result.assignment.path[0]);
        }
        if (result.assignment?.vehicleId) {
          await loadVehicle(result.assignment.vehicleId);
        }
        await loadShipment(id);
        await loadDashboard();
        setSearchHint(
          `Recovery assigned to ${result.assignment?.vehicleNumber || result.assignment?.vehicleId}`,
        );
      } catch (err) {
        setRecoveryError(errMsg(err, 'Failed to assign recovery'));
      } finally {
        setAssigning(false);
      }
    },
    [selectedShipment, loadShipment, loadVehicle, loadDashboard],
  );

  const handleMarkRecovered = useCallback(async () => {
    const id = selectedShipment?.id || selectedShipment?.trackingNumber;
    if (!id) return;
    setResolving(true);
    setRecoveryError(null);
    try {
      const result = await resolveRecovery(id);
      setActiveIncident(result.incident);
      setCompletionBanner({
        trackingNumber: result.shipment?.trackingNumber,
        recoveryVehicleNumber: result.completion?.recoveryVehicleNumber,
        recoveryRouteLabel: result.completion?.recoveryRouteLabel,
        status: result.completion?.status || 'RECOVERED',
      });
      await loadShipment(id);
      await loadDashboard();
      setSearchHint(`Recovery completed for ${result.shipment?.trackingNumber || id}`);
    } catch (err) {
      setRecoveryError(errMsg(err, 'Failed to mark recovered'));
    } finally {
      setResolving(false);
    }
  }, [selectedShipment, loadShipment, loadDashboard]);

  const handleSearchSubmit = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchHint('Enter a shipment ID, vehicle ID, or hub name.');
      return;
    }
    setSearchHint('');

    try {
      const shipment = await getShipment(q);
      setSelectedShipment(shipment);
      setShipmentError(null);
      setRecoveryAnalysis(null);
      setRecoveryError(null);
      setCompletionBanner(null);
      const incident = shipment.activeIncident || null;
      setActiveIncident(incident && incident.status !== 'RESOLVED' ? incident : incident);
      if (shipment.currentNode) setFocusNodeId(shipment.currentNode);
      setSearchHint(`Loaded shipment ${shipment.trackingNumber || shipment.id}`);
      await loadShipment(shipment.id);
      return;
    } catch {
      /* fall through */
    }

    const shipmentHit = shipments.find(
      (s) =>
        s.id === q ||
        s.trackingNumber === q ||
        String(s.trackingNumber || '').toLowerCase() === q.toLowerCase(),
    );
    if (shipmentHit) {
      await loadShipment(shipmentHit.id);
      setSearchHint(`Loaded shipment ${shipmentHit.trackingNumber || shipmentHit.id}`);
      return;
    }

    try {
      const vehicle = await getVehicle(q);
      setSelectedVehicle(vehicle);
      setVehicleError(null);
      if (vehicle.currentNode) setFocusNodeId(vehicle.currentNode);
      setSearchHint(`Loaded vehicle ${vehicle.vehicleNumber || vehicle.id}`);
      return;
    } catch {
      /* fall through */
    }

    const vehicleHit = vehicles.find(
      (v) =>
        v.id === q ||
        v.vehicleNumber === q ||
        String(v.vehicleNumber || '').toLowerCase() === q.toLowerCase(),
    );
    if (vehicleHit) {
      await loadVehicle(vehicleHit.id);
      setSearchHint(`Loaded vehicle ${vehicleHit.vehicleNumber || vehicleHit.id}`);
      return;
    }

    const qLower = q.toLowerCase();
    const hubHit = hubs.find(
      (h) =>
        h.id === q ||
        h.code === q ||
        h.graphNodeKey === q ||
        String(h.name || '').toLowerCase() === qLower ||
        String(h.name || '').toLowerCase().includes(qLower) ||
        String(h.graphNodeKey || '').toLowerCase().includes(qLower),
    );
    if (hubHit) {
      if (hubHit.graphNodeKey) setFocusNodeId(hubHit.graphNodeKey);
      setSearchHint(`Focused hub ${hubHit.name || hubHit.graphNodeKey || hubHit.id}`);
      return;
    }

    setSearchHint(`No shipment, vehicle, or hub matched “${q}”.`);
    setShipmentError(`Shipment not found: ${q}`);
  }, [searchQuery, shipments, vehicles, hubs, loadShipment, loadVehicle]);

  const incidentForAlert =
    activeIncident &&
    selectedShipment &&
    (activeIncident.shipmentId === selectedShipment.id ||
      !activeIncident.shipmentId)
      ? activeIncident
      : selectedShipment?.activeIncident || activeIncident;

  const showAlert =
    completionBanner ||
    (incidentForAlert &&
      incidentForAlert.status &&
      incidentForAlert.status !== 'RESOLVED');

  return (
    <div className="app-shell">
      <Header
        health={health}
        healthError={healthError}
        healthLoading={healthLoading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchSubmit={handleSearchSubmit}
        searchHint={searchHint}
      />

      <p className="api-base muted">
        API: <code>{getApiBaseUrl()}</code>
        {healthError ? (
          <>
            {' '}
            — <button type="button" onClick={refreshHealth}>Retry health</button>
            {' · '}
            <button type="button" onClick={loadDashboard}>Reload data</button>
          </>
        ) : null}
      </p>

      <MetricsBar
        hubsCount={hubs.length}
        nodesCount={graph?.nodes?.length ?? health?.graph?.nodeCount ?? null}
        edgesCount={graph?.edges?.length ?? health?.graph?.edgeCount ?? null}
        vehiclesCount={vehicles.length}
        shipmentsCount={shipments.length}
        loading={listsLoading || graphLoading}
        error={listsError || graphError}
      />

      {showAlert ? (
        <IncidentAlert
          incident={incidentForAlert}
          shipment={selectedShipment}
          completion={completionBanner}
          onViewRecovery={analyzeRecovery}
          onMarkRecovered={handleMarkRecovered}
          recovering={recoveryLoading}
          resolving={resolving}
        />
      ) : null}

      {driverNotification ? (
        <section className="panel driver-notify">
          <h2>Driver Notification</h2>
          <p className="muted">
            Channel: {driverNotification.channel} · delivered:{' '}
            {String(driverNotification.delivered)}
          </p>
          <pre className="driver-message">{driverNotification.message}</pre>
        </section>
      ) : null}

      <div className="main-grid">
        <LogisticsMap
          graph={graph}
          loading={graphLoading}
          error={graphError}
          vehicles={vehicles}
          selectedShipment={selectedShipment}
          selectedVehicle={selectedVehicle}
          recoveryAnalysis={recoveryAnalysis}
          activeIncident={incidentForAlert}
          focusNodeId={focusNodeId}
        />

        <div className="side-panels">
          <ShipmentPanel
            shipment={selectedShipment}
            loading={shipmentLoading}
            error={shipmentError}
            onAnalyze={analyzeRecovery}
            analyzing={recoveryLoading}
            onSimulateIncident={handleSimulateIncident}
            simulating={simulating}
            onMarkRecovered={handleMarkRecovered}
            resolving={resolving}
          />
          <VehiclePanel
            vehicle={selectedVehicle}
            loading={vehicleLoading}
            error={vehicleError}
          />
        </div>
      </div>

      <SearchPanel
        shipments={shipments}
        vehicles={vehicles}
        hubs={hubs}
        selectedShipmentId={selectedShipment?.id}
        selectedVehicleId={selectedVehicle?.id}
        onSelectShipment={loadShipment}
        onSelectVehicle={loadVehicle}
        onSelectHub={(hub) => {
          if (hub.graphNodeKey) setFocusNodeId(hub.graphNodeKey);
          setSearchHint(`Focused hub ${hub.name || hub.graphNodeKey || hub.id}`);
        }}
        listError={listsError}
      />

      <div className="recovery-grid">
        <RecoveryCandidates
          analysis={recoveryAnalysis}
          loading={recoveryLoading}
          error={recoveryError}
          assignedCandidateId={
            incidentForAlert?.status === 'ASSIGNED'
              ? incidentForAlert.selectedCandidateId
              : null
          }
          onSelectRecovery={handleSelectRecovery}
          assigning={assigning}
        />
        <RecoveryPlan
          analysis={recoveryAnalysis}
          loading={recoveryLoading}
          error={recoveryError}
          assigned={incidentForAlert?.status === 'ASSIGNED'}
        />
      </div>
    </div>
  );
}
