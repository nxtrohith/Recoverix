/**
 * Derive recovery map overlay state from backend payloads.
 * No shortest-path / routing math — only reuses API-provided node sequences
 * and resolves them against already-loaded graph coordinates.
 */

import { candidateTypeLabel, findVehicle } from './candidateUtils';
import { firstPresent } from './recoveryStatus';

/**
 * @param {import('../../types/api.ts').GraphNode | null | undefined} node
 * @returns {[number, number] | null}
 */
export function nodeLatLng(node) {
  if (!node) return null;
  const lat = node.latitude;
  const lon = node.longitude;
  if (lat == null || lon == null) return null;
  const a = Number(lat);
  const b = Number(lon);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [a, b];
}

/**
 * @param {string[] | null | undefined} path
 * @param {Map<string, import('../../types/api.ts').GraphNode>} nodeById
 * @returns {[number, number][]}
 */
export function pathToLatLngs(path, nodeById) {
  if (!Array.isArray(path) || !path.length || !nodeById) return [];
  const out = [];
  for (const id of path) {
    const ll = nodeLatLng(nodeById.get(id));
    if (ll) out.push(ll);
  }
  return out;
}

/**
 * Split a backend-provided path at the pickup hub (no new nodes invented).
 * @param {string[] | null | undefined} path
 * @param {string | null | undefined} pickupNode
 * @returns {{ toPickup: string[], fromPickup: string[] }}
 */
export function splitPathAtPickup(path, pickupNode) {
  const nodes = Array.isArray(path) ? path.filter(Boolean) : [];
  if (!nodes.length) return { toPickup: [], fromPickup: [] };
  if (!pickupNode) return { toPickup: [], fromPickup: nodes };
  const idx = nodes.indexOf(pickupNode);
  if (idx < 0) return { toPickup: [], fromPickup: nodes };
  return {
    toPickup: nodes.slice(0, idx + 1),
    fromPickup: nodes.slice(idx),
  };
}

/**
 * Whether recovery overlays should be shown (active incident / analysis).
 * @param {{
 *   activeIncident?: import('../../types/api.ts').Incident | null,
 *   recoveryAnalysis?: import('../../types/api.ts').RecoveryAnalysis | null,
 * }} input
 */
export function isRecoveryMapActive({ activeIncident, recoveryAnalysis }) {
  if (activeIncident?.status && activeIncident.status !== 'RESOLVED') {
    return true;
  }
  if (
    recoveryAnalysis?.status === 'RECOVERY_PLAN_AVAILABLE' ||
    recoveryAnalysis?.selectedRecovery ||
    recoveryAnalysis?.recoveryPlan ||
    (recoveryAnalysis?.candidates || []).length > 0
  ) {
    return true;
  }
  return false;
}

/**
 * First non-empty hub sequence from backend fields.
 * @param {...(string[] | null | undefined)} paths
 * @returns {string[]}
 */
export function firstNonEmptyPath(...paths) {
  for (const p of paths) {
    if (Array.isArray(p) && p.length) return p;
  }
  return [];
}

/**
 * Resolve the active recovery candidate for map overlays.
 * Preview (inspect) is optional and must not invent routes.
 *
 * @param {{
 *   recoveryAnalysis?: import('../../types/api.ts').RecoveryAnalysis | null,
 *   activeIncident?: import('../../types/api.ts').Incident | null,
 *   previewCandidateId?: string | null,
 * }} input
 */
