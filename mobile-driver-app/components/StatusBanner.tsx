import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, neoShadow, radii, spacing } from '../config/theme';
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
      <Text style={styles.status} numberOfLines={1}>
        {missionLabel(status)}
      </Text>
      {(driverName || vehicleNumber) && (
        <Text style={styles.meta} numberOfLines={1}>
          {[driverName, vehicleNumber].filter(Boolean).join(' · ')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: colors.border,
    ...neoShadow,
  },
  normal: {
    backgroundColor: colors.success,
  },
  recovery: {
    backgroundColor: colors.recovery,
  },
  status: {
    color: colors.black,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  meta: {
    color: colors.black,
    marginTop: 1,
    fontSize: 11,
    fontWeight: '700',
    opacity: 0.75,
  },
});
