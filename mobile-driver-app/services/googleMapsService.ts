import { Linking, Platform } from 'react-native';
import { LocationCoordinate, NavigationManeuver, Route, ManeuverType } from '../types/navigation';
import { GOOGLE_MAPS_CONFIG, getGoogleMapsApiKey } from '../config/maps';
import { calculateBearing } from '../utils/distance';

/**
 * Google Maps Platform Service
 *
 * Provides real-time Google Maps Directions & Routes API integration,
 * polyline decoding, turn-by-turn maneuver extraction, and external
 * turn-by-turn navigation deep-linking.
 *
 * Includes mandatory Google Maps Platform compliance tracking:
 * X-Goog-Maps-Solution-ID: gmp_git_agentskills_v1
 */

/**
 * Decodes a Google Maps encoded polyline string into an array of coordinates.
 * Reference: Google Maps Encoded Polyline Algorithm Format
 */
export function decodePolyline(encoded: string): LocationCoordinate[] {
  const points: LocationCoordinate[] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }

  // Calculate bearings between sequential points
  for (let i = 0; i < points.length; i++) {
    if (i < points.length - 1) {
      points[i].heading = calculateBearing(points[i], points[i + 1]);
    } else if (i > 0) {
      points[i].heading = points[i - 1].heading;
    }
  }

  return points;
}

/**
 * Strips HTML formatting from Google Directions maneuver instructions.
 */
