/**
 * Type definitions for the Three.js logistics simulation visualizer.
 */

export interface HubNode {
  id: string; // hub_name
  hub_name: string;
  city?: string;
  facility_code?: string;
  hub_type?: string;
  state?: string;
  latitude: number;
  longitude: number;
  x?: number; // local 3D X
  y?: number; // local 3D Y (elevation)
  z?: number; // local 3D Z
}

export interface RouteEdge {
  source: string;
  destination: string;
  avg_distance_km?: number | null;
  avg_time_min?: number | null;
  trip_count?: number;
  route_types?: string;
}

export interface GraphData {
  nodes: HubNode[];
  edges: RouteEdge[];
}

export type SimEventType =
  | 'TRUCK_DEPARTURE'
  | 'TRUCK_ARRIVAL'
  | 'SHIPMENT_PICKUP'
  | 'SHIPMENT_DELIVERY'
  | 'DELAY'
  | 'RECOVERY';

export interface SimEvent {
  time: number;
  type: SimEventType | string;
  truck_id: string;
  shipment_id?: string | null;
  from?: string | null;
  to?: string | null;
  current_node?: string | null;
  next_node?: string | null;
  duration?: number;
  reason?: string;
  travel_time?: number;
  [key: string]: any;
}

export type TruckStatus = 'IDLE' | 'MOVING' | 'DELAYED' | 'DELIVERED';

export interface TruckState {
  truck_id: string;
  shipment_id?: string | null;
  status: TruckStatus;
  currentNode: string;
  targetNode?: string | null;
  position: { x: number; y: number; z: number };
  progress: number; // 0 to 1
  rotationY: number;
}

export interface SimulationController {
  play(): void;
  pause(): void;
  reset(): void;
  setSpeed(speed: number): void;
  seek(time: number): void;
  readonly currentSimulationTime: number;
  readonly isPlaying: boolean;
  readonly speed: number;
}
