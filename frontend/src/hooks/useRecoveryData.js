/**
 * Recovery data layer — loading / error / data / refresh for the demo workflow.
 * Presentation components should consume this hook instead of calling the API directly.
 */

import { useCallback, useState } from 'react';
import {
  ApiError,
  analyzeRecovery as apiAnalyzeRecovery,
  assignRecovery as apiAssignRecovery,
  calculateRecovery as apiCalculateRecovery,
  getActiveIncidents,
  getIncidentByShipment,
  getRecovery,
  getShipment,
  pickupRecovery,
  resolveRecovery as apiResolveRecovery,
  simulateIncident,
} from '../api/client';

function errMsg(err, fallback) {
  if (err instanceof ApiError) return err.message;
  if (err?.message) return err.message;
  return fallback;
}

function shipmentKey(shipment) {
  return shipment?.id || shipment?.trackingNumber || null;
}

/**
 * @param {{
 *   onDashboardRefresh?: () => Promise<void> | void,
 *   onLoadVehicle?: (vehicleId: string) => Promise<void> | void,
 *   onFocusNode?: (nodeId: string | null) => void,
 *   onHint?: (message: string) => void,
 * }} [options]
 */
export function useRecoveryData(options = {}) {
  const { onDashboardRefresh, onLoadVehicle, onFocusNode, onHint } = options;

  const [selectedShipment, setSelectedShipment] = useState(null);
  const [shipmentLoading, setShipmentLoading] = useState(false);
  const [shipmentError, setShipmentError] = useState(null);

  const [recoveryAnalysis, setRecoveryAnalysis] = useState(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState(null);

  const [activeIncident, setActiveIncident] = useState(null);
  const [activeIncidents, setActiveIncidents] = useState([]);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [incidentsError, setIncidentsError] = useState(null);

  const [completionBanner, setCompletionBanner] = useState(null);
  const [driverNotification, setDriverNotification] = useState(null);

  const [simulating, setSimulating] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [confirmingPickup, setConfirmingPickup] = useState(false);
  const [resolving, setResolving] = useState(false);

  const refreshActiveIncidents = useCallback(async () => {
    setIncidentsLoading(true);
    setIncidentsError(null);
    try {
      const data = await getActiveIncidents();
      const incidents = data?.incidents || [];
      setActiveIncidents(incidents);
      setActiveIncident((prev) => {
        if (prev) {
          const match = incidents.find((i) => i.incidentId === prev.incidentId);
          return match || prev;
        }
        return incidents[0] || null;
      });
      return incidents;
    } catch (err) {
      setIncidentsError(errMsg(err, 'Failed to load active incidents'));
      return [];
    } finally {
      setIncidentsLoading(false);
    }
  }, []);

  const loadShipment = useCallback(async (id) => {
    if (!id) return null;
    setShipmentLoading(true);
    setShipmentError(null);
    setRecoveryError(null);
    setCompletionBanner(null);
    try {
      const data = await getShipment(id);
      setSelectedShipment(data);
      const incident = data.activeIncident || null;
      setActiveIncident(incident);

      if (incident?.status === 'RESOLVED') {
        setCompletionBanner({
          trackingNumber: data.trackingNumber,
          recoveryVehicleNumber: incident.recoveryVehicleNumber,
          recoveryRouteLabel: (incident.recoveryPath || []).join(' → ') || null,
          status: 'RECOVERED',
        });
      }

      // Restore assigned / pickup-confirmed recovery path on refresh
      if (
        incident?.recoveryPath?.length &&
        (incident.status === 'ASSIGNED' || incident.status === 'PICKUP_CONFIRMED')
      ) {
        setRecoveryAnalysis((prev) => ({
          ...(prev || {}),
          status:
            incident.status === 'PICKUP_CONFIRMED'
              ? 'PICKUP_CONFIRMED'
              : 'RECOVERY_ASSIGNED',
          selectedRecovery: {
            candidateId: incident.selectedCandidateId,
            vehicleId: incident.recoveryVehicleId,
            vehicleNumber: incident.recoveryVehicleNumber,
            path: incident.recoveryPath,
            pickupCase: incident.pickupCase,
            recoveryOptionId: incident.selectedRecoveryOptionId,
          },
          candidates: prev?.candidates || [],
          recoveryPlan: prev?.recoveryPlan || null,
          reasons: prev?.reasons || [],
          network: prev?.network || {},
          shipment: prev?.shipment || {
            id: data.id,
            trackingNumber: data.trackingNumber,
          },
        }));
      } else if (!incident || incident.status === 'RESOLVED') {
        setRecoveryAnalysis(null);
      }

      if (data.currentNode && onFocusNode) onFocusNode(data.currentNode);
      return data;
    } catch (err) {
      setSelectedShipment(null);
      if (err instanceof ApiError && err.status === 404) {
        setShipmentError(`Shipment not found: ${id}`);
      } else {
        setShipmentError(errMsg(err, 'Failed to load shipment'));
      }
      return null;
    } finally {
      setShipmentLoading(false);
    }
  }, [onFocusNode]);

  /**
   * Fetch incident for the current (or given) shipment via
   * GET /api/incidents/by-shipment/:id
   */
  const loadIncidentForShipment = useCallback(async (shipmentId) => {
    const id = shipmentId || shipmentKey(selectedShipment);
    if (!id) return null;
    try {
      const incident = await getIncidentByShipment(id);
      setActiveIncident(incident);
      return incident;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setActiveIncident(null);
        return null;
      }
      setRecoveryError(errMsg(err, 'Failed to load incident'));
      return null;
    }
  }, [selectedShipment]);

  /**
   * Fetch recovery analysis (candidates + persisted plan).
   * Uses GET by default; pass mode 'calculate' | 'analyze' for POST verbs.
   */
  const fetchRecovery = useCallback(
    async (shipmentId, { mode = 'get' } = {}) => {
      const id = shipmentId || shipmentKey(selectedShipment);
      if (!id) {
        setRecoveryError('Select a shipment before analyzing recovery.');
        return null;
      }
      setRecoveryLoading(true);
      setRecoveryError(null);
      try {
        let data;
        if (mode === 'calculate') {
          data = await apiCalculateRecovery(id);
        } else if (mode === 'analyze') {
          data = await apiAnalyzeRecovery(id);
        } else {
          data = await getRecovery(id);
        }
        setRecoveryAnalysis(data);
        const path = data?.selectedRecovery?.path;
        if (path?.length && onFocusNode) onFocusNode(path[0]);
        await loadShipment(id);
        return data;
      } catch (err) {
        setRecoveryAnalysis(null);
        if (err instanceof ApiError && err.status === 404) {
          setRecoveryError(`Shipment not found for recovery: ${id}`);
        } else {
          setRecoveryError(errMsg(err, 'Recovery analysis failed'));
        }
        return null;
      } finally {
        setRecoveryLoading(false);
      }
    },
    [selectedShipment, loadShipment, onFocusNode],
  );

  const analyzeRecovery = useCallback(
    () => fetchRecovery(undefined, { mode: 'calculate' }),
    [fetchRecovery],
  );

  const refreshRecovery = useCallback(
    () => fetchRecovery(undefined, { mode: 'get' }),
    [fetchRecovery],
  );

  const handleSimulateIncident = useCallback(async () => {
    const id = shipmentKey(selectedShipment);
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
      if (onDashboardRefresh) await onDashboardRefresh();
      if (onHint) {
        onHint(`Incident ${result.incident?.incidentId} simulated — recovery required`);
      }
      setRecoveryLoading(true);
      try {
        const data = await apiCalculateRecovery(id);
        setRecoveryAnalysis(data);
        const path = data?.selectedRecovery?.path;
        if (path?.length && onFocusNode) onFocusNode(path[0]);
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
  }, [selectedShipment, loadShipment, onDashboardRefresh, onHint, onFocusNode]);

  const handleSelectRecovery = useCallback(
    async (candidate) => {
      const id = shipmentKey(selectedShipment);
      if (!id || !candidate) return;
      setAssigning(true);
      setRecoveryError(null);
      try {
        const result = await apiAssignRecovery(id, {
          candidateId: candidate.candidateId,
          vehicleId: candidate.vehicleId,
          path: candidate.path,
          pickupCase: candidate.pickupCase,
          score: candidate.score,
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
            recoveryPlan: result.recoveryPlan || prev?.recoveryPlan || null,
          }));
          if (onFocusNode) onFocusNode(result.assignment.path[0]);
        }
        if (result.assignment?.vehicleId && onLoadVehicle) {
          await onLoadVehicle(result.assignment.vehicleId);
        }
        await loadShipment(id);
        if (onDashboardRefresh) await onDashboardRefresh();
        if (onHint) {
          onHint(
            `Recovery assigned to ${result.assignment?.vehicleNumber || result.assignment?.vehicleId} — driver contacted (simulated)`,
          );
        }
      } catch (err) {
        setRecoveryError(errMsg(err, 'Failed to assign recovery'));
      } finally {
        setAssigning(false);
      }
    },
    [selectedShipment, loadShipment, onLoadVehicle, onDashboardRefresh, onFocusNode, onHint],
  );

  const handleConfirmPickup = useCallback(async () => {
    const id = shipmentKey(selectedShipment);
    if (!id) return;
    setConfirmingPickup(true);
    setRecoveryError(null);
    try {
      const result = await pickupRecovery(id);
      setActiveIncident(result.incident);
      setCompletionBanner(null);
      await loadShipment(id);
      if (onDashboardRefresh) await onDashboardRefresh();
      if (onHint) {
        onHint(`Simulated pickup confirmed for ${result.shipment?.trackingNumber || id}`);
      }
    } catch (err) {
      setRecoveryError(errMsg(err, 'Failed to confirm pickup'));
    } finally {
      setConfirmingPickup(false);
    }
  }, [selectedShipment, loadShipment, onDashboardRefresh, onHint]);

  const handleMarkRecovered = useCallback(async () => {
    const id = shipmentKey(selectedShipment);
    if (!id) return;
    setResolving(true);
    setRecoveryError(null);
    try {
      const result = await apiResolveRecovery(id);
      setActiveIncident(result.incident);
      setCompletionBanner({
        trackingNumber: result.shipment?.trackingNumber,
        recoveryVehicleNumber: result.completion?.recoveryVehicleNumber,
        recoveryRouteLabel: result.completion?.recoveryRouteLabel,
        status: result.completion?.status || 'RECOVERED',
      });
      setDriverNotification(null);
      await loadShipment(id);
      if (onDashboardRefresh) await onDashboardRefresh();
      if (onHint) {
        onHint(`Incident resolved for ${result.shipment?.trackingNumber || id}`);
      }
    } catch (err) {
      setRecoveryError(errMsg(err, 'Failed to resolve incident'));
    } finally {
      setResolving(false);
    }
  }, [selectedShipment, loadShipment, onDashboardRefresh, onHint]);

  const clearRecoverySelection = useCallback(() => {
    setRecoveryAnalysis(null);
    setRecoveryError(null);
    setCompletionBanner(null);
    setDriverNotification(null);
  }, []);

  return {
    // data
    selectedShipment,
    setSelectedShipment,
    recoveryAnalysis,
    setRecoveryAnalysis,
    activeIncident,
    setActiveIncident,
    activeIncidents,
    completionBanner,
    driverNotification,

    // loading / error
    shipmentLoading,
    shipmentError,
    setShipmentError,
    recoveryLoading,
    recoveryError,
    incidentsLoading,
    incidentsError,

    // action flags
    simulating,
    assigning,
    confirmingPickup,
    resolving,

    // operations
    loadShipment,
    loadIncidentForShipment,
    refreshActiveIncidents,
    fetchRecovery,
    refreshRecovery,
    analyzeRecovery,
    handleSimulateIncident,
    handleSelectRecovery,
    handleConfirmPickup,
    handleMarkRecovered,
    clearRecoverySelection,
  };
}

export default useRecoveryData;
