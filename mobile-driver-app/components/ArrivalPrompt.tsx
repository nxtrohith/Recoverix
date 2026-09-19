import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, neoShadow, radii, spacing } from '../config/theme';

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
        style={({ pressed }) => [
          styles.btn,
          isPickup ? styles.btnPickup : styles.btnDest,
          busy && styles.disabled,
          pressed && !busy && styles.pressed,
        ]}
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
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...neoShadow,
  },
  pickup: {
    backgroundColor: '#D8FFE8',
  },
  dest: {
    backgroundColor: colors.bgMuted,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
  },
  btn: {
    minHeight: 46,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...neoShadow,
  },
  btnPickup: {
    backgroundColor: colors.success,
  },
  btnDest: {
    backgroundColor: colors.main,
  },
  disabled: { opacity: 0.6 },
  pressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
    shadowOffset: { width: 2, height: 2 },
  },
  btnText: { color: colors.black, fontWeight: '900', fontSize: 15 },
});
