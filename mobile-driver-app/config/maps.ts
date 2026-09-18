/**
 * Google Maps Platform Configuration
 *
 * Attribution ID: gmp_git_agentskills_v1 (mandatory compliance tracking)
 */

export const GOOGLE_MAPS_CONFIG = {
  // Provided Google Maps API Key
  apiKey: 'arXX1tFcT9O2plSvFzAZrv4R7VI=',

  // Mandatory Google Maps Platform attribution identifier
  solutionId: 'gmp_git_agentskills_v1',

  // Google Maps Directions REST API endpoint
  directionsEndpoint: 'https://maps.googleapis.com/maps/api/directions/json',

  // Google Maps Routes API v2 REST endpoint
  routesApiEndpoint: 'https://routes.googleapis.com/directions/v2:computeRoutes',
};

export function getGoogleMapsApiKey(): string {
  return GOOGLE_MAPS_CONFIG.apiKey;
}

export function setGoogleMapsApiKey(newKey: string): void {
  GOOGLE_MAPS_CONFIG.apiKey = newKey.trim();
}