export function resolveActiveRecoveryCandidate({
  recoveryAnalysis = null,
  activeIncident = null,
  previewCandidateId = null,
} = {}) {
  const candidates = recoveryAnalysis?.candidates || [];
  const selectedId =
    activeIncident?.selectedCandidateId ||
    recoveryAnalysis?.selectedRecovery?.candidateId ||
    recoveryAnalysis?.recoveryPlan?.candidateId ||
    null;

  const preview =
    previewCandidateId && previewCandidateId !== selectedId
      ? candidates.find((c) => c.candidateId === previewCandidateId) || null
      : null;

  const selected =
    (selectedId && candidates.find((c) => c.candidateId === selectedId)) ||
    null;

  const selectedRecovery = recoveryAnalysis?.selectedRecovery || null;
  const plan = recoveryAnalysis?.recoveryPlan || null;

  // Prefer assigned incident path, then selected recovery, then plan, then candidate
  const assignedPath =
    (activeIncident?.status === 'ASSIGNED' ||
      activeIncident?.status === 'PICKUP_CONFIRMED') &&
    activeIncident?.recoveryPath?.length
      ? activeIncident.recoveryPath
      : null;

  const recoveryPath =
    assignedPath ||
    selectedRecovery?.path ||
    plan?.path ||
    selected?.path ||
    [];

  const existingRouteNodes = firstNonEmptyPath(
    activeIncident?.existingRouteNodes,
    selectedRecovery?.existingRouteNodes,
    plan?.existingRouteNodes,
    selected?.existingRouteNodes,
  );
  const vehicleToPickupPath = firstNonEmptyPath(
    activeIncident?.vehicleToPickupPath,
    selectedRecovery?.vehicleToPickupPath,
    plan?.vehicleToPickupPath,
    selected?.vehicleToPickupPath,
  );
  const vehicleToDestinationPath = firstNonEmptyPath(
    activeIncident?.vehicleToDestinationPath,
    selectedRecovery?.vehicleToDestinationPath,
    plan?.vehicleToDestinationPath,
    selected?.vehicleToDestinationPath,
  );

  const pickupCase =
    activeIncident?.pickupCase ||
    selectedRecovery?.pickupCase ||
    plan?.candidateType ||
    selected?.pickupCase ||
    null;

  const vehicleId =
    activeIncident?.recoveryVehicleId ||
    selectedRecovery?.vehicleId ||
    plan?.selectedVehicleId ||
    selected?.vehicleId ||
    null;

  const vehicleNumber =
    activeIncident?.recoveryVehicleNumber ||
    selectedRecovery?.vehicleNumber ||
    selected?.vehicleNumber ||
    null;

  return {
    selectedId,
    selected,
    selectedRecovery,
    plan,
    recoveryPath: Array.isArray(recoveryPath) ? recoveryPath : [],
    existingRouteNodes,
    vehicleToPickupPath,
    vehicleToDestinationPath,
    pickupCase,
    vehicleId,
    vehicleNumber,
    preview,
    previewPath: preview?.path || [],
    previewExistingRouteNodes: preview?.existingRouteNodes || [],
    previewToPickupPath: preview?.vehicleToPickupPath || [],
    previewToDestinationPath: preview?.vehicleToDestinationPath || [],
    previewPickupCase: preview?.pickupCase || null,
    previewVehicleId: preview?.vehicleId || null,
  };
}

/**
 * Build a single recovery map overlay descriptor for LogisticsMap.
 *
 * @param {{
 *   graph?: { nodes?: import('../../types/api.ts').GraphNode[] } | null,
 *   selectedShipment?: import('../../types/api.ts').Shipment | null,
 *   recoveryAnalysis?: import('../../types/api.ts').RecoveryAnalysis | null,
 *   activeIncident?: import('../../types/api.ts').Incident | null,
 *   vehicles?: import('../../types/api.ts').Vehicle[],
 *   selectedVehicle?: import('../../types/api.ts').Vehicle | null,
 *   previewCandidateId?: string | null,
 * }} input
 */
