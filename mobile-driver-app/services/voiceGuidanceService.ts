import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import { NavigationManeuver } from '../types/navigation';

/**
 * In-App Voice Guidance Service
 *
 * Provides real-time turn-by-turn voice prompts inside the app using
 * expo-speech on native (iOS/Android) and Web Speech API on web browsers.
 *
 * Implements intelligent milestone throttling so drivers receive timely,
 * calm auditory instructions without repetitive spam.
 */
class VoiceGuidanceService {
  private isMuted: boolean = false;
  private isSpeaking: boolean = false;
  private lastSpokenKey: string = '';
  private lastSpokenTime: number = 0;
  private minIntervalBetweenPromptsMs: number = 3500; // Minimum 3.5 seconds between spoken prompts

  constructor() {
    this.isMuted = false;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted) {
      this.stop();
    }
  }

  public isVoiceMuted(): boolean {
    return this.isMuted;
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  public stop(): void {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      } else {
        Speech.stop();
      }
    } catch (e) {
      // Ignore audio stop errors
    }
    this.isSpeaking = false;
  }

  /**
   * Speak a text announcement with deduplication and throttling
   */
  public async speak(
    text: string,
    options?: {
      force?: boolean;
      dedupKey?: string;
      rate?: number;
      pitch?: number;
    }
  ): Promise<void> {
    if (this.isMuted || !text.trim()) return;

    const now = Date.now();
    const key = options?.dedupKey || text.trim().toLowerCase();

    // Check duplicate or too fast
    if (!options?.force) {
      if (this.lastSpokenKey === key && now - this.lastSpokenTime < 15000) {
        return; // Skip duplicate message within 15 seconds
      }
      if (now - this.lastSpokenTime < this.minIntervalBetweenPromptsMs) {
        return; // Too close to last utterance
      }
    }

    this.lastSpokenKey = key;
    this.lastSpokenTime = now;
    this.isSpeaking = true;

    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = options?.rate ?? 1.0;
        utterance.pitch = options?.pitch ?? 1.0;
        utterance.lang = 'en-IN'; // Indian English voice preferred for Telangana routes
        utterance.onend = () => {
          this.isSpeaking = false;
        };
        utterance.onerror = () => {
          this.isSpeaking = false;
        };
        window.speechSynthesis.speak(utterance);
      } else {
        await Speech.stop();
        Speech.speak(text, {
          language: 'en-IN',
          pitch: options?.pitch ?? 1.0,
          rate: options?.rate ?? 0.98,
          onDone: () => {
            this.isSpeaking = false;
          },
          onError: () => {
            this.isSpeaking = false;
          },
        });
      }
    } catch (err) {
      console.warn('[VoiceGuidance] Speech synthesis error:', err);
      this.isSpeaking = false;
    }
  }

  /**
   * Helper to format distance nicely for human speech
   */
  private formatDistanceForVoice(meters: number): string {
    if (meters >= 1000) {
      const km = (meters / 1000).toFixed(1);
      return km.endsWith('.0') ? `${Math.round(meters / 1000)} kilometers` : `${km} kilometers`;
    }
    if (meters > 500) {
      return `${Math.round(meters / 100) * 100} meters`;
    }
    if (meters > 100) {
      return `${Math.round(meters / 50) * 50} meters`;
    }
    return `${Math.round(meters / 10) * 10} meters`;
  }

  /**
   * Clean turn instruction to sound natural when spoken
   */
  private cleanInstructionForVoice(instruction: string): string {
    return instruction
      .replace(/\bNH[- ]?(\d+)/gi, 'National Highway $1')
      .replace(/\bSH[- ]?(\d+)/gi, 'State Highway $1')
      .replace(/\bDr\b/gi, 'Drive')
      .replace(/\bRd\b/gi, 'Road')
      .replace(/\bAve\b/gi, 'Avenue')
      .replace(/\bORR\b/gi, 'Outer Ring Road')
      .replace(/\bDC\b/gi, 'Distribution Center')
      .replace(/\bWH\b/gi, 'Warehouse')
      .trim();
  }

  /**
   * Evaluates turn distance and speaks milestone announcements
   */
  public handleManeuverProximity(maneuver: NavigationManeuver, distanceMeters: number): void {
    if (this.isMuted) return;

    const cleanAction = this.cleanInstructionForVoice(
      maneuver.spokenInstruction || maneuver.instruction
    );

    if (distanceMeters >= 900 && distanceMeters <= 1100) {
      const key = `${maneuver.id}-1km`;
      this.speak(`In 1 kilometer, ${cleanAction}`, { dedupKey: key });
    } else if (distanceMeters >= 450 && distanceMeters <= 550) {
      const key = `${maneuver.id}-500m`;
      this.speak(`In 500 meters, ${cleanAction}`, { dedupKey: key });
    } else if (distanceMeters >= 180 && distanceMeters <= 240) {
      const key = `${maneuver.id}-200m`;
      this.speak(`In 200 meters, ${cleanAction}`, { dedupKey: key });
    } else if (distanceMeters >= 15 && distanceMeters <= 60) {
      const key = `${maneuver.id}-now`;
      this.speak(`${cleanAction} now`, { dedupKey: key, force: true });
    }
  }

  /**
   * Spoken prompt when vehicle deviates and route recalculation begins
   */
  public announceRerouting(): void {
    this.speak('Route deviation detected. Recalculating route...', {
      force: true,
      dedupKey: 'rerouting-alert',
    });
  }

  /**
   * Spoken prompt when route recalculation finishes
   */
  public announceRerouteCompleted(destinationName: string): void {
    this.speak(`New route calculated to ${destinationName}. Continue straight.`, {
      force: true,
      dedupKey: 'reroute-completed',
    });
  }

  /**
   * Spoken prompt upon destination arrival
   */
  public announceArrival(facilityName: string): void {
    this.speak(`You have arrived at your destination: ${facilityName}. Mission checkpoint reached.`, {
      force: true,
      dedupKey: `arrival-${facilityName}`,
    });
  }
}

export const voiceGuidanceService = new VoiceGuidanceService();
