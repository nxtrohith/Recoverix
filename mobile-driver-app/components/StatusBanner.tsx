import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../config/theme';
import { isRecoveryMission, missionLabel, type MissionStatus } from '../services/mission';

type Props = {
  status: MissionStatus;
  driverName?: string;
  vehicleNumber?: string;
};

export function StatusBanner({ status, driverName, vehicleNumber }: Props) {
  const recovery = isRecoveryMission(status);
  return (
    <View style={[styles.wrap, recovery ? styles.recovery : styles.normal]}>
      <Text style={styles.label}>STATUS</Text>
      <Text style={styles.status}>{missionLabel(status)}</Text>
      {(driverName || vehicleNumber) && (
        <Text style={styles.meta}>
          {[driverName, vehicleNumber].filter(Boolean).join(' · ')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
  },
  normal: {
    backgroundColor: 'rgba(61, 220, 151, 0.12)',
    borderColor: colors.normal,
  },
  recovery: {
    backgroundColor: colors.recoverySoft,
    borderColor: colors.recovery,
  },
  label: { ...typography.label, color: colors.textMuted, marginBottom: 2 },
  status: { color: colors.white, fontSize: 20, fontWeight: '800', letterSpacing: 0.6 },
  meta: { color: colors.textMuted, marginTop: 2, fontSize: 13 },
});
