/**
 * Recovery data layer — loading / error / data / refresh for the demo workflow.
 * Presentation components should consume this hook instead of calling the API directly.
 *
 * Mutations always refresh from the server afterward. Lifecycle state is not
 * advanced optimistically in React.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  analyzeRecovery as apiAnalyzeRecovery,
  assignRecovery as apiAssignRecovery,
  calculateRecovery as apiCalculateRecovery,
  getActiveIncidents,
  getDriverCallStatus,
  getIncidentByShipment,
  getRecovery,
  getShipment,
  pickupRecovery,
  resolveRecovery as apiResolveRecovery,
  retryDriverCall,
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
  const [driverCall, setDriverCall] = useState(null);
  const [retryingCall, setRetryingCall] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);
  const lastFailedActionRef = useRef(null);


  const [simulating, setSimulating] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [confirmingPickup, setConfirmingPickup] = useState(false);
  const [resolving, setResolving] = useState(false);
  const shipmentRequestRef = useRef(0);

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

  const loadShipment = useCallback(
    async (id, { fetchRecoveryPlan = true } = {}) => {
      if (!id) return null;
      const requestId = ++shipmentRequestRef.current;
      setShipmentLoading(true);
      setShipmentError(null);
      try {
        const data = await getShipment(id);
        if (requestId !== shipmentRequestRef.current) return null;
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
          (incident.status === 'ASSIGNED' ||
            incident.status === 'PICKUP_CONFIRMED')
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
              existingRouteNodes: incident.existingRouteNodes || [],
              vehicleToPickupPath: incident.vehicleToPickupPath || [],
              vehicleToDestinationPath: incident.vehicleToDestinationPath || [],
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
        } else if (!incident) {
          setRecoveryAnalysis(null);
        }

        // Load persisted plan (GET) so Assign is available without re-analyze
        if (
          fetchRecoveryPlan &&
          incident &&
          (incident.status === 'RECOVERY_REQUIRED' ||
            incident.status === 'OPEN' ||
            incident.status === 'ASSIGNED' ||
            incident.status === 'PICKUP_CONFIRMED')
        ) {
          try {
            const recovery = await getRecovery(id);
            if (requestId !== shipmentRequestRef.current) return null;
            setRecoveryAnalysis(recovery);
            const path = recovery?.selectedRecovery?.path;
            if (path?.length && onFocusNode) onFocusNode(path[0]);
          } catch {
            // Keep incident-derived analysis snapshot if GET fails
          }
        }

        if (data.currentNode && onFocusNode) onFocusNode(data.currentNode);
        return data;
      } catch (err) {
        if (requestId !== shipmentRequestRef.current) return null;
        setSelectedShipment(null);
        if (err instanceof ApiError && err.status === 404) {
          setShipmentError(`Shipment not found: ${id}`);
        } else {
          setShipmentError(errMsg(err, 'Failed to load shipment'));
        }
        return null;
      } finally {
        if (requestId === shipmentRequestRef.current) {
          setShipmentLoading(false);
        }
      }
    },
    [onFocusNode],
  );

  /**
   * Fetch incident for the current (or given) shipment via
   * GET /api/incidents/by-shipment/:id
   */
  const loadIncidentForShipment = useCallback(
    async (shipmentId) => {
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
    },
    [selectedShipment],
  );

  /**
   * After a successful mutation: re-fetch recovery → incident → shipment.
   * Server remains the source of truth for lifecycle / available actions.
   */
  const refreshAfterMutation = useCallback(
    async (shipmentId) => {
      const id = shipmentId || shipmentKey(selectedShipment);
      if (!id) return { recovery: null, incident: null, shipment: null };

      let recovery = null;
      try {
        recovery = await getRecovery(id);
        setRecoveryAnalysis(recovery);
        const path = recovery?.selectedRecovery?.path;
        if (path?.length && onFocusNode) onFocusNode(path[0]);
      } catch {
        // Assignment/pickup may still succeed when GET recovery is unavailable
      }

      const incident = await loadIncidentForShipment(id);
      const shipment = await loadShipment(id, { fetchRecoveryPlan: false });
      if (onDashboardRefresh) await onDashboardRefresh();
      return { recovery, incident, shipment };
    },
    [selectedShipment, loadIncidentForShipment, loadShipment, onDashboardRefresh, onFocusNode],
  );

  /**
   * Fetch recovery analysis (candidates + persisted plan).
   * Uses GET by default; pass mode 'calculate' | 'analyze' for POST verbs.
   */
  const fetchRecovery = useCallback(
    async (shipmentId, { mode = 'get' } = {}) => {
      const id = shipmentId || shipmentKey(selectedShipment);
      if (!id) {
        setRecoveryError('Select a shipment before analyzing recovery.');
        setActionError('Select a shipment before analyzing recovery.');
        return null;
      }
      setRecoveryLoading(true);
      setRecoveryError(null);
      setActionError(null);
      setActionFeedback(null);
      lastFailedActionRef.current = null;
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
        await loadIncidentForShipment(id);
        await loadShipment(id, { fetchRecoveryPlan: false });
        if (mode !== 'get') {
          const planReady =
            data?.status === 'RECOVERY_PLAN_AVAILABLE' ||
            Boolean(data?.recoveryPlan || data?.selectedRecovery);
          setActionFeedback(
            planReady
              ? 'Recovery analysis complete — selected plan ready.'
              : 'Recovery analysis complete — no feasible plan.',
          );
          if (onHint) {
            onHint(
              planReady
                ? `Recovery plan ready for ${data?.shipment?.trackingNumber || id}`
                : `No feasible recovery for ${data?.shipment?.trackingNumber || id}`,
            );
          }
        }
        return data;
      } catch (err) {
        setRecoveryAnalysis(null);
        const message =
          err instanceof ApiError && err.status === 404
            ? `Shipment not found for recovery: ${id}`
            : errMsg(err, 'Unable to analyze recovery.');
        setRecoveryError(message);
        setActionError(message);
        lastFailedActionRef.current = 'analyze';
        return null;
      } finally {
        setRecoveryLoading(false);
      }
    },
    [selectedShipment, loadShipment, loadIncidentForShipment, onFocusNode, onHint],
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
    setActionError(null);
    setActionFeedback(null);
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
        await loadIncidentForShipment(id);
        await loadShipment(id);
        setActionFeedback('Incident simulated — recovery analysis ready.');
      } catch (calcErr) {
        const message = errMsg(calcErr, 'Unable to analyze recovery.');
        setRecoveryError(message);
        setActionError(message);
        lastFailedActionRef.current = 'analyze';
      } finally {
        setRecoveryLoading(false);
      }
    } catch (err) {
      setShipmentError(errMsg(err, 'Failed to simulate incident'));
    } finally {
      setSimulating(false);
    }
  }, [
    selectedShipment,
    loadShipment,
    loadIncidentForShipment,
    onDashboardRefresh,
    onHint,
    onFocusNode,
  ]);

  /**
   * Assign using the backend-persisted selected recovery plan.
   * Empty payload — do not choose a vehicle in the frontend.
   */
  const handleAssignPersistedPlan = useCallback(async () => {
    const id = shipmentKey(selectedShipment);
    if (!id) return;
    setAssigning(true);
    setRecoveryError(null);
    setActionError(null);
    setActionFeedback(null);
    lastFailedActionRef.current = null;
    try {
      const result = await apiAssignRecovery(id, {});
      setActiveIncident(result.incident);
      setDriverNotification(result.driverNotification || null);
      setDriverCall(result.call || null);
      // Refresh from server — do not invent the next lifecycle status locally
      await refreshAfterMutation(id);
      if (result.assignment?.vehicleId && onLoadVehicle) {
        await onLoadVehicle(result.assignment.vehicleId);
      }
      if (result.call?.status === 'initiated') {
        const destMsg = result.driver?.phone || result.call?.phone || 'driver';
        setActionFeedback(
          `Vehicle ${result.assignment?.vehicleNumber || result.assignment?.vehicleId || ''} assigned — Sarvam Telugu outbound call initiated to ${destMsg}.`.trim(),
        );
      } else if (result.call?.status === 'failed') {
        setActionError(
          `Vehicle assigned, but driver call failed: ${result.call?.error || 'Telephony error'}. Click 'Retry Call' to try again.`,
        );
      } else {
        setActionFeedback(
          `Vehicle ${result.assignment?.vehicleNumber || result.assignment?.vehicleId || ''} assigned.`,
        );
      }
      if (onHint) {
        onHint(
          `Recovery assigned to ${result.assignment?.vehicleNumber || result.assignment?.vehicleId}`,
        );
      }
    } catch (err) {
      const message = 'Unable to assign vehicle.';
      setRecoveryError(errMsg(err, message));
      setActionError(message);
      lastFailedActionRef.current = 'assign';
    } finally {
      setAssigning(false);
    }
  }, [selectedShipment, refreshAfterMutation, onLoadVehicle, onHint]);

  const handleRetryDriverCall = useCallback(
    async (explicitPhone = null) => {
      const id = shipmentKey(selectedShipment);
      if (!id) return;
      setRetryingCall(true);
      setActionError(null);
      try {
        const res = await retryDriverCall(id, { phone: explicitPhone });
        setDriverCall(res.call || null);
        if (res.incident) setActiveIncident(res.incident);
        if (res.call?.status === 'initiated') {
          setActionFeedback(
            `Calling driver (${res.driver?.phone || res.call?.phone || 'assigned'})...`,
          );
        } else {
          setActionError(`Call failed: ${res.call?.error || 'Unknown error'}`);
        }
        return res;
      } catch (err) {
        const message = errMsg(err, 'Failed to place driver call');
        setActionError(message);
      } finally {
        setRetryingCall(false);
      }
    },
    [selectedShipment],
  );


  /** @deprecated Prefer handleAssignPersistedPlan — kept for any legacy call sites. */
  const handleSelectRecovery = useCallback(
    async (candidate) => {
      // Still assign via persisted plan; ignore client candidate choice.
      void candidate;
      return handleAssignPersistedPlan();
    },
    [handleAssignPersistedPlan],
  );

  const handleConfirmPickup = useCallback(async () => {
    const id = shipmentKey(selectedShipment);
    if (!id) return;
    setConfirmingPickup(true);
    setRecoveryError(null);
    setActionError(null);
    setActionFeedback(null);
    lastFailedActionRef.current = null;
    try {
      const result = await pickupRecovery(id);
      setActiveIncident(result.incident);
      setCompletionBanner(null);
      await refreshAfterMutation(id);
      setActionFeedback('Pickup confirmed — shipment recovered; resolve when ready.');
      if (onHint) {
        onHint(`Pickup confirmed for ${result.shipment?.trackingNumber || id}`);
      }
    } catch (err) {
      const message = 'Unable to confirm pickup.';
      setRecoveryError(errMsg(err, message));
      setActionError(message);
      lastFailedActionRef.current = 'pickup';
    } finally {
      setConfirmingPickup(false);
    }
  }, [selectedShipment, refreshAfterMutation, onHint]);

  const handleMarkRecovered = useCallback(async () => {
    const id = shipmentKey(selectedShipment);
    if (!id) return;
    setResolving(true);
    setRecoveryError(null);
    setActionError(null);
    setActionFeedback(null);
    lastFailedActionRef.current = null;
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
      await refreshAfterMutation(id);
      setActionFeedback('Incident resolved — recovery complete.');
      if (onHint) {
        onHint(`Incident resolved for ${result.shipment?.trackingNumber || id}`);
      }
    } catch (err) {
      const message = 'Unable to resolve incident.';
      setRecoveryError(errMsg(err, message));
      setActionError(message);
      lastFailedActionRef.current = 'resolve';
    } finally {
      setResolving(false);
    }
  }, [selectedShipment, refreshAfterMutation, onHint]);

  const clearActionError = useCallback(() => {
    setActionError(null);
    lastFailedActionRef.current = null;
  }, []);

  const retryLastAction = useCallback(async () => {
    const kind = lastFailedActionRef.current;
    setActionError(null);
    if (kind === 'analyze') return analyzeRecovery();
    if (kind === 'assign') return handleAssignPersistedPlan();
    if (kind === 'pickup') return handleConfirmPickup();
    if (kind === 'resolve') return handleMarkRecovered();
    return null;
  }, [
    analyzeRecovery,
    handleAssignPersistedPlan,
    handleConfirmPickup,
    handleMarkRecovered,
  ]);

  const clearRecoverySelection = useCallback(() => {
    setRecoveryAnalysis(null);
    setRecoveryError(null);
    setCompletionBanner(null);
    setDriverNotification(null);
    setActionError(null);
    setActionFeedback(null);
    lastFailedActionRef.current = null;
  }, []);

  // Sync driverCall state when activeIncident loads or updates
  useEffect(() => {
    if (activeIncident?.driverCallStatus || activeIncident?.driverCallAttemptId) {
      setDriverCall({
        triggered: activeIncident.driverCallStatus !== 'not_triggered',
        status: activeIncident.driverCallStatus || 'initiated',
        call_id: activeIncident.driverCallAttemptId,
        phone: activeIncident.driverCallPhone,
        error: activeIncident.driverCallError,
        channel: activeIncident.driverCallChannel,
      });
    }
  }, [activeIncident]);

  // Poll driver call status when in flight
  useEffect(() => {
    const id = shipmentKey(selectedShipment);
    if (!id || !driverCall?.call_id) return;
    if (
      driverCall.status !== 'initiated' &&
      driverCall.status !== 'in_progress' &&
      driverCall.status !== 'ringing'
    ) {
      return;
    }
    const interval = setInterval(async () => {
      try {
        const res = await getDriverCallStatus(id);
        if (res?.call?.status && res.call.status !== driverCall.status) {
          setDriverCall((prev) => ({ ...prev, ...res.call }));
          if (res.incident) setActiveIncident(res.incident);
        }
      } catch {
        // ignore polling error
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedShipment, driverCall?.call_id, driverCall?.status]);

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
    driverCall,
    actionError,
    actionFeedback,

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
    retryingCall,
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
    handleAssignPersistedPlan,
    handleRetryDriverCall,
    handleSelectRecovery,
    handleConfirmPickup,
    handleMarkRecovered,
    retryLastAction,
    clearActionError,
    clearRecoverySelection,
  };
}

export default useRecoveryData;

