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
import { colors, neoShadow, radii, spacing } from '../config/theme';
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

  const nextInstruction = route?.steps?.[0]?.instruction || null;
  const locationLabel =
    vehicle?.currentLocationName || vehicle?.currentNode || '—';
  const truckDest =
    vehicle?.destination || vehicle?.destinationNode || '—';

  return (
    <View style={styles.root}>
      <NavigationMap
        position={position}
        polyline={route?.polyline || []}
        pickup={includePickup ? pickupCoord : null}
        destination={destCoord || truckDestCoord}
        recoveryMode={recovery}
        nextInstruction={nextInstruction}
      />

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar} pointerEvents="box-none">
          <View style={styles.topRow}>
            <View style={styles.statusSlot}>
              <StatusBanner
                status={missionStatus}
                driverName={session.name}
                vehicleNumber={session.vehicleNumber}
              />
            </View>
            <Pressable
              style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
              onPress={refresh}
            >
              <Text style={styles.chipText}>Sync</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.chip, styles.chipAlt, pressed && styles.pressed]}
              onPress={async () => {
                await signOut();
                router.replace('/');
              }}
            >
              <Text style={styles.chipText}>Switch</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.bottomDock} pointerEvents="box-none">
          <ScrollView
            style={styles.sheet}
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
            pointerEvents="auto"
          >
            <HudTelemetry
              route={route}
              distanceToTarget={distanceToTarget}
              destinationLabel={destLabel}
              recoveryMode={recovery}
              nextInstruction={nextInstruction}
              compact
            />

            <View style={styles.infoRow}>
              <Text style={styles.infoText} numberOfLines={1}>
                {locationLabel}
                <Text style={styles.infoMuted}> → </Text>
                {truckDest}
                {sameDestination && recovery ? ' · same dest' : ''}
              </Text>
              {recoveredShipment && recovery ? (
                <Text style={styles.shipmentChip} numberOfLines={1}>
                  {recoveredShipment}
                </Text>
              ) : null}
            </View>

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
                <Pressable
                  style={({ pressed }) => [styles.demoBtn, pressed && styles.pressed]}
                  onPress={advanceGps}
                >
                  <Text style={styles.demoBtnText}>Advance</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.demoBtn,
                    styles.demoBtnAlt,
                    pressed && styles.pressed,
                  ]}
                  onPress={jumpNearTarget}
                >
                  <Text style={styles.demoBtnText}>Near target</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.mapLand },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topBar: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm + 56,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusSlot: { flex: 1, minWidth: 0 },
  chip: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderWidth: 2,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    ...neoShadow,
  },
  chipAlt: {
    backgroundColor: colors.warning,
  },
  chipText: { color: colors.black, fontWeight: '900', fontSize: 12 },
  pressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
    shadowOffset: { width: 2, height: 2 },
  },
  bottomDock: {
    marginTop: 'auto',
  },
  sheet: {
    maxHeight: 280,
  },
  sheetContent: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  infoRow: {
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
    ...neoShadow,
  },
  infoText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  infoMuted: {
    color: colors.textMuted,
    fontWeight: '700',
  },
  shipmentChip: {
    alignSelf: 'flex-start',
    color: colors.black,
    backgroundColor: colors.recovery,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.sm,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 12,
    fontWeight: '900',
  },
  warn: {
    backgroundColor: '#FFE8E8',
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    ...neoShadow,
  },
  warnText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  note: {
    backgroundColor: colors.bgMuted,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    ...neoShadow,
  },
  noteText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  demoDock: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 8,
    gap: 6,
    ...neoShadow,
  },
  demoLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  demoRow: { flexDirection: 'row', gap: 6 },
  demoBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: radii.sm,
    backgroundColor: colors.main,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...neoShadow,
  },
  demoBtnAlt: {
    backgroundColor: colors.success,
  },
  demoBtnText: { color: colors.black, fontWeight: '900', fontSize: 13 },
});
