/**
 * Map backend incident / lifecycle statuses to the operator-facing
 * recovery status steps used by RecoveryStatus.
 *
 * Backend Incident.status: OPEN | RECOVERY_REQUIRED | ASSIGNED |
 *   PICKUP_CONFIRMED | RESOLVED
 * Backend lifecycleStatus: NORMAL | MISPLACED | RECOVERY_ANALYSIS |
 *   RECOVERY_ASSIGNED | PICKUP_CONFIRMED | RECOVERED
 *
 * Frontend display steps (operator view):
 *   RECOVERY_REQUIRED → ASSIGNED → DRIVER_CONTACTED →
 *   PICKUP_CONFIRMED → RECOVERED → RESOLVED
 *
 * DRIVER_CONTACTED is not a separate Mongo status — assignment triggers
 * the simulated driver contact, so ASSIGNED implies DRIVER_CONTACTED.
 */

/** @typedef {'RECOVERY_REQUIRED'|'ASSIGNED'|'DRIVER_CONTACTED'|'PICKUP_CONFIRMED'|'RECOVERED'|'RESOLVED'} RecoveryDisplayStatus */

/** @type {RecoveryDisplayStatus[]} */
export const RECOVERY_DISPLAY_STEPS = [
  'RECOVERY_REQUIRED',
  'ASSIGNED',
  'DRIVER_CONTACTED',
  'PICKUP_CONFIRMED',
  'RECOVERED',
  'RESOLVED',
];

const STEP_LABELS = {
  RECOVERY_REQUIRED: 'Recovery Required',
  ASSIGNED: 'Vehicle Assigned',
  DRIVER_CONTACTED: 'Driver Contacted',
  PICKUP_CONFIRMED: 'Pickup Confirmed',
  RECOVERED: 'Recovered',
  RESOLVED: 'Resolved',
};

/**
 * @param {RecoveryDisplayStatus | string | null | undefined} step
 * @returns {string}
 */
export function recoveryStepLabel(step) {
  if (!step) return '—';
  return STEP_LABELS[step] || String(step).replace(/_/g, ' ');
}

/**
 * Resolve the current operator-facing recovery step from shipment + incident.
 *
 * @param {{
 *   incident?: import('../../types/api.ts').Incident | null,
 *   shipment?: import('../../types/api.ts').Shipment | null,
 *   lifecycleStatus?: string | null,
 * }} [input]
 * @returns {RecoveryDisplayStatus | null}
 */
export function resolveRecoveryDisplayStatus({
  incident = null,
  shipment = null,
  lifecycleStatus = null,
} = {}) {
  const lifecycle =
    lifecycleStatus ||
    incident?.lifecycleStatus ||
    shipment?.lifecycleStatus ||
    null;
  const incidentStatus = incident?.status || null;
  const shipmentStatus = shipment?.status || null;

  if (incidentStatus === 'RESOLVED' || lifecycle === 'RECOVERED') {
    if (incidentStatus === 'RESOLVED') return 'RESOLVED';
    return 'RECOVERED';
  }

  if (incidentStatus === 'PICKUP_CONFIRMED' || lifecycle === 'PICKUP_CONFIRMED') {
    return 'PICKUP_CONFIRMED';
  }

  if (
    incidentStatus === 'ASSIGNED' ||
    lifecycle === 'RECOVERY_ASSIGNED' ||
    incident?.driverMessage
  ) {
    // Assignment contacts the driver in this demo — both steps reached.
    return 'DRIVER_CONTACTED';
  }

  if (
    incidentStatus === 'RECOVERY_REQUIRED' ||
    incidentStatus === 'OPEN' ||
    lifecycle === 'MISPLACED' ||
    lifecycle === 'RECOVERY_ANALYSIS' ||
    shipment?.needsRecovery ||
    shipment?.isMisplaced
  ) {
    return 'RECOVERY_REQUIRED';
  }

  if (shipmentStatus === 'recovered') return 'RECOVERED';
  if (shipmentStatus === 'misplaced') return 'RECOVERY_REQUIRED';

  return null;
}

/**
 * Index of the active step in RECOVERY_DISPLAY_STEPS (−1 if unknown).
 * @param {RecoveryDisplayStatus | string | null | undefined} status
 */
export function recoveryStepIndex(status) {
  if (!status) return -1;
  // ASSIGNED is a distinct step; DRIVER_CONTACTED is the active label once assigned.
  if (status === 'ASSIGNED') {
    return RECOVERY_DISPLAY_STEPS.indexOf('ASSIGNED');
  }
  return RECOVERY_DISPLAY_STEPS.indexOf(/** @type {RecoveryDisplayStatus} */ (status));
}

/**
 * Prefer human location name, then graph node key. Never invent values.
 * @param {...(string | null | undefined)} candidates
 * @returns {string | null}
 */
export function firstPresent(...candidates) {
  for (const value of candidates) {
    if (value != null && String(value).trim() !== '') return String(value);
  }
  return null;
}

/**
 * Format an ISO timestamp for display; return null if unavailable.
 * @param {string | null | undefined} iso
 * @returns {string | null}
 */
export function formatTimestamp(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}
