import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, neoShadow, radii, spacing, typography } from '../config/theme';
import type { ResolvedDriver } from '../hooks/useDriverCockpit';

type Props = {
  driver: ResolvedDriver;
  onSelect: (driver: ResolvedDriver) => void;
};

export function DriverCard({ driver, onSelect }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => onSelect(driver)}
      accessibilityRole="button"
      accessibilityLabel={`Select driver ${driver.name}`}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{driver.name.slice(0, 1)}</Text>
      </View>
      <View style={styles.meta}>
        <Text style={styles.name}>{driver.name}</Text>
        <Text style={styles.line}>{driver.vehicleNumber}</Text>
        <Text style={styles.muted}>{driver.locationLabel}</Text>
        <Text style={styles.muted}>{driver.phone}</Text>
      </View>
      <Text style={styles.cta}>DRIVE</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderWidth: 2,
    borderRadius: radii.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 108,
    ...neoShadow,
  },
  pressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
    shadowOffset: { width: 2, height: 2 },
    backgroundColor: colors.mainSoft,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    backgroundColor: colors.main,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.black,
    fontSize: 24,
    fontWeight: '900',
  },
  meta: { flex: 1, gap: 2 },
  name: { color: colors.text, ...typography.title, fontSize: 20 },
  line: { color: colors.main, fontWeight: '800', fontSize: 15 },
  muted: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  cta: {
    color: colors.black,
    backgroundColor: colors.warning,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.sm,
    fontWeight: '900',
    overflow: 'hidden',
  },
});
