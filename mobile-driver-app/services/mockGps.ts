import type { LatLng } from './mission';

/**
 * Demo GPS simulator — advances along a route polyline so geofencing
 * and navigation can be demonstrated without a physical truck.
 */
export class MockGps {
  private polyline: LatLng[] = [];
  private index = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(pos: LatLng) => void>();
  private current: LatLng | null = null;

  setRoute(polyline: LatLng[], startAt = 0) {
    this.polyline = polyline.length ? polyline : [];
    this.index = Math.min(Math.max(0, startAt), Math.max(0, this.polyline.length - 1));
    if (this.polyline.length) {
      this.current = this.polyline[this.index];
      this.emit();
    }
  }

  setPosition(pos: LatLng) {
    this.current = pos;
    this.emit();
  }

  getPosition(): LatLng | null {
    return this.current;
  }

  start(intervalMs = 1200) {
    this.stop();
    this.timer = setInterval(() => {
      if (!this.polyline.length) return;
      if (this.index < this.polyline.length - 1) {
        this.index += 1;
        this.current = this.polyline[this.index];
        this.emit();
      }
    }, intervalMs);
  }

  /** Jump forward by N points (demo "speed up"). */
  advance(steps = 3) {
    if (!this.polyline.length) return;
    this.index = Math.min(this.polyline.length - 1, this.index + steps);
    this.current = this.polyline[this.index];
    this.emit();
  }

  /** Jump near the end of the current polyline (arrival demo). */
  jumpNearEnd(remaining = 2) {
    if (!this.polyline.length) return;
    this.index = Math.max(0, this.polyline.length - 1 - remaining);
    this.current = this.polyline[this.index];
    this.emit();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  subscribe(fn: (pos: LatLng) => void): () => void {
    this.listeners.add(fn);
    if (this.current) fn(this.current);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    if (!this.current) return;
    for (const fn of this.listeners) fn(this.current);
  }
}

export const mockGps = new MockGps();
