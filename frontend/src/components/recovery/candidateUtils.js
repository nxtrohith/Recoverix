/**
 * Helpers for recovery candidate display.
 * Backend remains source of truth — no score/feasibility recalculation.
 */

/** Display labels for pickupCase / candidate type. */
export const CANDIDATE_TYPE_LABELS = {
  at_node: 'AT PICKUP NODE',
  pass_through: 'PASS-THROUGH',
  detour: 'DETOUR',
  none: 'DIRECT',
};

/** Ordered score component keys as returned by the scorer. */
export const SCORE_COMPONENT_KEYS = [
  'time',
  'cost',
  'capacity',
  'deadline',
  'priority',
  'detour',
  'connectivity',
];

const SCORE_COMPONENT_LABELS = {
  time: 'Time',
  cost: 'Cost',
  capacity: 'Capacity',
  deadline: 'Deadline',
  priority: 'Priority',
  detour: 'Detour',
  connectivity: 'Connectivity',
};

/**
 * @param {string | null | undefined} pickupCase
 * @returns {string}
 */
export function candidateTypeLabel(pickupCase) {
  if (!pickupCase) return '—';
  return CANDIDATE_TYPE_LABELS[pickupCase] || String(pickupCase).replace(/_/g, ' ').toUpperCase();
}

/**
 * @param {import('../../types/api.ts').RecoveryCandidate | null | undefined} c
 * @returns {boolean}
 */
export function isCandidateFeasible(c) {
  if (!c) return false;
  if (typeof c.feasible === 'boolean') return c.feasible;
  if (typeof c.feasibility === 'boolean') return c.feasibility;
  return false;
}

/**
 * Overall score from backend only.
 * @param {import('../../types/api.ts').RecoveryCandidate | import('../../types/api.ts').SelectedRecovery | null | undefined} c
 * @returns {number | null}
 */
export function candidateScore(c) {
  if (!c) return null;
  if (c.score != null && !Number.isNaN(Number(c.score))) return Number(c.score);
  if (c.totalScore != null && !Number.isNaN(Number(c.totalScore))) {
    return Number(c.totalScore);
  }
  return null;
}

/**
 * @param {import('../../types/api.ts').RecoveryCandidate | null | undefined} c
 * @returns {import('../../types/api.ts').ComponentScores | null}
 */
export function candidateComponentScores(c) {
  if (!c) return null;
  return c.componentScores || c.breakdown || null;
}

/**
 * @param {number | null | undefined} value
 * @param {number} [digits]
 * @returns {string}
 */
export function fmtNum(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(digits);
}

/**
 * @param {string[]} [path]
 * @returns {string | null}
 */
export function pathSummary(path) {
  if (!Array.isArray(path) || !path.length) return null;
  if (path.length === 1) return path[0];
  return `${path[0]} → ${path[path.length - 1]}`;
}

/**
 * @param {string} key
 * @returns {string}
 */
export function scoreComponentLabel(key) {
  return SCORE_COMPONENT_LABELS[key] || key;
}

/**
 * Factual one-liner when backend explanation is missing.
 * Uses only known fields — no speculation.
 * @param {{
 *   candidate?: import('../../types/api.ts').RecoveryCandidate | null,
 *   selected?: import('../../types/api.ts').SelectedRecovery | null,
 *   plan?: import('../../types/api.ts').RecoveryPlan | null,
 *   network?: import('../../types/api.ts').RecoveryNetwork | null,
 * }} input
 * @returns {string | null}
 */
export function factualSelectionSummary({
  candidate = null,
  selected = null,
  plan = null,
  network = null,
} = {}) {
  const vehicle =
    selected?.vehicleNumber ||
    selected?.vehicleId ||
    candidate?.vehicleNumber ||
    candidate?.vehicleId ||
    plan?.selectedVehicleId ||
    null;
  const pickup =
    plan?.pickupNode ||
    network?.actualNode ||
    network?.currentNode ||
    (selected?.path && selected.path[0]) ||
    (candidate?.path && candidate.path[0]) ||
    null;
  const destination =
    plan?.destinationNode ||
    network?.destinationNode ||
    (selected?.path && selected.path[selected.path.length - 1]) ||
    (candidate?.path && candidate.path[candidate.path.length - 1]) ||
    null;
  const type = candidateTypeLabel(
    selected?.pickupCase || plan?.candidateType || candidate?.pickupCase,
  );

  if (!vehicle && !pickup) return null;

  const parts = [];
  if (vehicle) parts.push(`Vehicle ${vehicle}`);
  if (type && type !== '—') parts.push(`(${type})`);
  if (pickup && destination) {
    parts.push(`recovers from ${pickup} toward ${destination}`);
  } else if (pickup) {
    parts.push(`recovers from ${pickup}`);
  }
  return parts.length ? `${parts.join(' ')}.` : null;
}

/**
 * Look up a vehicle from the dashboard list for optional enrichment.
 * @param {import('../../types/api.ts').Vehicle[] | null | undefined} vehicles
 * @param {string | null | undefined} vehicleId
 */
export function findVehicle(vehicles, vehicleId) {
  if (!vehicles?.length || !vehicleId) return null;
  return vehicles.find((v) => v.id === vehicleId) || null;
}
