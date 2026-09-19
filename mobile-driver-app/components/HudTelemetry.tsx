import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, neoShadow, radii, spacing, typography } from '../config/theme';
import { formatDistance, formatEta } from '../services/mission';
import type { DirectionsResult } from '../services/directions';

type Props = {
  route: DirectionsResult | null;
  distanceToTarget: number | null;
  nextInstruction?: string | null;
  destinationLabel?: string | null;
  recoveryMode?: boolean;
  /** Google Maps–style compact bottom ETA card */
  compact?: boolean;
};

export function HudTelemetry({
  route,
  distanceToTarget,
  nextInstruction,
  destinationLabel,
  recoveryMode,
  compact = false,
}: Props) {
  const eta = route?.durationSeconds ?? null;
  const dist = distanceToTarget ?? route?.distanceMeters ?? null;
  const step = nextInstruction || route?.steps?.[0]?.instruction || 'Hold course';

  if (compact) {
    return (
      <View style={[styles.compactWrap, recoveryMode && styles.recovery]}>
        <View style={styles.compactRow}>
          <View style={styles.compactMetric}>
            <Text style={styles.compactValue}>{formatEta(eta)}</Text>
            <Text style={styles.compactLabel}>ETA</Text>
          </View>
          <View style={styles.compactDivider} />
          <View style={styles.compactMetric}>
            <Text style={styles.compactValue}>{formatDistance(dist)}</Text>
            <Text style={styles.compactLabel}>LEFT</Text>
          </View>
        </View>
        <Text
          style={[styles.compactDest, recoveryMode && styles.destRecovery]}
          numberOfLines={1}
        >
          {destinationLabel || 'Destination'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, recoveryMode && styles.recovery]}>
      <View style={styles.row}>
        <View style={styles.metric}>
          <Text style={styles.label}>ETA</Text>
          <Text style={styles.value}>{formatEta(eta)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.metric}>
          <Text style={styles.label}>DISTANCE</Text>
          <Text style={styles.value}>{formatDistance(dist)}</Text>
        </View>
      </View>
      <Text style={[styles.dest, recoveryMode && styles.destRecovery]} numberOfLines={1}>
        → {destinationLabel || 'Destination'}
      </Text>
      <Text style={styles.step} numberOfLines={2}>
        {step}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.bgPanel,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 6,
    ...neoShadow,
  },
  compactWrap: {
    backgroundColor: colors.bgPanel,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
    ...neoShadow,
  },
  recovery: {
    backgroundColor: '#FFE8E8',
  },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'stretch' },
  metric: { flex: 1 },
  divider: {
    width: 2,
    backgroundColor: colors.border,
    opacity: 0.2,
  },
  label: { ...typography.label, color: colors.textMuted },
  value: { ...typography.hud, color: colors.text, fontSize: 30 },
  dest: { color: colors.main, fontWeight: '800', fontSize: 15, marginTop: 4 },
  destRecovery: { color: colors.recovery },
  step: { color: colors.text, fontSize: 16, fontWeight: '700' },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactMetric: {
    flex: 1,
    alignItems: 'center',
  },
  compactDivider: {
    width: 2,
    height: 28,
    backgroundColor: colors.border,
    opacity: 0.15,
  },
  compactValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  compactLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 1,
  },
  compactDest: {
    color: colors.main,
    fontWeight: '800',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 2,
  },
});
