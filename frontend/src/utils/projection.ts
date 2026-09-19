import type { HubType, TelanganaNode } from '../types';

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  centerLat: number;
  centerLng: number;
}

export interface ProjectionSystem {
  project: (lat: number, lng: number) => [number, number]; // returns [x, z]
  bbox: BoundingBox;
}

export const HUB_COLORS: Record<HubType, string> = {
  Hub: '#FFC53D',
  Intermediate: '#4FB6A6',
  Delivery: '#5B8DEF',
  'Distribution Center': '#5B8DEF',
  Collection: '#7BAE7F',
  Unknown: '#888888',
};

export function getHubColor(type: string): string {
  if (type === 'Hub') return HUB_COLORS.Hub;
  if (type === 'Intermediate') return HUB_COLORS.Intermediate;
  if (type === 'Delivery' || type === 'Distribution Center') return HUB_COLORS.Delivery;
  if (type === 'Collection') return HUB_COLORS.Collection;
  return HUB_COLORS.Unknown;
}

/**
 * Creates a consistent linear projection mapping lat/lng to Three.js scene coordinates [-45, 45] on x and z axes.
 * Longitude maps to X (East is +X, West is -X).
 * Latitude maps to Z (North is -Z, South is +Z).
 */
export function createProjection(nodes: TelanganaNode[]): ProjectionSystem {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  if (nodes.length > 0) {
    for (const node of nodes) {
      if (node.latitude < minLat) minLat = node.latitude;
      if (node.latitude > maxLat) maxLat = node.latitude;
      if (node.longitude < minLng) minLng = node.longitude;
      if (node.longitude > maxLng) maxLng = node.longitude;
    }
  } else {
    // Default fallback bounding box of Telangana
    minLat = 16.225;
    maxLat = 19.661;
    minLng = 77.594;
    maxLng = 80.887;
  }

  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;

  // Real distance metric ratio at center latitude
  const latRad = (centerLat * Math.PI) / 180;
  const kmPerLng = 111.32 * Math.cos(latRad);
  const kmPerLat = 110.7;

  const spanLngKm = (maxLng - minLng) * kmPerLng;
  const spanLatKm = (maxLat - minLat) * kmPerLat;
  const maxSpanKm = Math.max(spanLngKm, spanLatKm);

  // Map to [-42, 42] range within the [-50, 50] scene bounds
  const TARGET_HALF_EXTENT = 42;
  const scale = (TARGET_HALF_EXTENT * 2) / maxSpanKm;

  const project = (lat: number, lng: number): [number, number] => {
    const dLng = lng - centerLng;
    const dLat = lat - centerLat;

    const x = dLng * kmPerLng * scale;
    const z = -dLat * kmPerLat * scale; // Negative Z is North

    return [x, z];
  };

  return {
    project,
    bbox: { minLat, maxLat, minLng, maxLng, centerLat, centerLng },
  };
}

/**
 * Computes the 2D convex hull of 91 coordinates using Monotone Chain algorithm.
 * Used as a fallback if GeoJSON boundary cannot be loaded.
 */
export function computeConvexHull(points: Array<[number, number]>): Array<[number, number]> {
  if (points.length <= 2) return points;

  // Sort points lexicographically (by x, then y)
  const sorted = [...points].sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));

  const cross = (o: [number, number], a: [number, number], b: [number, number]) => {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  };

  // Build lower hull
  const lower: Array<[number, number]> = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  // Build upper hull
  const upper: Array<[number, number]> = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  // Concatenate lower and upper hull
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