export function buildRecoveryMapState({
  graph = null,
  selectedShipment = null,
  recoveryAnalysis = null,
  activeIncident = null,
  vehicles = [],
  selectedVehicle = null,
  previewCandidateId = null,
} = {}) {
  const nodeById = new Map();
  for (const n of graph?.nodes || []) {
    if (n?.id) nodeById.set(n.id, n);
  }

  const active = isRecoveryMapActive({ activeIncident, recoveryAnalysis });
  const network = recoveryAnalysis?.network || {};
  const cand = resolveActiveRecoveryCandidate({
    recoveryAnalysis,
    activeIncident,
    previewCandidateId,
  });

  const originNode = firstPresent(
    selectedShipment?.originNode,
    // planned route first stop is a fallback only when originNode missing
    network.plannedRoute?.[0],
    selectedShipment?.plannedRoute?.[0],
  );
  const expectedNode = firstPresent(
    selectedShipment?.expectedNode,
    network.expectedNode,
  );
  const actualNode = firstPresent(
    activeIncident?.pickupNode,
    activeIncident?.hubName,
    selectedShipment?.actualNode,
    selectedShipment?.currentNode,
    network.actualNode,
    network.currentNode,
  );
  const destinationNode = firstPresent(
    activeIncident?.destinationNode,
    cand.plan?.destinationNode,
    selectedShipment?.destinationNode,
    network.destinationNode,
  );
  const pickupNode = firstPresent(
    activeIncident?.pickupNode,
    cand.plan?.pickupNode,
    actualNode,
    cand.recoveryPath[0],
  );

  const plannedRoute =
    (Array.isArray(selectedShipment?.plannedRoute) &&
    selectedShipment.plannedRoute.length
      ? selectedShipment.plannedRoute
      : null) ||
    (Array.isArray(network.plannedRoute) && network.plannedRoute.length
      ? network.plannedRoute
      : null) ||
    [];

  // Prefer explicit backend segments; fall back to splitting composed path
  const split = splitPathAtPickup(cand.recoveryPath, pickupNode);
  const toPickup = firstNonEmptyPath(cand.vehicleToPickupPath, split.toPickup);
  const fromPickup = firstNonEmptyPath(
    cand.vehicleToDestinationPath,
    split.fromPickup,
  );

  const recoveryVehicle =
    findVehicle(vehicles, cand.vehicleId) ||
    (selectedVehicle?.id === cand.vehicleId ? selectedVehicle : null);

  // Prefer generator existingRouteNodes; fall back to vehicle detail currentPath
  const vehicleExistingPath = firstNonEmptyPath(
    cand.existingRouteNodes,
    selectedVehicle?.id === cand.vehicleId ? selectedVehicle?.currentPath : null,
    recoveryVehicle?.currentPath,
  );

  const previewVehicle =
    findVehicle(vehicles, cand.previewVehicleId) ||
    (selectedVehicle?.id === cand.previewVehicleId ? selectedVehicle : null);

  const expectedLatLngs = pathToLatLngs(plannedRoute, nodeById);
  const recoveryLatLngs = pathToLatLngs(cand.recoveryPath, nodeById);
  const toPickupLatLngs = pathToLatLngs(toPickup, nodeById);
  const fromPickupLatLngs = pathToLatLngs(fromPickup, nodeById);
  const vehicleRouteLatLngs = pathToLatLngs(vehicleExistingPath, nodeById);
  const previewLatLngs = pathToLatLngs(
    firstNonEmptyPath(
      cand.previewPath,
      cand.previewToPickupPath,
      cand.previewToDestinationPath,
    ),
    nodeById,
  );

  const originPos = nodeLatLng(nodeById.get(originNode));
  const expectedPos = nodeLatLng(nodeById.get(expectedNode));
  const actualPos = nodeLatLng(nodeById.get(actualNode));
  const pickupPos = nodeLatLng(nodeById.get(pickupNode)) || actualPos;
  const destinationPos = nodeLatLng(nodeById.get(destinationNode));
  const vehiclePos = nodeLatLng(
    nodeById.get(recoveryVehicle?.currentNode || null),
  );

  const fitPositions = [];
  for (const p of [
    ...expectedLatLngs,
    ...recoveryLatLngs,
    ...vehicleRouteLatLngs,
    ...previewLatLngs,
    originPos,
    expectedPos,
    actualPos,
    pickupPos,
    destinationPos,
    vehiclePos,
  ]) {
    if (p) fitPositions.push(p);
  }

  return {
    active,
    nodeById,
    originNode,
    expectedNode,
    actualNode,
    pickupNode,
    destinationNode,
    plannedRoute,
    recoveryPath: cand.recoveryPath,
    toPickupPath: toPickup,
    fromPickupPath: fromPickup,
    vehicleExistingPath,
    pickupCase: cand.pickupCase,
    pickupCaseLabel: candidateTypeLabel(cand.pickupCase),
    vehicleId: cand.vehicleId,
    vehicleNumber:
      cand.vehicleNumber ||
      recoveryVehicle?.vehicleNumber ||
      null,
    recoveryVehicle,
    driverHandle:
      recoveryVehicle?.vehicleNumber ||
      cand.vehicleNumber ||
      null,
    vehicleCurrentNode: recoveryVehicle?.currentNode || null,
    expectedLatLngs,
    recoveryLatLngs,
    toPickupLatLngs,
    fromPickupLatLngs,
    vehicleRouteLatLngs,
    originPos,
    expectedPos,
    actualPos,
    pickupPos,
    destinationPos,
    vehiclePos,
    preview: cand.preview
      ? {
          candidateId: cand.preview.candidateId,
          path: cand.previewPath,
          latLngs: previewLatLngs,
          pickupCase: cand.previewPickupCase,
          pickupCaseLabel: candidateTypeLabel(cand.previewPickupCase),
          vehicleId: cand.previewVehicleId,
          vehicleNumber: cand.preview?.vehicleNumber || null,
          vehicle: previewVehicle,
        }
      : null,
    selectedCandidateId: cand.selectedId,
    fitPositions,
  };
}
