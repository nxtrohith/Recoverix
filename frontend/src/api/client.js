/**
 * Centralized HTTP client for the SH-205 Node API gateway.
 * Base URL comes from VITE_API_BASE_URL — never hardcode hosts in components.
 * Default: Node proxy on :3000 (forwards /api/* to FastAPI on :5055).
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000').replace(
  /\/$/,
  '',
);

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'API_ERROR', body = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

async function request(path, options = {}) {
  const { acceptStatuses = [], ...fetchOptions } = options;
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(fetchOptions.body ? { 'Content-Type': 'application/json' } : {}),
        ...fetchOptions.headers,
      },
      ...fetchOptions,
    });
  } catch (err) {
    throw new ApiError(
      `Backend unavailable at ${BASE_URL}. Is the Node API gateway running on :3000?`,
      { status: 0, code: 'NETWORK_ERROR', body: { reason: String(err) } },
    );
  }

  let body = null;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  if (!response.ok && !acceptStatuses.includes(response.status)) {
    const detail = body?.error || {};
    throw new ApiError(detail.message || body?.detail || `HTTP ${response.status}`, {
      status: response.status,
      code: detail.code || 'HTTP_ERROR',
      body,
    });
  }

  return body;
}

export function getApiBaseUrl() {
  return BASE_URL;
}

// ---------------------------------------------------------------------------
// Health / topology
// ---------------------------------------------------------------------------

export function getHealth() {
  return request('/api/health', { acceptStatuses: [200, 503] });
}

export function getGraph() {
  return request('/api/graph');
}

export function getHubs() {
  return request('/api/hubs');
}

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

/** @returns {Promise<import('../types/api.ts').VehicleListResponse>} */
export function getVehicles() {
  return request('/api/vehicles');
}

/** @returns {Promise<import('../types/api.ts').Vehicle>} */
export function getVehicle(id) {
  return request(`/api/vehicles/${encodeURIComponent(id)}`);
}

// ---------------------------------------------------------------------------
// Shipments
// ---------------------------------------------------------------------------

/** @returns {Promise<import('../types/api.ts').ShipmentListResponse>} */
export function getShipments() {
  return request('/api/shipments');
}

/** @returns {Promise<import('../types/api.ts').Shipment>} */
export function getShipment(shipmentId) {
  return request(`/api/shipments/${encodeURIComponent(shipmentId)}`);
}

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------

/** @returns {Promise<import('../types/api.ts').ActiveIncidentsResponse>} */
export function getActiveIncidents() {
  return request('/api/incidents/active');
}

/**
 * Latest incident for a shipment (active or resolved).
 * @returns {Promise<import('../types/api.ts').IncidentByShipmentResponse>}
 */
export function getIncidentByShipment(shipmentId) {
  return request(`/api/incidents/by-shipment/${encodeURIComponent(shipmentId)}`);
}

/**
 * @param {string} shipmentId
 * @param {{ autoAnalyze?: boolean }} [opts]
 * @returns {Promise<import('../types/api.ts').SimulateIncidentResponse>}
 */
export function simulateIncident(shipmentId, { autoAnalyze = true } = {}) {
  return request('/api/incidents/simulate', {
    method: 'POST',
    body: JSON.stringify({
      shipment_id: shipmentId,
      auto_analyze: autoAnalyze,
    }),
  });
}

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

/**
 * Run (or re-run) full recovery analysis for a shipment.
 * Response includes candidates + selectedRecovery + recoveryPlan when persisted.
 * @returns {Promise<import('../types/api.ts').RecoveryAnalysis>}
 */
export function getRecovery(shipmentId) {
  return request(`/api/recovery/${encodeURIComponent(shipmentId)}`);
}

/** Alias kept for existing call sites. */
export function getRecoveryAnalysis(shipmentId) {
  return getRecovery(shipmentId);
}

/**
 * Explicit calculate verb — same pipeline as GET /api/recovery/:id.
 * @returns {Promise<import('../types/api.ts').RecoveryAnalysis>}
 */
export function calculateRecovery(shipmentId) {
  return request(`/api/recovery/${encodeURIComponent(shipmentId)}/calculate`, {
    method: 'POST',
  });
}

/**
 * Explicit analyze verb — POST /api/recovery/analyze/:id.
 * @returns {Promise<import('../types/api.ts').RecoveryAnalysis>}
 */
export function analyzeRecovery(shipmentId) {
  return request(`/api/recovery/analyze/${encodeURIComponent(shipmentId)}`, {
    method: 'POST',
  });
}

/**
 * @param {string} shipmentId
 * @param {import('../types/api.ts').AssignRecoveryPayload} [payload]
 * @returns {Promise<import('../types/api.ts').AssignRecoveryResponse>}
 */
export function assignRecovery(shipmentId, payload = {}) {
  return request(`/api/recovery/${encodeURIComponent(shipmentId)}/assign`, {
    method: 'POST',
    body: JSON.stringify({
      candidateId: payload.candidateId || null,
      vehicleId: payload.vehicleId || null,
      path: payload.path || null,
      pickupCase: payload.pickupCase || null,
      score: payload.score ?? null,
    }),
  });
}

/**
 * Simulated driver pickup confirmation (endpoint exists on FastAPI).
 * @returns {Promise<import('../types/api.ts').PickupRecoveryResponse>}
 */
export function pickupRecovery(shipmentId, _payload = {}) {
  return request(`/api/recovery/${encodeURIComponent(shipmentId)}/pickup`, {
    method: 'POST',
  });
}

/** Alias kept for existing call sites. */
export function confirmRecoveryPickup(shipmentId) {
  return pickupRecovery(shipmentId);
}

/**
 * @param {string} shipmentId
 * @param {Record<string, unknown>} [_payload]
 * @returns {Promise<import('../types/api.ts').ResolveRecoveryResponse>}
 */
export function resolveRecovery(shipmentId, _payload = {}) {
  return request(`/api/recovery/${encodeURIComponent(shipmentId)}/resolve`, {
    method: 'POST',
  });
}

/**
 * Explicitly trigger or retry an outbound Sarvam phone call to the driver.
 * @param {string} shipmentId
 * @param {{ phone?: string }} [payload]
 */
export function retryDriverCall(shipmentId, payload = {}) {
  return request(`/api/recovery/${encodeURIComponent(shipmentId)}/retry-call`, {
    method: 'POST',
    body: JSON.stringify({
      phone: payload.phone || null,
    }),
  });
}

/**
 * Fetch current driver call status from the backend.
 * @param {string} shipmentId
 */
export function getDriverCallStatus(shipmentId) {
  return request(`/api/recovery/${encodeURIComponent(shipmentId)}/call-status`);
}

/**
 * Update driver call status in backend.
 * @param {string} shipmentId
 * @param {{ status: string, failure_reason?: string }} payload
 */
export function updateDriverCallStatus(shipmentId, payload) {
  return request(`/api/recovery/${encodeURIComponent(shipmentId)}/call-status`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Test endpoint for immediate real-time Sarvam Telugu driver call testing.
 * @param {{ phone: string, shipment_id?: string, shipmentId?: string }} payload
 */
export function testSarvamCall(payload) {
  return request('/api/sarvam/test-call', {
    method: 'POST',
    body: JSON.stringify({
      phone: payload.phone,
      shipment_id: payload.shipment_id || payload.shipmentId || 'SHP-TEST-001',
    }),
  });
}