function cleanManeuverInstruction(html: string): string {
  return html
    .replace(/<div[^>]*>/gi, ' - ')
    .replace(/<\/div>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferManeuverType(maneuver: string | undefined, html: string): ManeuverType {
  if (maneuver) {
    const m = maneuver.toLowerCase();
    if (m.includes('slight-left')) return 'turn-slight-left';
    if (m.includes('sharp-left')) return 'turn-sharp-left';
    if (m.includes('left')) return 'turn-left';
    if (m.includes('slight-right')) return 'turn-slight-right';
    if (m.includes('sharp-right')) return 'turn-sharp-right';
    if (m.includes('right')) return 'turn-right';
    if (m.includes('uturn')) return 'uturn';
    if (m.includes('roundabout')) return 'roundabout';
    if (m.includes('merge')) return 'merge';
    if (m.includes('fork-right')) return 'fork-right';
    if (m.includes('fork-left')) return 'fork-left';
    if (m.includes('ramp')) return 'ramp-right';
    if (m.includes('straight')) return 'straight';
  }

  const text = html.toLowerCase();
  if (text.includes('u-turn') || text.includes('uturn')) return 'uturn';
  if (text.includes('roundabout')) return 'roundabout';
  if (text.includes('sharp right')) return 'turn-sharp-right';
  if (text.includes('slight right') || text.includes('bear right')) return 'turn-slight-right';
  if (text.includes('turn right')) return 'turn-right';
  if (text.includes('sharp left')) return 'turn-sharp-left';
  if (text.includes('slight left') || text.includes('bear left')) return 'turn-slight-left';
  if (text.includes('turn left')) return 'turn-left';
  if (text.includes('merge')) return 'merge';
  if (text.includes('fork right') || text.includes('keep right')) return 'fork-right';
  if (text.includes('fork left') || text.includes('keep left')) return 'fork-left';
  if (text.includes('ramp')) return 'ramp-right';
  return 'straight';
}

/**
 * Fetches real driving directions from Google Maps Directions API.
 * Returns null if the API key is unauthorized or fails, allowing graceful fallback.
 */
export async function fetchGoogleDirections(
  origin: LocationCoordinate,
  destination: LocationCoordinate,
  destinationName: string = 'Destination'
): Promise<Route | null> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return null;

  try {
    const originStr = `${origin.latitude},${origin.longitude}`;
    const destStr = `${destination.latitude},${destination.longitude}`;
    const url = `${GOOGLE_MAPS_CONFIG.directionsEndpoint}?origin=${originStr}&destination=${destStr}&mode=driving&key=${apiKey}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Goog-Maps-Solution-ID': GOOGLE_MAPS_CONFIG.solutionId,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (data.status !== 'OK' || !data.routes || data.routes.length === 0) {
      return null;
    }

    const primaryRoute = data.routes[0];
    const leg = primaryRoute.legs[0];

    // Decode polyline points
    const waypoints = decodePolyline(primaryRoute.overview_polyline.points);

    // Parse turn-by-turn maneuvers with rich spatial and voice metadata
    const maneuvers: NavigationManeuver[] = leg.steps.map((step: any, idx: number) => {
      const cleanText = cleanManeuverInstruction(step.html_instructions);
      const maneuverType = inferManeuverType(step.maneuver, step.html_instructions);
      const coord: LocationCoordinate = {
        latitude: step.start_location.lat,
        longitude: step.start_location.lng,
      };

      return {
        id: `gstep-${idx}`,
        instruction: cleanText,
        distanceMeters: step.distance?.value || 0,
        iconName: step.maneuver || 'navigation',
        maneuverType,
        coordinate: coord,
        roadName: cleanText.split(' onto ')[1] || cleanText.split(' on ')[1] || '',
        spokenInstruction: cleanText,
      };
    });

    const distanceKm = Math.round((leg.distance?.value || 0) / 100) / 10;
    const durationMin = Math.round((leg.duration?.value || 0) / 60);

    return {
      id: `GOOGLE-ROUTE-${Date.now()}`,
      name: `${leg.start_address?.split(',')[0] || 'Origin'} → ${destinationName}`,
      fromWarehouseId: 'ORIGIN',
      toWarehouseId: 'DEST',
      originName: leg.start_address?.split(',')[0] || 'Current Location',
      destinationName: destinationName,
      distanceKm,
      estimatedMinutes: durationMin,
      waypoints,
      maneuvers,
    };
  } catch {
    return null;
  }
}

/**
 * Launches the native Google Maps turn-by-turn navigation app on the driver's device.
 */
export async function launchExternalGoogleMapsNavigation(
  origin: LocationCoordinate,
  destination: LocationCoordinate,
  destinationLabel?: string
): Promise<boolean> {
  const dLat = destination.latitude;
  const dLon = destination.longitude;
  const oLat = origin.latitude;
  const oLon = origin.longitude;

  // On Android, google.navigation scheme directly opens Google Maps in Turn-by-Turn mode
  const androidUrl = `google.navigation:q=${dLat},${dLon}&mode=d`;
  // Universal Google Maps web/app universal intent
  const universalUrl = `https://www.google.com/maps/dir/?api=1&origin=${oLat},${oLon}&destination=${dLat},${dLon}&travelmode=driving`;

  try {
    if (Platform.OS === 'android') {
      const supported = await Linking.canOpenURL(androidUrl);
      if (supported) {
        await Linking.openURL(androidUrl);
        return true;
      }
    }
    await Linking.openURL(universalUrl);
    return true;
  } catch (err) {
    console.warn('[GoogleMapsService] Failed to open Google Maps app:', err);
    // Fallback directly to universal web link
    await Linking.openURL(universalUrl);
    return false;
  }
}

/**
 * Tests an API key against Google Maps Directions API to verify connectivity.
 */
export async function testGoogleMapsApiKey(apiKey: string): Promise<{ valid: boolean; message: string }> {
  try {
    const url = `${GOOGLE_MAPS_CONFIG.directionsEndpoint}?origin=17.3850,78.4867&destination=17.4399,78.4983&key=${apiKey}`;
    const response = await fetch(url, {
      headers: {
        'X-Goog-Maps-Solution-ID': GOOGLE_MAPS_CONFIG.solutionId,
      },
    });

    const data = await response.json();
    if (data.status === 'OK') {
      return { valid: true, message: 'Google Maps Directions API Connected' };
    }
    return {
      valid: false,
      message: `${data.status}: ${data.error_message || 'API key rejected by Google Maps'}`,
    };
  } catch (err: any) {
    return { valid: false, message: `Network Error: ${err?.message || 'Failed to connect'}` };
  }
}
