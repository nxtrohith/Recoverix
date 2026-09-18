/**
 * Centralized HTTP client for the SH-205 FastAPI backend.
 * Base URL comes from VITE_API_BASE_URL — never hardcode hosts in components.
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5055').replace(
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
      `Backend unavailable at ${BASE_URL}. Is FastAPI running?`,
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

export function getHealth() {
  return request('/api/health', { acceptStatuses: [200, 503] });
}

export function getGraph() {
  return request('/api/graph');
}

export function getHubs() {
  return request('/api/hubs');
}

export function getVehicles() {
  return request('/api/vehicles');
}

export function getVehicle(id) {
  return request(`/api/vehicles/${encodeURIComponent(id)}`);
}

export function getShipments() {
  return request('/api/shipments');
}

export function getShipment(id) {
  return request(`/api/shipments/${encodeURIComponent(id)}`);
}

export function getRecoveryAnalysis(shipmentId) {
  return request(`/api/recovery/${encodeURIComponent(shipmentId)}`);
}

export function calculateRecovery(shipmentId) {
  return request(`/api/recovery/${encodeURIComponent(shipmentId)}/calculate`, {
    method: 'POST',
  });
}

export function simulateIncident(shipmentId, { autoAnalyze = true } = {}) {
  return request('/api/incidents/simulate', {
    method: 'POST',
    body: JSON.stringify({
      shipment_id: shipmentId,
      auto_analyze: autoAnalyze,
    }),
  });
}

export function getActiveIncidents() {
  return request('/api/incidents/active');
}

export function assignRecovery(shipmentId, option = {}) {
  return request(`/api/recovery/${encodeURIComponent(shipmentId)}/assign`, {
    method: 'POST',
    body: JSON.stringify({
      candidateId: option.candidateId || null,
      vehicleId: option.vehicleId || null,
      path: option.path || null,
      pickupCase: option.pickupCase || null,
    }),
  });
}

export function resolveRecovery(shipmentId) {
  return request(`/api/recovery/${encodeURIComponent(shipmentId)}/resolve`, {
    method: 'POST',
  });
}

