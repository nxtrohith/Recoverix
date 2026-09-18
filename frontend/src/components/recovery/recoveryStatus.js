/**
 * Map backend incident / lifecycle statuses to the operator-facing
 * recovery status steps used by RecoveryTimeline / RecoveryStatus /
 * RecoveryActions.
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
 * DRIVER_CONTACTED is not a separate Mongo status — assignment records
 * the simulated driver contact (driverMessage / call channel).
 */

/** @typedef {'RECOVERY_REQUIRED'|'ASSIGNED'|'DRIVER_CONTACTED'|'PICKUP_CONFIRMED'|'RECOVERED'|'RESOLVED'} RecoveryDisplayStatus */

/** @typedef {'completed'|'current'|'upcoming'} TimelineStepState */

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

/** Factual operator context for the current display step (backend-derived only). */
export const RECOVERY_STATUS_CONTEXT = {
  RECOVERY_REQUIRED: 'Recovery has been recorded for this shipment.',
  ASSIGNED: 'Vehicle has been assigned.',
  DRIVER_CONTACTED: 'Driver contact has been recorded.',
  PICKUP_CONFIRMED: 'Shipment pickup has been confirmed.',
  RECOVERED: 'Recovery has been completed.',
  RESOLVED: 'Incident has been resolved.',
};

/** Next-step waiting hint — only when the workflow is still active. */
const STATUS_WAITING_HINT = {
  RECOVERY_REQUIRED: 'Waiting for recovery analysis or assignment.',
  ASSIGNED: 'Waiting for driver contact.',
  DRIVER_CONTACTED: 'Waiting for pickup confirmation.',
  PICKUP_CONFIRMED: 'Waiting for incident resolution.',
  RECOVERED: 'Waiting for incident resolution.',
};

/** Shipment event types written by the recovery workflow. */
export const RECOVERY_EVENT_TYPES = new Set([
  'misplaced',
  'recovery_started',
  'recovery_pickup_confirmed',
  'recovered',
]);

