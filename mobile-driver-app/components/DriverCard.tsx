import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../config/theme';
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
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 108,
  },
  pressed: {
    opacity: 0.88,
    borderColor: colors.accent,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.accent,
    fontSize: 24,
    fontWeight: '800',
  },
  meta: { flex: 1, gap: 2 },
  name: { color: colors.text, ...typography.title, fontSize: 20 },
  line: { color: colors.accent, fontWeight: '700', fontSize: 15 },
  muted: { color: colors.textMuted, fontSize: 13 },
  cta: {
    color: colors.white,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.pill,
    fontWeight: '800',
    overflow: 'hidden',
  },
});
