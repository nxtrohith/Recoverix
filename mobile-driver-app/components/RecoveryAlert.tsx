import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../config/theme';
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
      <Text style={styles.eyebrow}>⚠ RECOVERY ASSIGNMENT</Text>
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
        <Pressable style={styles.primary} onPress={onAccept}>
          <Text style={styles.primaryText}>Accept Recovery</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={onView}>
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
    backgroundColor: '#2A120C',
    borderColor: colors.recovery,
    borderWidth: 2,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  eyebrow: {
    color: colors.recovery,
    fontWeight: '800',
    letterSpacing: 1,
    fontSize: 13,
  },
  title: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '800',
  },
  grid: { gap: 8, marginTop: 4 },
  row: { gap: 2 },
  rowLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  rowValue: { color: colors.text, fontSize: 16, fontWeight: '600' },
  callBox: {
    marginTop: 6,
    backgroundColor: 'rgba(31,162,255,0.12)',
    borderRadius: radii.sm,
    padding: spacing.sm,
    gap: 2,
  },
  callTitle: { color: colors.accent, fontWeight: '800' },
  callBody: { color: colors.text, fontSize: 14 },
  callHint: { color: colors.textMuted, fontSize: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  primary: {
    flex: 1,
    backgroundColor: colors.recovery,
    borderRadius: radii.md,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: colors.white, fontWeight: '800', fontSize: 16 },
  secondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
  },
  secondaryText: { color: colors.text, fontWeight: '700', fontSize: 16 },
});
