export type HubType =
  | 'Hub'
  | 'Intermediate'
  | 'Delivery'
  | 'Distribution Center'
  | 'Collection'
  | 'Unknown';

export interface Vehicle {
  _id: string;
  vehicleNumber: string;
  type: 'truck' | 'van' | 'trailer' | 'container';
  capacity: { weight: number; volume: number };
  currentLoad: { weight: number; volume: number };
  currentLocation: string;
  status: 'available' | 'in_transit' | 'loading' | 'maintenance' | 'out_of_service';
  currentRoute: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Route {
  _id: string;
  routeCode: string;
  origin: string; // location _id
  destination: string; // location _id
  distanceKm: number;
  estimatedDurationMinutes: number;
  scheduledDeparture: string;
  scheduledArrival: string;
  capacity: { weight: number; volume: number };
  currentLoad: { weight: number; volume: number };
  status: string;
  tripCount?: number;
  routeTypes?: string;
  vehicle?: string;
}

export interface LocationNode {
  _id: string;
  name: string;
  code: string;
  type: string;
  address: string;
  city: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  graphNodeKey?: string;
}

export interface TelanganaNode {
  _id?: string;
  hub_name: string;
  city: string;
  facility_code: string;
  hub_type: HubType;
  state: string;
  latitude: number;
  longitude: number;
}

export interface TelanganaEdge {
  _id?: string;
  source_name: string;
  destination_name: string;
  avg_distance_km: number;
  avg_time_min: number;
  trip_count: number;
  route_types?: string;
}

export interface ControlTowerEvent {
  id: string;
  type: 'TRUCK_DEPARTURE' | 'TRUCK_ARRIVAL';
  timestamp: number;
  timeFormatted: string;
  vehicleNumber: string;
  routeCode: string;
  originCity: string;
  destinationCity: string;
  relativeTime: string;
}

export interface SimulationClock {
  simulatedNow: number; // epoch ms
  minTime: number;
  maxTime: number;
  isPlaying: boolean;
  speedMultiplier: number;
}

export interface HoveredEntity {
  kind: 'hub' | 'truck';
  screenX: number;
  screenY: number;
  hubData?: {
    name: string;
    city: string;
    hubType: HubType;
    tripCount: number;
  };
  truckData?: {
    vehicleNumber: string;
    type: string;
    originName: string;
    destinationName: string;
    progressPercent: number;
    status: string;
  };
}
