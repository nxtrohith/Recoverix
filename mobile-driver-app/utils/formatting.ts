/**
 * Human-readable formatters for driver navigation telemetry
 */

export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    const meters = Math.round(distanceKm * 1000);
    return `${meters} m`;
  }
  if (distanceKm < 10) {
    return `${distanceKm.toFixed(1)} km`;
  }
  return `${Math.round(distanceKm)} km`;
}

export function formatETA(minutes: number): string {
  if (minutes < 1) {
    return '< 1 min';
  }
  const totalMin = Math.round(minutes);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;

  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${mins} min`;
}

export function formatTimeArrival(minutesFromNow: number): string {
  const now = new Date();
  const arrival = new Date(now.getTime() + minutesFromNow * 60 * 1000);

  let hours = arrival.getHours();
  const mins = arrival.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';

  hours = hours % 12;
  hours = hours ? hours : 12; // 0 should be 12
  const minsPadded = mins < 10 ? `0${mins}` : mins;

  return `${hours}:${minsPadded} ${ampm}`;
}

export function formatSpeed(speedKmh: number): string {
  return `${Math.round(speedKmh)} km/h`;
}
