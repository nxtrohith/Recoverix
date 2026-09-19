/**
 * Exactly 3 demo driver profiles.
 * Vehicle numbers are resolved against live GET /api/vehicles at runtime.
 * Do not invent recovery assignment data here — only identity + preferred truck.
 */
export type DemoDriverProfile = {
  driverId: string;
  name: string;
  phone: string;
  preferredVehicleNumber: string;
};

export const DEMO_DRIVERS: DemoDriverProfile[] = [
  {
    driverId: 'DRV-001',
    name: 'Ramesh Kumar',
    phone: '+917780645727',
    preferredVehicleNumber: 'TS-09-UB-1077',
  },
  {
    driverId: 'DRV-002',
    name: 'Suresh Reddy',
    phone: '+919876543210',
    preferredVehicleNumber: 'TS-09-UB-1047',
  },
  {
    driverId: 'DRV-003',
    name: 'Priya Sharma',
    phone: '+919123456789',
    preferredVehicleNumber: 'TS-09-UB-1001',
  },
];
