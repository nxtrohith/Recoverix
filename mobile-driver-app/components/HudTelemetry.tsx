import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../config/theme';
import { formatDistance, formatEta } from '../services/mission';
import type { DirectionsResult } from '../services/directions';

type Props = {
  route: DirectionsResult | null;
  distanceToTarget: number | null;
  nextInstruction?: string | null;
  destinationLabel?: string | null;
  recoveryMode?: boolean;
};

export function HudTelemetry({
  route,
  distanceToTarget,
  nextInstruction,
  destinationLabel,
  recoveryMode,
}: Props) {
  const eta = route?.durationSeconds ?? null;
  const dist = distanceToTarget ?? route?.distanceMeters ?? null;
  const step = nextInstruction || route?.steps?.[0]?.instruction || 'Hold course';

  return (
    <View style={[styles.wrap, recoveryMode && styles.recovery]}>
      <View style={styles.row}>
        <View style={styles.metric}>
          <Text style={styles.label}>ETA</Text>
          <Text style={styles.value}>{formatEta(eta)}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.label}>DISTANCE</Text>
          <Text style={styles.value}>{formatDistance(dist)}</Text>
        </View>
      </View>
      <Text style={styles.dest} numberOfLines={1}>
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
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 6,
  },
  recovery: {
    borderColor: colors.recovery,
    backgroundColor: 'rgba(42, 18, 12, 0.92)',
  },
  row: { flexDirection: 'row', gap: spacing.md },
  metric: { flex: 1 },
  label: { ...typography.label, color: colors.textMuted },
  value: { ...typography.hud, color: colors.white, fontSize: 30 },
  dest: { color: colors.accent, fontWeight: '700', fontSize: 15, marginTop: 4 },
  step: { color: colors.text, fontSize: 16, fontWeight: '600' },
});
