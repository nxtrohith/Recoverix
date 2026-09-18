import { RecoveryAssignment, RecoveryProvider } from '../types/navigation';

/**
 * Mock Recovery Assignment Service
 *
 * Implements RecoveryProvider interface.
 * Simulates real-time dispatch recovery orders for diverted/delayed shipments.
 *
 * ZERO BACKEND DEPENDENCY:
 * Purely local state machine simulating operational recovery assignments.
 */
export class MockRecoveryProvider implements RecoveryProvider {
  private activeAssignment: RecoveryAssignment | null = null;
  private listeners: Set<(assignment: RecoveryAssignment | null) => void> = new Set();

  constructor() {
    this.resetRecovery();
  }

  /**
   * Reset or initialize default mock recovery event
   */
  public resetRecovery(): void {
    this.activeAssignment = {
      id: 'REC-ASSIGN-902',
      shipmentId: 'SH-1047',
      priority: 'HIGH',
      recoveryWarehouseId: 'WH-HYD-02',       // Hyderabad North Hub (Medchal)
      destinationWarehouseId: 'WH-WAR-01',    // Warangal Regional Depot
      units: 500,
      cargoType: 'High-Priority Medical & Electronics Consignment',
      reason: 'Transit vehicle breakdown on primary corridor; urgent cargo transfer requested',
      instructions: 'Proceed immediately to Medchal Hub Loading Bay 4. Secure 500 units, then transport to Warangal Regional Depot.',
      status: 'PENDING',
      dispatchedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    this.notify();
  }

  public async getRecoveryAssignment(): Promise<RecoveryAssignment | null> {
    return this.activeAssignment ? { ...this.activeAssignment } : null;
  }

  public async acceptRecovery(id: string): Promise<void> {
    if (this.activeAssignment && this.activeAssignment.id === id) {
      this.activeAssignment.status = 'ACCEPTED';
      this.notify();
    }
  }

  public async markEnRouteLeg1(id: string): Promise<void> {
    if (this.activeAssignment && this.activeAssignment.id === id) {
      this.activeAssignment.status = 'EN_ROUTE_LEG_1';
      this.notify();
    }
  }

  public async markAtRecovery(id: string): Promise<void> {
    if (this.activeAssignment && this.activeAssignment.id === id) {
      this.activeAssignment.status = 'AT_RECOVERY';
      this.notify();
    }
  }

  public async confirmPickup(id: string): Promise<void> {
    if (this.activeAssignment && this.activeAssignment.id === id) {
      this.activeAssignment.status = 'PICKED_UP';
      this.notify();
    }
  }

  public async markEnRouteLeg2(id: string): Promise<void> {
    if (this.activeAssignment && this.activeAssignment.id === id) {
      this.activeAssignment.status = 'EN_ROUTE_LEG_2';
      this.notify();
    }
  }

  public async completeRecovery(id: string): Promise<void> {
    if (this.activeAssignment && this.activeAssignment.id === id) {
      this.activeAssignment.status = 'DELIVERED';
      this.notify();
    }
  }

  public subscribe(callback: (assignment: RecoveryAssignment | null) => void): () => void {
    this.listeners.add(callback);
    callback(this.activeAssignment ? { ...this.activeAssignment } : null);
    return () => this.listeners.delete(callback);
  }

  private notify(): void {
    const copy = this.activeAssignment ? { ...this.activeAssignment } : null;
    for (const listener of this.listeners) {
      try {
        listener(copy);
      } catch (err) {
        console.error('[MockRecoveryService] Listener error:', err);
      }
    }
  }
}

export const recoveryService = new MockRecoveryProvider();
