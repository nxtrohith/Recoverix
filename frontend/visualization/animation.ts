/**
 * Animation and simulation controller driven strictly by SimPy event JSON.
 * SimPy remains the absolute source of truth.
 */

import * as THREE from 'three';
import { GraphRenderer } from './graphRenderer';
import { TruckRenderer } from './truckRenderer';
import {
  SimEvent,
  SimulationController,
  TruckState,
  TruckStatus,
} from './types';

export interface LegMovement {
  truck_id: string;
  shipment_id?: string | null;
  fromNode: string;
  toNode: string;
  departureTime: number;
  arrivalTime: number;
}

export interface DelaySegment {
  truck_id: string;
  node: string;
  startTime: number;
  endTime: number;
  reason?: string;
}

export interface AnimationControllerOptions {
  graphRenderer: GraphRenderer;
  truckRenderer: TruckRenderer;
  onTimeUpdate?: (time: number, maxTime: number) => void;
  onStatusChange?: (isPlaying: boolean) => void;
  onActiveTrucksChange?: (count: number) => void;
  onEventFired?: (event: SimEvent) => void;
}

export class SimulationAnimationController implements SimulationController {
  private graphRenderer: GraphRenderer;
  private truckRenderer: TruckRenderer;

  private events: SimEvent[] = [];
  private movements: LegMovement[] = [];
  private delays: DelaySegment[] = [];
  private truckStartNodes = new Map<string, string>();
  private truckShipments = new Map<string, string | null>();
  private allTruckIds = new Set<string>();

  public currentSimulationTime: number = 0;
  public maxSimulationTime: number = 100;
  public isPlaying: boolean = false;
  public speed: number = 10.0; // Default 10x simulation speed for fast demo

  private onTimeUpdate?: (time: number, maxTime: number) => void;
  private onStatusChange?: (isPlaying: boolean) => void;
  private onActiveTrucksChange?: (count: number) => void;
  private onEventFired?: (event: SimEvent) => void;

  private firedEventIndexes = new Set<number>();

  constructor(options: AnimationControllerOptions) {
    this.graphRenderer = options.graphRenderer;
    this.truckRenderer = options.truckRenderer;
    this.onTimeUpdate = options.onTimeUpdate;
    this.onStatusChange = options.onStatusChange;
    this.onActiveTrucksChange = options.onActiveTrucksChange;
    this.onEventFired = options.onEventFired;
  }

  /**
   * Load and parse SimPy simulation events.
   */
  public loadEvents(events: SimEvent[]): void {
    // Sort events by timestamp
    this.events = [...events].sort((a, b) => a.time - b.time);
    this.movements = [];
    this.delays = [];
    this.truckStartNodes.clear();
    this.truckShipments.clear();
    this.allTruckIds.clear();
    this.firedEventIndexes.clear();

    if (this.events.length === 0) {
      this.maxSimulationTime = 100;
      return;
    }

    this.maxSimulationTime = this.events[this.events.length - 1].time;

    // Track active departure events by truck to pair with arrival events
    const pendingDepartures = new Map<string, SimEvent>();

    for (const event of this.events) {
      this.allTruckIds.add(event.truck_id);

      if (event.shipment_id) {
        this.truckShipments.set(event.truck_id, event.shipment_id);
      }

      // Record earliest node as starting location
      if (!this.truckStartNodes.has(event.truck_id)) {
        const start = event.from || event.current_node || event.to;
        if (start) {
          this.truckStartNodes.set(event.truck_id, start);
        }
      }

      if (event.type === 'DELAY') {
        const duration = Number(event.duration || 0);
        this.delays.push({
          truck_id: event.truck_id,
          node: event.from || event.current_node || '',
          startTime: event.time,
          endTime: event.time + duration,
          reason: event.reason,
        });
      } else if (event.type === 'TRUCK_DEPARTURE') {
        pendingDepartures.set(event.truck_id, event);
      } else if (event.type === 'TRUCK_ARRIVAL') {
        const dep = pendingDepartures.get(event.truck_id);
        const fromNode = dep?.from || event.from || '';
        const toNode = event.to || event.current_node || '';
        const depTime = dep ? dep.time : Math.max(0, event.time - 60);

        this.movements.push({
          truck_id: event.truck_id,
          shipment_id: event.shipment_id || dep?.shipment_id || null,
          fromNode,
          toNode,
          departureTime: depTime,
          arrivalTime: event.time,
        });

        pendingDepartures.delete(event.truck_id);
      }
    }

    this.reset();
  }

  public play(): void {
    if (this.currentSimulationTime >= this.maxSimulationTime) {
      this.currentSimulationTime = 0;
      this.firedEventIndexes.clear();
    }
    this.isPlaying = true;
    this.onStatusChange?.(this.isPlaying);
  }

  public pause(): void {
    this.isPlaying = false;
    this.onStatusChange?.(this.isPlaying);
  }

  public reset(): void {
    this.isPlaying = false;
    this.currentSimulationTime = 0;
    this.firedEventIndexes.clear();
    this.update(0);
    this.onStatusChange?.(this.isPlaying);
    this.onTimeUpdate?.(0, this.maxSimulationTime);
  }

  public setSpeed(speed: number): void {
    this.speed = Math.max(0.1, speed);
  }

  public seek(time: number): void {
    this.currentSimulationTime = Math.max(0, Math.min(time, this.maxSimulationTime));

    // Reset fired events cache up to sought time
    this.firedEventIndexes.clear();
    for (let i = 0; i < this.events.length; i++) {
      if (this.events[i].time <= this.currentSimulationTime) {
        this.firedEventIndexes.add(i);
      }
    }

    this.update(0);
    this.onTimeUpdate?.(this.currentSimulationTime, this.maxSimulationTime);
  }

