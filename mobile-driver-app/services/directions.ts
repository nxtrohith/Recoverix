import type { GraphNode, LatLng } from './mission';

const GOOGLE_KEY = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '').trim();

export type RouteLeg = {
  distanceMeters: number;
  durationSeconds: number;
  polyline: LatLng[];
  steps: Array<{
    instruction: string;
    distanceMeters: number;
    durationSeconds: number;
    endLocation: LatLng;
  }>;
};

export type DirectionsResult = {
  source: 'google' | 'graph';
  polyline: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
  steps: RouteLeg['steps'];
  legs: RouteLeg[];
};

function decodePolyline(encoded: string): LatLng[] {
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;
  const coordinates: LatLng[] = [];

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coordinates.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return coordinates;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function nodeCoord(nodeMap: Map<string, GraphNode>, nodeId: string | null | undefined): LatLng | null {
  if (!nodeId) return null;
  const n = nodeMap.get(nodeId);
  if (!n || n.latitude == null || n.longitude == null) return null;
  return { latitude: n.latitude, longitude: n.longitude };
}

function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Build a polyline from graph hub coordinates (fallback when no Google key). */
export function buildGraphRoute(
  origin: LatLng,
  waypoints: Array<string | null | undefined>,
  nodeMap: Map<string, GraphNode>,
): DirectionsResult | null {
  const points: LatLng[] = [origin];
  const steps: RouteLeg['steps'] = [];
  for (const wp of waypoints) {
    const c = nodeCoord(nodeMap, wp);
    if (!c) continue;
    const prev = points[points.length - 1];
    const dist = haversineMeters(prev, c);
    steps.push({
      instruction: `Continue toward ${wp}`,
      distanceMeters: dist,
      durationSeconds: Math.max(60, Math.round((dist / 1000 / 45) * 3600)),
      endLocation: c,
    });
    points.push(c);
  }
  if (points.length < 2) return null;
  const distanceMeters = steps.reduce((s, x) => s + x.distanceMeters, 0);
  const durationSeconds = steps.reduce((s, x) => s + x.durationSeconds, 0);
  return {
    source: 'graph',
    polyline: points,
    distanceMeters,
    durationSeconds,
    steps,
    legs: [
      {
        distanceMeters,
        durationSeconds,
        polyline: points,
        steps,
      },
    ],
  };
}

async function fetchGoogleDirections(
  origin: LatLng,
  destination: LatLng,
  via: LatLng[] = [],
): Promise<DirectionsResult | null> {
  if (!GOOGLE_KEY) return null;

  const params = new URLSearchParams({
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.latitude},${destination.longitude}`,
    mode: 'driving',
    key: GOOGLE_KEY,
  });
  if (via.length) {
    params.set(
      'waypoints',
      via.map((p) => `${p.latitude},${p.longitude}`).join('|'),
    );
  }

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`,
    );
    const data = await res.json();
    if (data.status !== 'OK' || !data.routes?.[0]) return null;
    const route = data.routes[0];
    const legs: RouteLeg[] = (route.legs || []).map((leg: any) => {
      const steps = (leg.steps || []).map((s: any) => ({
        instruction: stripHtml(s.html_instructions || s.maneuver || 'Continue'),
        distanceMeters: s.distance?.value ?? 0,
        durationSeconds: s.duration?.value ?? 0,
        endLocation: {
          latitude: s.end_location.lat,
          longitude: s.end_location.lng,
        },
      }));
      return {
        distanceMeters: leg.distance?.value ?? 0,
        durationSeconds: leg.duration?.value ?? 0,
        polyline: decodePolyline(leg.steps?.map((s: any) => s.polyline?.points).join('') || route.overview_polyline?.points || ''),
        steps,
      };
    });

    const overview = decodePolyline(route.overview_polyline?.points || '');
    const distanceMeters = legs.reduce((s, l) => s + l.distanceMeters, 0);
    const durationSeconds = legs.reduce((s, l) => s + l.durationSeconds, 0);
    const steps = legs.flatMap((l) => l.steps);

    return {
      source: 'google',
      polyline: overview.length ? overview : legs.flatMap((l) => l.polyline),
      distanceMeters,
      durationSeconds,
      steps,
      legs,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve navigation route.
 * Normal: current → truck destination
 * Recovery (pre-pickup): current → pickup hub → final destination
 * Recovery (post-pickup): current → final destination
 */
export async function resolveDirections(opts: {
  origin: LatLng;
  destinationNode?: string | null;
  pickupNode?: string | null;
  pathNodes?: string[];
  includePickup: boolean;
  nodeMap: Map<string, GraphNode>;
}): Promise<DirectionsResult | null> {
  const { origin, destinationNode, pickupNode, pathNodes, includePickup, nodeMap } = opts;

  const dest = nodeCoord(nodeMap, destinationNode);
  const pickup = includePickup ? nodeCoord(nodeMap, pickupNode) : null;

  if (dest) {
    const via = pickup && includePickup ? [pickup] : [];
    const google = await fetchGoogleDirections(origin, dest, via);
    if (google) return google;
  }

  // Prefer backend recovery path hubs when available
  const hubSequence: string[] = [];
  if (includePickup && pickupNode) hubSequence.push(pickupNode);
  if (pathNodes?.length) {
    for (const n of pathNodes) {
      if (!hubSequence.includes(n)) hubSequence.push(n);
    }
  } else if (destinationNode) {
    hubSequence.push(destinationNode);
  }

  return buildGraphRoute(origin, hubSequence, nodeMap);
}

export function buildNodeMap(nodes: GraphNode[]): Map<string, GraphNode> {
  const map = new Map<string, GraphNode>();
  for (const n of nodes) map.set(n.id, n);
  return map;
}

export function hasGoogleMapsKey(): boolean {
  return Boolean(GOOGLE_KEY);
}

export function getGoogleMapsKey(): string {
  return GOOGLE_KEY;
}
