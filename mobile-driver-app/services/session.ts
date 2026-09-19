import AsyncStorage from '@react-native-async-storage/async-storage';

const DRIVER_KEY = 'sh205.activeDriverId';
const ACK_KEY = 'sh205.ackIncidentIds';

export type ActiveDriverSession = {
  driverId: string;
  name: string;
  phone: string;
  vehicleId: string;
  vehicleNumber: string;
};

export async function saveActiveDriver(session: ActiveDriverSession): Promise<void> {
  await AsyncStorage.setItem(DRIVER_KEY, JSON.stringify(session));
}

export async function loadActiveDriver(): Promise<ActiveDriverSession | null> {
  const raw = await AsyncStorage.getItem(DRIVER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ActiveDriverSession;
  } catch {
    return null;
  }
}

export async function clearActiveDriver(): Promise<void> {
  await AsyncStorage.removeItem(DRIVER_KEY);
}

/** Persist which recovery notifications the driver has acknowledged. */
export async function loadAcknowledgedIncidents(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(ACK_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export async function acknowledgeIncident(incidentId: string): Promise<void> {
  const current = await loadAcknowledgedIncidents();
  if (current.includes(incidentId)) return;
  await AsyncStorage.setItem(ACK_KEY, JSON.stringify([...current, incidentId]));
}
