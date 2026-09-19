import type {
  LocationNode,
  Route,
  TelanganaEdge,
  TelanganaNode,
  Vehicle,
} from '../types';

const API_BASE = 'http://localhost:4000/api';

export interface ControlTowerData {
  vehicles: Vehicle[];
  routes: Route[];
  locations: LocationNode[];
  nodes: TelanganaNode[];
  edges: TelanganaEdge[];
  geojson: any;
}

export async function fetchControlTowerData(): Promise<ControlTowerData> {
  try {
    const [vehiclesRes, routesRes, locationsRes, nodesRes, edgesRes] = await Promise.all([
      fetch(`${API_BASE}/vehicles`).then((r) => {
        if (!r.ok) throw new Error(`Vehicles API error: ${r.statusText}`);
        return r.json() as Promise<Vehicle[]>;
      }),
      fetch(`${API_BASE}/routes`).then((r) => {
        if (!r.ok) throw new Error(`Routes API error: ${r.statusText}`);
        return r.json() as Promise<Route[]>;
      }),
      fetch(`${API_BASE}/locations`).then((r) => {
        if (!r.ok) throw new Error(`Locations API error: ${r.statusText}`);
        return r.json() as Promise<LocationNode[]>;
      }),
      fetch(`${API_BASE}/telangana-nodes`).then((r) => {
        if (!r.ok) throw new Error(`Telangana Nodes API error: ${r.statusText}`);
        return r.json() as Promise<TelanganaNode[]>;
      }),
      fetch(`${API_BASE}/telangana-edges`).then((r) => {
        if (!r.ok) throw new Error(`Telangana Edges API error: ${r.statusText}`);
        return r.json() as Promise<TelanganaEdge[]>;
      }),
    ]);

    // Load local GeoJSON boundary
    let geojson: any = null;
    try {
      const geoRes = await fetch('/telangana_boundary.geojson');
      if (geoRes.ok) {
        geojson = await geoRes.json();
      }
    } catch (e) {
      console.warn('Could not load local GeoJSON, fallback will be used', e);
    }

    return {
      vehicles: vehiclesRes,
      routes: routesRes,
      locations: locationsRes,
      nodes: nodesRes,
      edges: edgesRes,
      geojson,
    };
  } catch (error) {
    console.error('Failed to fetch control tower data:', error);
    throw error;
  }
}
