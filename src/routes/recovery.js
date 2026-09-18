/**
 * API proxy routes — forwards all /api/* requests to the Python FastAPI service.
 *
 * Explicitly handled routes:
 *   GET  /api/health
 *   GET  /api/hubs
 *   GET  /api/graph
 *   GET  /api/vehicles
 *   GET  /api/vehicles/:vehicleId
 *   GET  /api/shipments
 *   GET  /api/shipments/:shipmentId
 *   GET  /api/recovery/:shipmentId
 *   POST /api/recovery/analyze/:shipmentId
 *   POST /api/recovery/graph/refresh
 *
 * Any /api/* path not handled above is forwarded transparently so new
 * FastAPI endpoints are available immediately without Node changes.
 */

import { proxyToRecovery } from '../services/recoveryProxy.js';

/**
 * @param {string} pathname
 * @param {string} method
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @returns {boolean} true if the request was handled (or proxied)
 */
export function handleApiRoutes(pathname, method, req, res) {
  // Only forward /api/* paths.
  if (!pathname.startsWith('/api/')) {
    return false;
  }

  // Proxy the request transparently to FastAPI.
  // The path is forwarded as-is; FastAPI owns all /api/* routing.
  proxyToRecovery(req, res, pathname, method);
  return true;
}

// ---------------------------------------------------------------------------
// Legacy named export — kept for backwards compatibility with src/index.js
// ---------------------------------------------------------------------------

/**
 * @deprecated Use handleApiRoutes instead — this now delegates to it.
 */
export function handleRecoveryRoutes(pathname, method, req, res) {
  return handleApiRoutes(pathname, method, req, res);
}
