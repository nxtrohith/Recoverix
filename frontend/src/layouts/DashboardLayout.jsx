import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet } from 'react-router-dom';
import {
  ApiError,
  getApiBaseUrl,
  getGraph,
  getHealth,
  getHubs,
  getShipment,
  getShipments,
  getVehicle,
  getVehicles,
} from '../api/client';
import Sidebar from '../components/Sidebar';
import { useRecoveryData } from '../hooks/useRecoveryData';
import './DashboardLayout.css';

function errMsg(err, fallback) {
  if (err instanceof ApiError) return err.message;
  if (err?.message) return err.message;
  return fallback;
}

export default function DashboardLayout() {
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

  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [vehicleLoading, setVehicleLoading] = useState(false);
  const [vehicleError, setVehicleError] = useState(null);

  const [focusNodeId, setFocusNodeId] = useState(null);
  const [previewCandidateId, setPreviewCandidateId] = useState(null);

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

  const loadDashboardLists = useCallback(async () => {
    setListsLoading(true);
    setListsError(null);

    const results = await Promise.allSettled([
      getHubs(),
      getVehicles(),
      getShipments(),
    ]);

    const [hubsRes, vehiclesRes, shipmentsRes] = results;
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

    setListsError(listErrors.length ? listErrors.join(' · ') : null);
    setListsLoading(false);
  }, []);

  const recovery = useRecoveryData({
    onDashboardRefresh: loadDashboardLists,
    onLoadVehicle: loadVehicle,
    onFocusNode: setFocusNodeId,
    onHint: setSearchHint,
  });

  const {
    selectedShipment,
    setSelectedShipment,
    recoveryAnalysis,
    activeIncident,
    setActiveIncident,
    completionBanner,
    driverNotification,
    actionError,
    actionFeedback,
    shipmentLoading,
    shipmentError,
    setShipmentError,
    recoveryLoading,
    recoveryError,
    incidentsLoading,
    incidentsError,
    simulating,
    assigning,
    confirmingPickup,
    resolving,
    loadShipment,
    refreshActiveIncidents,
    analyzeRecovery,
    handleSimulateIncident,
    handleAssignPersistedPlan,
    handleConfirmPickup,
    handleMarkRecovered,
    retryLastAction,
    clearActionError,
    clearRecoverySelection,
  } = recovery;

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
    setGraphError(null);

    const graphResult = await Promise.allSettled([getGraph()]);
    if (graphResult[0].status === 'fulfilled') {
      setGraph(graphResult[0].value);
    } else {
      setGraph(null);
      setGraphError(errMsg(graphResult[0].reason, 'Failed to load graph'));
    }
    setGraphLoading(false);

    await Promise.all([loadDashboardLists(), refreshActiveIncidents()]);
  }, [loadDashboardLists, refreshActiveIncidents]);

  useEffect(() => {
    refreshHealth();
    loadDashboard();
    const timer = setInterval(refreshHealth, 30000);
    return () => clearInterval(timer);
  }, [refreshHealth, loadDashboard]);

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
      clearRecoverySelection();
      const incident = shipment.activeIncident || null;
      setActiveIncident(incident);
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
  }, [
    searchQuery,
    shipments,
    vehicles,
    hubs,
    loadShipment,
    loadVehicle,
    setSelectedShipment,
    setShipmentError,
    clearRecoverySelection,
    setActiveIncident,
  ]);

  const incidentForAlert =
    activeIncident &&
    selectedShipment &&
    (activeIncident.shipmentId === selectedShipment.id ||
      !activeIncident.shipmentId)
      ? activeIncident
      : selectedShipment?.activeIncident || activeIncident;

  const recoveryVehicleIdForMap =
    incidentForAlert?.recoveryVehicleId ||
    recoveryAnalysis?.selectedRecovery?.vehicleId ||
    recoveryAnalysis?.recoveryPlan?.selectedVehicleId ||
    null;

  useEffect(() => {
    const incidentOpen =
      incidentForAlert?.status && incidentForAlert.status !== 'RESOLVED';
    if (!recoveryVehicleIdForMap || !incidentOpen) return;
    if (
      selectedVehicle?.id === recoveryVehicleIdForMap &&
      selectedVehicle.currentPath !== undefined
    ) {
      return;
    }
    loadVehicle(recoveryVehicleIdForMap);
  }, [
    recoveryVehicleIdForMap,
    selectedVehicle?.id,
    selectedVehicle?.currentPath,
    incidentForAlert?.status,
    loadVehicle,
  ]);

  useEffect(() => {
    if (!recoveryAnalysis) setPreviewCandidateId(null);
  }, [recoveryAnalysis]);

  const showAlert =
    completionBanner ||
    (incidentForAlert &&
      incidentForAlert.status &&
      incidentForAlert.status !== 'RESOLVED');

  const incidentBadge =
    incidentForAlert &&
    incidentForAlert.status &&
    incidentForAlert.status !== 'RESOLVED'
      ? 1
      : 0;

  const outletContext = useMemo(
    () => ({
      health,
      healthError,
      healthLoading,
      refreshHealth,
      loadDashboard,
      apiBaseUrl: getApiBaseUrl(),
      graph,
      graphLoading,
      graphError,
      hubs,
      vehicles,
      shipments,
      listsLoading,
      listsError,
      selectedVehicle,
      vehicleLoading,
      vehicleError,
      focusNodeId,
      setFocusNodeId,
      previewCandidateId,
      setPreviewCandidateId,
      loadVehicle,
      loadShipment,
      selectedShipment,
      recoveryAnalysis,
      activeIncident,
      incidentForAlert,
      completionBanner,
      driverNotification,
      actionError,
      actionFeedback,
      shipmentLoading,
      shipmentError,
      recoveryLoading,
      recoveryError,
      incidentsLoading,
      incidentsError,
      simulating,
      assigning,
      confirmingPickup,
      resolving,
      analyzeRecovery,
      handleSimulateIncident,
      handleAssignPersistedPlan,
      handleConfirmPickup,
      handleMarkRecovered,
      retryLastAction,
      clearActionError,
      showAlert,
      searchHint,
      setSearchHint,
    }),
    [
      health,
      healthError,
      healthLoading,
      refreshHealth,
      loadDashboard,
      graph,
      graphLoading,
      graphError,
      hubs,
      vehicles,
      shipments,
      listsLoading,
      listsError,
      selectedVehicle,
      vehicleLoading,
      vehicleError,
      focusNodeId,
      previewCandidateId,
      loadVehicle,
      loadShipment,
      selectedShipment,
      recoveryAnalysis,
      activeIncident,
      incidentForAlert,
      completionBanner,
      driverNotification,
      actionError,
      actionFeedback,
      shipmentLoading,
      shipmentError,
      recoveryLoading,
      recoveryError,
      incidentsLoading,
      incidentsError,
      simulating,
      assigning,
      confirmingPickup,
      resolving,
      analyzeRecovery,
      handleSimulateIncident,
      handleAssignPersistedPlan,
      handleConfirmPickup,
      handleMarkRecovered,
      retryLastAction,
      clearActionError,
      showAlert,
      searchHint,
    ],
  );

  return (
    <div className="dashboard-shell">
      <Sidebar
        incidentCount={incidentBadge}
        hubsCount={hubs.length}
        vehiclesCount={vehicles.length}
        shipmentsCount={shipments.length}
        health={health}
        healthError={healthError}
        healthLoading={healthLoading}
        onRefreshHealth={refreshHealth}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchSubmit={handleSearchSubmit}
        searchHint={searchHint}
      />
      <div className="dashboard-main">
        <div className="dashboard-content">
          <div className="dashboard-page">
            <Outlet context={outletContext} />
          </div>
        </div>
      </div>
    </div>
  );
}
