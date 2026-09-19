/**
 * NeoBrutalism tokens mirrored from frontend/src/index.css
 * (teal registry: main, hard black borders, offset shadow).
 */
export const colors = {
  bg: '#D5F5F0',
  bgElevated: '#FFFFFF',
  bgPanel: '#FFFFFF',
  bgMuted: '#E0F7F4',
  border: '#000000',
  text: '#000000',
  textMuted: '#4A5568',
  main: '#14B8A6',
  mainSoft: 'rgba(20, 184, 166, 0.22)',
  accent: '#14B8A6',
  accentSoft: 'rgba(20, 184, 166, 0.18)',
  success: '#05E17A',
  warning: '#FACC00',
  danger: '#FF4D50',
  dangerSoft: 'rgba(255, 77, 80, 0.18)',
  recovery: '#FF4D50',
  recoverySoft: 'rgba(255, 77, 80, 0.16)',
  normal: '#05E17A',
  chartTransit: '#2DD4BF',
  mapRoute: '#1A73E8',
  mapRouteOutline: '#FFFFFF',
  mapRecovery: '#EA4335',
  mapLand: '#E8F0E3',
  mapPark: '#C5E8B5',
  mapWater: '#AAD3DF',
  mapRoad: '#FFFFFF',
  mapRoadMajor: '#F6D365',
  mapBuilding: '#E6E1D9',
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

/** NeoBrutalism uses a tight base radius (≈5px), not pills. */
export const radii = {
  sm: 5,
  md: 5,
  lg: 8,
  pill: 5,
};

export const shadow = {
  offset: { width: 4, height: 4 },
  color: '#000000',
  opacity: 1,
  radius: 0,
  elevation: 4,
};

/** Hard offset shadow — NeoBrutalism signature. */
export const neoShadow = {
  shadowColor: shadow.color,
  shadowOffset: shadow.offset,
  shadowOpacity: shadow.opacity,
  shadowRadius: shadow.radius,
  elevation: shadow.elevation,
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
    fontWeight: '700' as const,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
};

/** Shared NeoBrutal panel: white fill, 2px black border, offset shadow. */
export const neoPanel = {
  backgroundColor: colors.bgElevated,
  borderColor: colors.border,
  borderWidth: 2,
  borderRadius: radii.md,
  ...neoShadow,
};

/** Geofence radii (meters) for warehouse / destination detection. */
export const GEOFENCE = {
  approachMeters: 1200,
  arrivalMeters: 350,
};

/** Poll backend for assignments every N ms. */
export const POLL_INTERVAL_MS = 5000;
