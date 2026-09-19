/**
 * Design tokens for the driver cockpit.
 * High-contrast, large targets — optimized for in-cab use.
 */
export const colors = {
  bg: '#0B1220',
  bgElevated: '#121A2B',
  bgPanel: 'rgba(14, 22, 40, 0.92)',
  border: '#243049',
  text: '#F4F7FB',
  textMuted: '#9AA8C0',
  accent: '#1FA2FF',
  accentSoft: 'rgba(31, 162, 255, 0.18)',
  success: '#2ECC71',
  warning: '#F5A623',
  danger: '#FF4D4F',
  dangerSoft: 'rgba(255, 77, 79, 0.18)',
  recovery: '#FF6B35',
  recoverySoft: 'rgba(255, 107, 53, 0.22)',
  normal: '#3DDC97',
  mapRoute: '#1FA2FF',
  mapRecovery: '#FF6B35',
  white: '#FFFFFF',
  black: '#000000',
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 32,
};

export const radii = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
};

export const typography = {
  brand: {
    fontSize: 28,
    fontWeight: '800' as const,
    letterSpacing: 0.4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700' as const,
  },
  hud: {
    fontSize: 34,
    fontWeight: '800' as const,
  },
  body: {
    fontSize: 16,
    fontWeight: '500' as const,
  },
  label: {
    fontSize: 13,
    fontWeight: '600' as const,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
};

/** Geofence radii (meters) for warehouse / destination detection. */
export const GEOFENCE = {
  approachMeters: 1200,
  arrivalMeters: 350,
};

/** Poll backend for assignments every N ms. */
export const POLL_INTERVAL_MS = 5000;