const EVENT_TYPE_LABELS = {
  misplaced: 'Recovery Required',
  recovery_started: 'Vehicle Assigned',
  recovery_pickup_confirmed: 'Pickup Confirmed',
  recovered: 'Recovered',
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
 * @param {RecoveryDisplayStatus | string | null | undefined} status
 * @returns {string | null}
 */
export function recoveryStatusContext(status) {
  if (!status) return null;
  return RECOVERY_STATUS_CONTEXT[status] || null;
}

/**
 * @param {RecoveryDisplayStatus | string | null | undefined} status
 * @returns {string | null}
 */
export function recoveryStatusWaitingHint(status) {
  if (!status || status === 'RESOLVED') return null;
  return STATUS_WAITING_HINT[status] || null;
}

/**
 * Whether driver contact was recorded on the incident / notification payload.
 * @param {{
 *   incident?: import('../../types/api.ts').Incident | null,
 *   driverNotification?: import('../../types/api.ts').DriverNotification | null,
 * }} [input]
 */
export function hasDriverContactRecord({
  incident = null,
  driverNotification = null,
} = {}) {
  return Boolean(
    incident?.driverMessage ||
      incident?.driverCallChannel ||
      incident?.driverCallAttemptId ||
      driverNotification?.message ||
      driverNotification?.channel ||
      driverNotification?.attemptId,
  );
}

/**
 * Resolve the current operator-facing recovery step from shipment + incident.
 *
 * @param {{
 *   incident?: import('../../types/api.ts').Incident | null,
 *   shipment?: import('../../types/api.ts').Shipment | null,
 *   lifecycleStatus?: string | null,
 *   driverNotification?: import('../../types/api.ts').DriverNotification | null,
 * }} [input]
 * @returns {RecoveryDisplayStatus | null}
 */
export function resolveRecoveryDisplayStatus({
  incident = null,
  shipment = null,
  lifecycleStatus = null,
  driverNotification = null,
} = {}) {
  const lifecycle =
    lifecycleStatus ||
    incident?.lifecycleStatus ||
    shipment?.lifecycleStatus ||
    null;
  const incidentStatus = incident?.status || null;
  const shipmentStatus = shipment?.status || null;
  const contacted = hasDriverContactRecord({ incident, driverNotification });

  if (incidentStatus === 'RESOLVED') {
    return 'RESOLVED';
  }

  // Pickup confirmed → shipment is recovered; emphasize RECOVERED until resolve
  if (
    incidentStatus === 'PICKUP_CONFIRMED' ||
    lifecycle === 'PICKUP_CONFIRMED'
  ) {
    if (shipmentStatus === 'recovered' || lifecycle === 'RECOVERED') {
      return 'RECOVERED';
    }
    return 'PICKUP_CONFIRMED';
  }

  if (lifecycle === 'RECOVERED' || shipmentStatus === 'recovered') {
    return 'RECOVERED';
  }

  if (
    incidentStatus === 'ASSIGNED' ||
    lifecycle === 'RECOVERY_ASSIGNED'
  ) {
    return contacted ? 'DRIVER_CONTACTED' : 'ASSIGNED';
  }

  // Contact evidence without ASSIGNED status (stale / partial payloads)
  if (contacted) {
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

  if (shipmentStatus === 'misplaced') return 'RECOVERY_REQUIRED';

  return null;
}

/**
 * Index of the active step in RECOVERY_DISPLAY_STEPS (−1 if unknown).
 * @param {RecoveryDisplayStatus | string | null | undefined} status
 */
export function recoveryStepIndex(status) {
  if (!status) return -1;
  return RECOVERY_DISPLAY_STEPS.indexOf(
    /** @type {RecoveryDisplayStatus} */ (status),
  );
}

/**
 * Per-step visual state for the lifecycle timeline.
 * ASSIGNED is marked completed once DRIVER_CONTACTED (or later) is current,
 * since contact is recorded as part of assignment in this demo.
 * PICKUP_CONFIRMED is completed once RECOVERED / RESOLVED is current.
 *
 * @param {RecoveryDisplayStatus | string | null | undefined} current
 * @returns {{ step: RecoveryDisplayStatus, state: TimelineStepState, label: string }[]}
 */
export function getRecoveryTimelineSteps(current) {
  const idx = recoveryStepIndex(current);
  const isComplete = current === 'RESOLVED';

  return RECOVERY_DISPLAY_STEPS.map((step, i) => {
    /** @type {TimelineStepState} */
    let state = 'upcoming';

    if (idx >= 0) {
      if (isComplete || i < idx) {
        state = 'completed';
      } else if (i === idx) {
        state = 'current';
      }
    }

    // Contact implies assignment completed
    if (
      step === 'ASSIGNED' &&
      (current === 'DRIVER_CONTACTED' ||
        current === 'PICKUP_CONFIRMED' ||
        current === 'RECOVERED' ||
        current === 'RESOLVED')
    ) {
      state = 'completed';
    }

    // Recovered / resolved implies pickup confirmed completed
    if (
      step === 'PICKUP_CONFIRMED' &&
      (current === 'RECOVERED' || current === 'RESOLVED')
    ) {
      state = 'completed';
    }

    // When RESOLVED, mark RECOVERED completed too (i < idx already covers this)
    if (step === 'RECOVERED' && current === 'RESOLVED') {
      state = 'completed';
    }

    return {
      step,
      state,
      label: recoveryStepLabel(step),
    };
  });
}

/**
 * Whether the recovery timeline should render for this shipment/incident.
 * Ordinary (non-recovery) shipments return false.
 *
 * @param {{
 *   incident?: import('../../types/api.ts').Incident | null,
 *   shipment?: import('../../types/api.ts').Shipment | null,
 *   lifecycleStatus?: string | null,
 * }} [input]
 */
export function shouldShowRecoveryTimeline({
  incident = null,
  shipment = null,
  lifecycleStatus = null,
} = {}) {
  const display = resolveRecoveryDisplayStatus({
    incident,
    shipment,
    lifecycleStatus,
  });
  if (display) return true;

  const lifecycle =
    lifecycleStatus ||
    incident?.lifecycleStatus ||
    shipment?.lifecycleStatus ||
    null;

  if (
    lifecycle &&
    lifecycle !== 'NORMAL' &&
    [
      'MISPLACED',
      'RECOVERY_ANALYSIS',
      'RECOVERY_ASSIGNED',
      'PICKUP_CONFIRMED',
      'RECOVERED',
    ].includes(lifecycle)
  ) {
    return true;
  }

  return Boolean(
    incident ||
      shipment?.needsRecovery ||
      shipment?.isMisplaced === true,
  );
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

/**
 * Short clock time for event rows (e.g. 09:42). Null if unavailable.
 * @param {string | null | undefined} iso
 * @returns {string | null}
 */
export function formatEventTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * @param {string | null | undefined} type
 * @returns {string}
 */
export function recoveryEventLabel(type) {
  if (!type) return 'Event';
  return EVENT_TYPE_LABELS[type] || String(type).replace(/_/g, ' ');
}

/**
 * Select recovery-related shipment events for the history log.
 * Does not invent events — only filters what the API returned.
 *
 * @param {import('../../types/api.ts').ShipmentEvent[] | null | undefined} events
 * @returns {import('../../types/api.ts').ShipmentEvent[]}
 */
export function selectRecoveryEvents(events) {
  if (!Array.isArray(events) || events.length === 0) return [];
  const filtered = events.filter(
    (ev) => ev && ev.type && RECOVERY_EVENT_TYPES.has(ev.type),
  );
  return filtered.slice().sort((a, b) => {
    const ta = a.timestamp ? Date.parse(a.timestamp) : NaN;
    const tb = b.timestamp ? Date.parse(b.timestamp) : NaN;
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return ta - tb;
  });
}

/**
 * Build a short factual description line from an event + optional context.
 * Only uses fields present on the payload — never invents text.
 *
 * @param {import('../../types/api.ts').ShipmentEvent} event
 * @param {{
 *   incident?: import('../../types/api.ts').Incident | null,
 *   shipment?: import('../../types/api.ts').Shipment | null,
 * }} [ctx]
 * @returns {string | null}
 */
export function recoveryEventDescription(event, ctx = {}) {
  if (!event) return null;
  if (event.notes && String(event.notes).trim()) {
    return String(event.notes).trim();
  }

  const { incident = null, shipment = null } = ctx;
  const location = firstPresent(event.location);
  const vehicle = firstPresent(
    incident?.recoveryVehicleNumber,
    incident?.recoveryDriverId,
    shipment?.assignedVehicleNumber,
  );

  if (event.type === 'misplaced' && location) {
    return `Shipment recorded at ${location}`;
  }
  if (event.type === 'recovery_started') {
    if (vehicle && location) return `${vehicle} assigned for recovery at ${location}`;
    if (vehicle) return `${vehicle} assigned for recovery`;
    if (location) return `Recovery started at ${location}`;
    return null;
  }
  if (event.type === 'recovery_pickup_confirmed') {
    if (location) return `Shipment picked up at ${location}`;
    return null;
  }
  if (event.type === 'recovered') {
    if (location) return `Recovery completed · ${location}`;
    return null;
  }
  return location ? `At ${location}` : null;
}
