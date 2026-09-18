/**
 * Minimal Modern Civic-Tech Visual Design System Tokens
 *
 * Visual Characteristics:
 * - Warm/off-white page backgrounds (#F8F9FA)
 * - Pure white cards (#FFFFFF) with subtle 1px borders (#E5E7EB)
 * - Strong black/dark primary typography (#111827)
 * - Medium-gray secondary and supporting text (#6B7280)
 * - Consistent 16–24px corner radii on cards, 9999 on pills & buttons
 * - Pill-shaped buttons, tabs, filters, and status badges
 * - Black/dark filled active states with white text
 * - Light-gray outlined/filled inactive states (#F3F4F6)
 * - Small contextual accent colors (Civic Green, Amber, Crimson)
 * - Understated, soft shadows
 */

export const CIVIC_THEME = {
  colors: {
    // Canvas & Surfaces
    bgApp: '#F8F9FA',          // Warm off-white page background
    bgPrimary: '#F8F9FA',      // Base screen canvas
    bgHeader: '#FFFFFF',       // Header bar
    bgCard: '#FFFFFF',         // Large rounded card surfaces
    bgSurface: '#FFFFFF',      // Panels, modals, bottom sheets
    bgSurfaceAlt: '#F3F4F6',   // Inactive pills, secondary surfaces, code blocks
    bgSurfaceRaised: '#FFFFFF',// Elevated card surfaces
    surfaceMuted: '#F3F4F6',   // Muted tag background

    // Borders & Dividers
    borderSubtle: '#F3F4F6',   // Hairline divider
    borderLight: '#E5E7EB',    // Subtle 1px card border
    borderDefault: '#E5E7EB',  // Standard card & input border
    borderMedium: '#D1D5DB',   // Stronger outline
    borderCard: '#E5E7EB',     // Card border alias
    borderFocus: '#111827',    // Focus ring / dark border
    borderAccent: '#111827',   // Active indicator border

    // Typography
    textPrimary: '#111827',    // Strong black/dark primary typography
    textSecondary: '#4B5563',  // Dark gray body & metadata
    textMuted: '#6B7280',      // Medium-gray secondary & supporting text
    textFaint: '#9CA3AF',      // Muted technical info & timestamps
    textDim: '#9CA3AF',        // Low-emphasis captions
    textInverse: '#FFFFFF',    // White text on dark buttons & badges

    // Primary & Pill Actions (Black active / Light gray inactive)
    btnPrimaryBg: '#111827',    // Black filled active button
    btnPrimaryText: '#FFFFFF',  // White text
    btnSecondaryBg: '#F3F4F6',  // Light-gray inactive / secondary button
    btnSecondaryText: '#111827',// Dark text
    btnSecondaryBorder: '#E5E7EB', // Subtle 1px border

    // Contextual Semantic Accents (Restrained Civic Palette)
    // Success / Active GPS
    success: '#15803D',
    successBg: '#F0FDF4',
    successBorder: '#DCFCE7',
    alertSuccess: '#15803D',
    alertSuccessBg: '#F0FDF4',
    alertSuccessBorder: '#DCFCE7',

    // Warning / Simulation / In-Transit Detour
    warning: '#B45309',
    warningBg: '#FFFBEB',
    warningBorder: '#FEF3C7',
    semanticAmber: '#B45309',
    alertWarn: '#B45309',
    alertWarnBg: '#FFFBEB',
    alertWarnBorder: '#FEF3C7',

    // Error / Emergency Recovery / Destructive
    error: '#B91C1C',
    errorBg: '#FEF2F2',
    errorBorder: '#FEE2E2',
    semanticRed: '#B91C1C',
    alertError: '#B91C1C',
    alertErrorBg: '#FEF2F2',
    alertErrorBorder: '#FEE2E2',

    // Civic Map & Route Colors
    mapBg: '#F8F9FA',
    mapGrid: 'rgba(0, 0, 0, 0.03)',
    routeLine: '#1E293B',       // Modern deep slate route corridor
    routeCasing: '#FFFFFF',     // Crisp white route boundary
    routeAlternate: '#64748B',  // Slate alternative route
    routeRecovery: '#B45309',   // Civic amber detour corridor
    vehicleMarker: '#111827',   // Dark vehicle marker
    vehicleHeading: '#2563EB',  // Subtle heading highlight

    // Backward-compatibility Aliases for Existing Code
    cafeNoir: '#E5E7EB',
    kombuGreen: '#111827',
    mossGreen: '#15803D',
    tan: '#4B5563',
    bone: '#111827',
  },

  // Typography Scale (Modern, Clean Sans-Serif with Bold Hierarchies)
  typography: {
    titleLarge: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.4, color: '#111827' },
    titleMedium: { fontSize: 16, fontWeight: '700' as const, letterSpacing: -0.2, color: '#111827' },
    sectionHeading: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.8, color: '#6B7280' },
    bodyRegular: { fontSize: 14, fontWeight: '400' as const, color: '#4B5563' },
    bodyMedium: { fontSize: 14, fontWeight: '600' as const, color: '#111827' },
    bodySmall: { fontSize: 12, fontWeight: '500' as const, color: '#6B7280' },
    caption: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.2, color: '#6B7280' },
    statValue: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.6, color: '#111827' },
    statLabel: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.5, color: '#6B7280' },
  },

  // Geometric Spacing & 16–24px Rounded Language
  geometry: {
    radiusSm: 8,
    radiusMd: 12,
    radiusLg: 16,     // Standard cards & containers
    radiusXl: 20,     // Modals & featured cards
    radiusSheet: 24,  // Bottom sheets
    radiusPill: 9999, // Pill buttons, tabs, filters, badges
    borderWidth: 1,
  },

  // Understated Soft Shadows
  shadows: {
    subtle: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 5,
      elevation: 1,
    },
    card: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 2,
    },
    modal: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 24,
      elevation: 8,
    },
  },
};

export const THEME = CIVIC_THEME;
export const COLORS = CIVIC_THEME.colors;
export const PALETTE = CIVIC_THEME.colors;