  /**
   * Called on every render frame with the delta time in seconds.
   */
  public update(deltaSeconds: number): void {
    if (this.isPlaying) {
      // Advance simulation time (minutes) by speed * deltaSeconds
      this.currentSimulationTime += (this.speed * deltaSeconds);

      if (this.currentSimulationTime >= this.maxSimulationTime) {
        this.currentSimulationTime = this.maxSimulationTime;
        this.pause();
      }

      this.onTimeUpdate?.(this.currentSimulationTime, this.maxSimulationTime);
      this.checkEventTriggers();
    }

    // Compute truck states at currentSimulationTime
    let activeTruckCount = 0;

    for (const truckId of this.allTruckIds) {
      const state = this.computeTruckState(truckId, this.currentSimulationTime);
      if (state) {
        this.truckRenderer.updateTruck(state);
        if (state.status === 'MOVING' || state.status === 'DELAYED') {
          activeTruckCount++;
        }
      }
    }

    this.onActiveTrucksChange?.(activeTruckCount);
  }

  private checkEventTriggers(): void {
    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i];
      if (event.time <= this.currentSimulationTime && !this.firedEventIndexes.has(i)) {
        this.firedEventIndexes.add(i);
        this.onEventFired?.(event);
      }
    }
  }

  /**
   * Calculate precise 3D position and orientation for a truck at time t.
   */
  private computeTruckState(truckId: string, time: number): TruckState | null {
    const truckMovements = this.movements.filter((m) => m.truck_id === truckId);
    const shipmentId = this.truckShipments.get(truckId) || null;

    // 1. Check if currently moving in any leg
    for (const move of truckMovements) {
      if (time >= move.departureTime && time <= move.arrivalTime) {
        const fromPos = this.graphRenderer.getNodePosition(move.fromNode);
        const toPos = this.graphRenderer.getNodePosition(move.toNode);

        if (!fromPos || !toPos) continue;

        const duration = Math.max(0.001, move.arrivalTime - move.departureTime);
        const progress = (time - move.departureTime) / duration;

        // Linear interpolation between nodes
        const x = THREE.MathUtils.lerp(fromPos.x, toPos.x, progress);
        const z = THREE.MathUtils.lerp(fromPos.z, toPos.z, progress);
        // Slight hop/bounce arc during transit
        const y = Math.sin(progress * Math.PI) * 0.8;

        // Angle facing direction of travel
        const angle = Math.atan2(toPos.x - fromPos.x, toPos.z - fromPos.z);

        return {
          truck_id: truckId,
          shipment_id: shipmentId,
          status: 'MOVING',
          currentNode: move.fromNode,
          targetNode: move.toNode,
          position: { x, y, z },
          progress,
          rotationY: angle,
        };
      }
    }

    // 2. Check if currently delayed at a node
    for (const delay of this.delays) {
      if (delay.truck_id === truckId && time >= delay.startTime && time <= delay.endTime) {
        const pos = this.graphRenderer.getNodePosition(delay.node);
        if (pos) {
          return {
            truck_id: truckId,
            shipment_id: shipmentId,
            status: 'DELAYED',
            currentNode: delay.node,
            targetNode: null,
            position: { x: pos.x, y: 0, z: pos.z },
            progress: 0,
            rotationY: 0,
          };
        }
      }
    }

    // 3. Before first departure: parked at start node
    if (truckMovements.length > 0 && time < truckMovements[0].departureTime) {
      const startNode = this.truckStartNodes.get(truckId) || truckMovements[0].fromNode;
      const pos = this.graphRenderer.getNodePosition(startNode);
      if (pos) {
        return {
          truck_id: truckId,
          shipment_id: shipmentId,
          status: 'IDLE',
          currentNode: startNode,
          targetNode: truckMovements[0].fromNode,
          position: { x: pos.x, y: 0, z: pos.z },
          progress: 0,
          rotationY: 0,
        };
      }
    }

    // 4. After final arrival: parked at final destination
    if (truckMovements.length > 0 && time > truckMovements[truckMovements.length - 1].arrivalTime) {
      const lastMove = truckMovements[truckMovements.length - 1];
      const pos = this.graphRenderer.getNodePosition(lastMove.toNode);
      if (pos) {
        return {
          truck_id: truckId,
          shipment_id: shipmentId,
          status: 'DELIVERED',
          currentNode: lastMove.toNode,
          targetNode: null,
          position: { x: pos.x, y: 0, z: pos.z },
          progress: 1,
          rotationY: 0,
        };
      }
    }

    // 5. In between legs: parked at intermediate hub
    for (let i = 0; i < truckMovements.length - 1; i++) {
      const cur = truckMovements[i];
      const next = truckMovements[i + 1];
      if (time > cur.arrivalTime && time < next.departureTime) {
        const pos = this.graphRenderer.getNodePosition(cur.toNode);
        if (pos) {
          return {
            truck_id: truckId,
            shipment_id: shipmentId,
            status: 'IDLE',
            currentNode: cur.toNode,
            targetNode: next.toNode,
            position: { x: pos.x, y: 0, z: pos.z },
            progress: 0,
            rotationY: 0,
          };
        }
      }
    }

    // Default fallback to start node
    const fallbackNode = this.truckStartNodes.get(truckId);
    if (fallbackNode) {
      const pos = this.graphRenderer.getNodePosition(fallbackNode);
      if (pos) {
        return {
          truck_id: truckId,
          shipment_id: shipmentId,
          status: 'IDLE',
          currentNode: fallbackNode,
          targetNode: null,
          position: { x: pos.x, y: 0, z: pos.z },
          progress: 0,
          rotationY: 0,
        };
      }
    }

    return null;
  }
}
