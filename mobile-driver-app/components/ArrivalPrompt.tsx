import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../config/theme';

type Props = {
  kind: 'pickup' | 'destination';
  onConfirm: () => void;
  busy?: boolean;
};

export function ArrivalPrompt({ kind, onConfirm, busy }: Props) {
  const isPickup = kind === 'pickup';
  return (
    <View style={[styles.wrap, isPickup ? styles.pickup : styles.dest]}>
      <Text style={styles.title}>
        {isPickup
          ? 'Recovery shipment is at this warehouse. Collect the shipment.'
          : 'You are approaching the destination for the recovery shipment.'}
      </Text>
      <Pressable
        style={[styles.btn, busy && styles.disabled]}
        onPress={onConfirm}
        disabled={busy}
      >
        <Text style={styles.btnText}>
          {isPickup ? 'Confirm Pickup' : 'Resolve Delivery'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.lg,
    borderWidth: 2,
    padding: spacing.lg,
    gap: spacing.md,
  },
  pickup: {
    backgroundColor: '#1A2A12',
    borderColor: colors.success,
  },
  dest: {
    backgroundColor: '#12202A',
    borderColor: colors.accent,
  },
  title: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  btn: {
    backgroundColor: colors.success,
    minHeight: 58,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.6 },
  btnText: { color: colors.white, fontWeight: '800', fontSize: 18 },
});
