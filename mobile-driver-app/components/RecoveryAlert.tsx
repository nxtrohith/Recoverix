import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, neoShadow, radii, spacing } from '../config/theme';
import type { Incident } from '../services/mission';

type Props = {
  incident: Incident;
  whySelected?: string | null;
  sameDestination?: boolean;
  callStatus?: any;
  onAccept: () => void;
  onView: () => void;
};

export function RecoveryAlert({
  incident,
  whySelected,
  sameDestination,
  callStatus,
  onAccept,
  onView,
}: Props) {
  const tracking = incident.shipmentTrackingNumber || incident.shipmentId;
  const callLabel =
    callStatus?.driverCallStatus ||
    incident.driverCallStatus ||
    (incident.driverCallChannel ? 'sent' : null);

  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <View style={styles.badge}>
        <Text style={styles.eyebrow}>RECOVERY ASSIGNMENT</Text>
      </View>
      <Text style={styles.title}>Misplaced shipment needs pickup</Text>

      <View style={styles.grid}>
        <Row label="Shipment" value={tracking} />
        <Row label="Misplaced hub" value={incident.hubName || '—'} />
        <Row label="Pickup" value={incident.pickupNode || incident.hubName || '—'} />
        <Row
          label="Final destination"
          value={incident.destinationName || incident.destinationNode || '—'}
        />
        <Row
          label="Why you"
          value={
            whySelected ||
            incident.driverMessage ||
            (incident.pickupCase
              ? `Best piggyback (${incident.pickupCase})`
              : 'Selected by recovery engine')
          }
        />
        <Row
          label="Action"
          value={
            sameDestination
              ? 'Extra pickup on your existing trip'
              : 'Divert to pickup, then deliver'
          }
        />
        {incident.recoveryScore != null && (
          <Row label="Score" value={String(Number(incident.recoveryScore).toFixed(2))} />
        )}
      </View>

      <View style={styles.callBox}>
        <Text style={styles.callTitle}>Voice notification sent</Text>
        <Text style={styles.callBody}>
          Recovery assigned
          {callLabel ? ` · Call: ${callLabel}` : ''}
          {incident.driverCallPhone ? ` · ${incident.driverCallPhone}` : ''}
        </Text>
        <Text style={styles.callHint}>
          Outbound Telugu call is placed by the backend — this app does not dial.
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          onPress={onAccept}
        >
          <Text style={styles.primaryText}>Accept Recovery</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
          onPress={onView}
        >
          <Text style={styles.secondaryText}>View Mission</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderWidth: 2,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: 6,
    ...neoShadow,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.recovery,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  eyebrow: {
    color: colors.black,
    fontWeight: '900',
    letterSpacing: 0.8,
    fontSize: 11,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  grid: { gap: 5, marginTop: 2 },
  row: { gap: 1 },
  rowLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  rowValue: { color: colors.text, fontSize: 13, fontWeight: '700' },
  callBox: {
    marginTop: 4,
    backgroundColor: colors.bgMuted,
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 8,
    gap: 2,
  },
  callTitle: { color: colors.main, fontWeight: '900', fontSize: 13 },
  callBody: { color: colors.text, fontSize: 12, fontWeight: '600' },
  callHint: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  primary: {
    flex: 1,
    backgroundColor: colors.recovery,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.border,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    ...neoShadow,
  },
  primaryText: { color: colors.black, fontWeight: '900', fontSize: 13 },
  secondary: {
    flex: 1,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.warning,
    ...neoShadow,
  },
  secondaryText: { color: colors.black, fontWeight: '900', fontSize: 13 },
  pressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
    shadowOffset: { width: 2, height: 2 },
  },
});
