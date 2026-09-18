/**
 * Derive which recovery operator action is available from server state.
 * Does not invent statuses — maps Incident.status + persisted plan + lifecycle.
 *
 * Backend has no separate Contact Driver endpoint: POST /assign already runs
 * the simulated driver notification. After ASSIGNED, Confirm Pickup is next.
 */

import {
  firstPresent,
  resolveRecoveryDisplayStatus,
} from './recoveryStatus';
import { candidateTypeLabel, fmtNum } from './candidateUtils';

/** @typedef {'analyze'|'assign'|'contact'|'pickup'|'resolve'|null} RecoveryActionId */

/**
 * Whether analysis returned a persisted selected plan the operator can assign.
 * @param {import('../../types/api.ts').RecoveryAnalysis | null | undefined} analysis
 */
export function hasPersistedRecoveryPlan(analysis) {
  if (!analysis) return false;
  if (analysis.status === 'NO_FEASIBLE_RECOVERY') return false;
  return Boolean(analysis.recoveryPlan || analysis.selectedRecovery);
}

/**
 * @param {{
 *   incident?: import('../../types/api.ts').Incident | null,
 *   shipment?: import('../../types/api.ts').Shipment | null,
 *   recoveryAnalysis?: import('../../types/api.ts').RecoveryAnalysis | null,
 * }} input
 * @returns {RecoveryActionId}
 */
export function getAvailableRecoveryAction({
  incident = null,
  shipment = null,
  recoveryAnalysis = null,
} = {}) {
  const display = resolveRecoveryDisplayStatus({ incident, shipment });
  const incidentStatus = incident?.status || null;

  if (!display && !incidentStatus && !shipment?.needsRecovery) {
    return null;
  }

  if (display === 'RESOLVED' || incidentStatus === 'RESOLVED') {
    return null;
  }

  if (display === 'RECOVERED' || incidentStatus === 'PICKUP_CONFIRMED') {
    return 'resolve';
  }

  if (display === 'PICKUP_CONFIRMED') {
    return 'resolve';
  }

  // ASSIGNED / DRIVER_CONTACTED — driver contact is performed by /assign
  if (
    display === 'DRIVER_CONTACTED' ||
    display === 'ASSIGNED' ||
    incidentStatus === 'ASSIGNED'
  ) {
    return 'pickup';
  }

  // RECOVERY_REQUIRED / OPEN / analysis phase
  if (
    display === 'RECOVERY_REQUIRED' ||
    incidentStatus === 'RECOVERY_REQUIRED' ||
    incidentStatus === 'OPEN' ||
    shipment?.needsRecovery ||
    shipment?.isMisplaced
  ) {
    if (hasPersistedRecoveryPlan(recoveryAnalysis)) {
      return 'assign';
    }
    return 'analyze';
  }

  return null;
}

/**
 * Build confirmation fields for Assign Vehicle from the persisted plan.
 * @param {{
 *   analysis?: import('../../types/api.ts').RecoveryAnalysis | null,
 *   vehicles?: import('../../types/api.ts').Vehicle[],
 *   incident?: import('../../types/api.ts').Incident | null,
 * }} input
 */
export function buildAssignConfirmation(input = {}) {
  const { analysis = null, vehicles = [], incident = null } = input;
  const selected = analysis?.selectedRecovery;
  const plan = analysis?.recoveryPlan;
  const network = analysis?.network || {};
  const full = (analysis?.candidates || []).find(
    (c) =>
      c.candidateId === selected?.candidateId ||
      c.candidateId === plan?.candidateId,
  );

  const vehicleId =
    selected?.vehicleId || plan?.selectedVehicleId || full?.vehicleId;
  const vehicle =
    vehicles.find((v) => v.id === vehicleId) || null;
  const vehicleLabel =
    selected?.vehicleNumber ||
    full?.vehicleNumber ||
    vehicle?.vehicleNumber ||
    incident?.recoveryVehicleNumber ||
    vehicleId ||
    '—';
  const driver =
    plan?.driverId ||
    selected?.vehicleNumber ||
    full?.vehicleNumber ||
    vehicle?.vehicleNumber ||
    incident?.recoveryDriverId ||
    vehicleLabel;
  const pickup =
    firstPresent(
      plan?.pickupNode,
      network.actualNode,
      network.currentNode,
      selected?.path?.[0],
      full?.path?.[0],
      incident?.pickupNode,
      incident?.hubName,
    ) || '—';
  const destination =
    firstPresent(
      plan?.destinationNode,
      network.destinationNode,
      selected?.path?.length
        ? selected.path[selected.path.length - 1]
        : null,
      full?.path?.length
        ? full.path[full.path.length - 1]
        : null,
      incident?.destinationNode,
    ) || '—';
  const pickupCase =
    selected?.pickupCase || plan?.candidateType || full?.pickupCase;
  const score =
    selected?.score ?? plan?.score ?? full?.score ?? full?.totalScore ?? null;

  return {
    vehicleLabel,
    driver,
    pickup,
    destination,
    typeLabel: candidateTypeLabel(pickupCase),
    scoreLabel: score != null ? fmtNum(score, 1) : '—',
  };
}

/**
 * Human labels for action buttons.
 */
export const RECOVERY_ACTION_LABELS = {
  analyze: 'Analyze Recovery',
  assign: 'Assign Vehicle',
  contact: 'Contact Driver',
  pickup: 'Confirm Pickup',
  resolve: 'Resolve Incident',
};
