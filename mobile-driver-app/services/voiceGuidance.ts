import * as Speech from 'expo-speech';
import type { MissionStatus } from './mission';

let lastSpoken = '';
let lastAt = 0;

export function speakGuidance(text: string, force = false) {
  const now = Date.now();
  if (!force && text === lastSpoken && now - lastAt < 8000) return;
  lastSpoken = text;
  lastAt = now;
  try {
    Speech.stop();
    Speech.speak(text, {
      language: 'en-IN',
      rate: 0.95,
      pitch: 1.0,
    });
  } catch {
    // Speech unavailable on some web builds — ignore
  }
}

export function speakMissionTransition(status: MissionStatus) {
  switch (status) {
    case 'RECOVERY_ASSIGNED':
      speakGuidance('Recovery mission assigned. Review and accept the recovery alert.', true);
      break;
    case 'EN_ROUTE_TO_PICKUP':
      speakGuidance('Navigating to recovery pickup warehouse.', true);
      break;
    case 'PICKUP_CONFIRMED':
      speakGuidance('Pickup confirmed. Navigating to final destination.', true);
      break;
    case 'DELIVERING':
      speakGuidance('Approaching destination for the recovery shipment.', true);
      break;
    case 'RESOLVED':
      speakGuidance('Recovery shipment resolved. Mission complete.', true);
      break;
    default:
      break;
  }
}

export function stopSpeech() {
  try {
    Speech.stop();
  } catch {
    // ignore
  }
}
