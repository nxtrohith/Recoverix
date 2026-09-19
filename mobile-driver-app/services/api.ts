/**
 * HTTP client for the SH-205 Node API gateway (proxies /api/* → FastAPI).
 * Mirrors frontend/src/api/client.js — backend remains source of truth.
 */

const BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  'http://127.0.0.1:3000'
).replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  code: string;
  body: unknown;

  constructor(
    message: string,
    { status = 0, code = 'API_ERROR', body = null }: { status?: number; code?: string; body?: unknown } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

async function request<T = any>(path: string, options: RequestInit & { acceptStatuses?: number[] } = {}): Promise<T> {
  const { acceptStatuses = [], ...fetchOptions } = options;
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(fetchOptions.body ? { 'Content-Type': 'application/json' } : {}),
        ...(fetchOptions.headers || {}),
      },
      ...fetchOptions,
    });
  } catch (err) {
    throw new ApiError(
      `Backend unavailable at ${BASE_URL}. Is the Node gateway running?`,
      { status: 0, code: 'NETWORK_ERROR', body: { reason: String(err) } },
    );
  }

  let body: any = null;
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

  return body as T;
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

export function getVehicle(id: string) {
  return request(`/api/vehicles/${encodeURIComponent(id)}`);
}

export function getShipments() {
  return request('/api/shipments');
}

export function getShipment(shipmentId: string) {
  return request(`/api/shipments/${encodeURIComponent(shipmentId)}`);
}

export function getActiveIncidents() {
  return request('/api/incidents/active');
}

export function getIncidentByShipment(shipmentId: string) {
  return request(`/api/incidents/by-shipment/${encodeURIComponent(shipmentId)}`);
}

export function getRecovery(shipmentId: string) {
  return request(`/api/recovery/${encodeURIComponent(shipmentId)}`);
}

export function pickupRecovery(shipmentId: string) {
  return request(`/api/recovery/${encodeURIComponent(shipmentId)}/pickup`, {
    method: 'POST',
  });
}

export function resolveRecovery(shipmentId: string) {
  return request(`/api/recovery/${encodeURIComponent(shipmentId)}/resolve`, {
    method: 'POST',
  });
}

export function getDriverCallStatus(shipmentId: string) {
  return request(`/api/recovery/${encodeURIComponent(shipmentId)}/call-status`);
}
