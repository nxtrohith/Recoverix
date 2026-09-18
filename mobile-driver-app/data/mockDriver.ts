import { DriverProfile, LocationCoordinate } from '../types/navigation';

export const MOCK_DRIVER: DriverProfile = {
  id: 'DRV-409',
  name: 'Ravi Kumar',
  truckId: 'TRK-218',
  fleet: 'Telangana Logistics Express · Fleet South-1',
  status: 'ON_DUTY',
  baseStation: 'Hyderabad Central DC',
};

// Initial starting location: parked at Hyderabad Central DC
export const INITIAL_DRIVER_LOCATION: LocationCoordinate = {
  latitude: 17.3850,
  longitude: 78.4867,
  heading: 65,
  speed: 0,
  accuracy: 5.0,
};
