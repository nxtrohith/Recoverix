import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrivalPrompt } from '../components/ArrivalPrompt';
import { HudTelemetry } from '../components/HudTelemetry';
import { NavigationMap } from '../components/NavigationMap';
import { RecoveryAlert } from '../components/RecoveryAlert';
import { StatusBanner } from '../components/StatusBanner';
import { colors, radii, spacing } from '../config/theme';
import { useCockpit } from '../context/CockpitContext';
import { isRecoveryMission } from '../services/mission';

export default function CockpitScreen() {
  const router = useRouter();
  const {
    session,
    vehicle,
    incident,
    shipment,
    callStatus,
    missionStatus,
    sameDestination,
    position,
    route,
    proximity,
    distanceToTarget,
    pickupCoord,
    destCoord,
    truckDestCoord,
    includePickup,
    networkError,
    busy,
    actionMessage,
    recoveryAlertVisible,
    signOut,
    refresh,
    acceptRecovery,
    confirmPickup,
    confirmResolve,
    advanceGps,
    jumpNearTarget,
  } = useCockpit();

  useEffect(() => {
    if (!session) router.replace('/');
  }, [session, router]);

  if (!session) return null;

  const recovery = isRecoveryMission(missionStatus);
  const destLabel = includePickup
    ? incident?.pickupNode || 'Pickup warehouse'
    : incident?.destinationNode ||
      vehicle?.destination ||
      vehicle?.destinationNode ||
      'Destination';

  const showPickupPrompt =
    recovery &&
    includePickup &&
    proximity === 'arrived' &&
    (incident?.status || '').toUpperCase() === 'ASSIGNED';

  const showResolvePrompt =
    recovery &&
    !includePickup &&
    (proximity === 'arrived' || proximity === 'approaching') &&
    (incident?.status || '').toUpperCase() === 'PICKUP_CONFIRMED';

  const recoveredShipment =
    shipment?.trackingNumber ||
    incident?.shipmentTrackingNumber ||
    incident?.shipmentId;

  return (
    <View style={styles.root}>
      <NavigationMap
        position={position}
        polyline={route?.polyline || []}
        pickup={includePickup ? pickupCoord : null}
        destination={destCoord || truckDestCoord}
        recoveryMode={recovery}
      />

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          <StatusBanner
            status={missionStatus}
            driverName={session.name}
            vehicleNumber={session.vehicleNumber}
          />
          <View style={styles.topActions}>
            <Pressable style={styles.chip} onPress={refresh}>
              <Text style={styles.chipText}>Sync</Text>
            </Pressable>
            <Pressable
              style={styles.chip}
              onPress={async () => {
                await signOut();
                router.replace('/');
              }}
            >
              <Text style={styles.chipText}>Switch</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={styles.sheet}
          contentContainerStyle={styles.sheetContent}
          pointerEvents="auto"
        >
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>LOCATION</Text>
            <Text style={styles.infoValue}>
              {vehicle?.currentLocationName || vehicle?.currentNode || '—'}
            </Text>
            <Text style={styles.infoLabel}>DESTINATION</Text>
            <Text style={styles.infoValue}>
              {vehicle?.destination || vehicle?.destinationNode || '—'}
              {sameDestination && recovery ? '  · same as recovery' : ''}
            </Text>
            {recoveredShipment && recovery && (
              <>
                <Text style={styles.infoLabel}>ACTIVE SHIPMENT</Text>
                <Text style={[styles.infoValue, styles.shipment]}>
                  {recoveredShipment}
                </Text>
              </>
            )}
          </View>

          <HudTelemetry
            route={route}
            distanceToTarget={distanceToTarget}
            destinationLabel={destLabel}
            recoveryMode={recovery}
            nextInstruction={route?.steps?.[0]?.instruction}
          />

          {networkError && (
            <View style={styles.warn}>
              <Text style={styles.warnText}>{networkError}</Text>
            </View>
          )}

          {actionMessage && (
            <View style={styles.note}>
              <Text style={styles.noteText}>{actionMessage}</Text>
            </View>
          )}

          {recoveryAlertVisible && incident && (
            <RecoveryAlert
              incident={incident}
              sameDestination={sameDestination}
              callStatus={callStatus}
              whySelected={
                sameDestination
                  ? 'Your truck already goes to this destination — recovery is an extra pickup on your route.'
                  : incident.driverMessage
              }
              onAccept={acceptRecovery}
              onView={acceptRecovery}
            />
          )}

          {showPickupPrompt && (
            <ArrivalPrompt kind="pickup" onConfirm={confirmPickup} busy={busy} />
          )}

          {showResolvePrompt && (
            <ArrivalPrompt kind="destination" onConfirm={confirmResolve} busy={busy} />
          )}

          {proximity === 'approaching' && includePickup && recovery && !showPickupPrompt && (
            <View style={styles.note}>
              <Text style={styles.noteText}>
                Approaching recovery warehouse — prepare to collect the shipment.
              </Text>
            </View>
          )}

          <View style={styles.demoDock}>
            <Text style={styles.demoLabel}>DEMO GPS</Text>
            <View style={styles.demoRow}>
              <Pressable style={styles.demoBtn} onPress={advanceGps}>
                <Text style={styles.demoBtnText}>Advance</Text>
              </Pressable>
              <Pressable style={styles.demoBtn} onPress={jumpNearTarget}>
                <Text style={styles.demoBtnText}>Near target</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topBar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  topActions: { flexDirection: 'row', gap: 8 },
  chip: {
    backgroundColor: colors.bgPanel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: { color: colors.text, fontWeight: '700' },
  sheet: {
    maxHeight: '58%',
    marginTop: 'auto',
  },
  sheetContent: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  infoCard: {
    backgroundColor: colors.bgPanel,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
  },
  infoLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 6,
  },
  infoValue: { color: colors.text, fontSize: 16, fontWeight: '700' },
  shipment: { color: colors.recovery, fontSize: 18 },
  warn: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  warnText: { color: colors.text },
  note: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  noteText: { color: colors.text, fontWeight: '600' },
  demoDock: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: 8,
  },
  demoLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  demoRow: { flexDirection: 'row', gap: 8 },
  demoBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.sm,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoBtnText: { color: colors.text, fontWeight: '700' },
});
