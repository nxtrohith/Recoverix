import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Navigation, Clock, MapPin, ArrowRight, XSquare, ExternalLink, Volume2, VolumeX, CornerUpRight, RefreshCw } from 'lucide-react-native';
import { Warehouse, Route, NavigationMode, RecoveryAssignment } from '../types/navigation';
import { formatDistance, formatETA, formatTimeArrival } from '../utils/formatting';

interface NavigationBottomSheetProps {
  mode: NavigationMode;
  destination: Warehouse | null;
  activeRoute: Route | null;
  recoveryAssignment: RecoveryAssignment | null;
  currentManeuverText?: string;
  distanceToNextManeuverMeters?: number;
  nextManeuverText?: string;
  isRerouting?: boolean;
  isVoiceMuted?: boolean;
  onStartNavigation: () => void;
  onStopNavigation: () => void;
  onOpenWarehouseSelector: () => void;
  onLaunchExternalGoogleMaps?: () => void;
  onToggleVoiceMute?: () => void;
}

export const NavigationBottomSheet: React.FC<NavigationBottomSheetProps> = ({
  mode,
  destination,
  activeRoute,
  recoveryAssignment,
  currentManeuverText = 'Continue along primary freight corridor',
  distanceToNextManeuverMeters = 0,
  nextManeuverText,
  isRerouting = false,
  isVoiceMuted = false,
  onStartNavigation,
  onStopNavigation,
  onOpenWarehouseSelector,
  onLaunchExternalGoogleMaps,
  onToggleVoiceMute,
}) => {
  const isNavigating =
    mode === 'NAVIGATING' || mode === 'RECOVERY_LEG_1' || mode === 'RECOVERY_LEG_2';

  const isRecovery1 = mode === 'RECOVERY_LEG_1';
  const isRecovery2 = mode === 'RECOVERY_LEG_2';

  const distanceText = activeRoute ? formatDistance(activeRoute.distanceKm) : '-- km';
  const etaText = activeRoute ? formatETA(activeRoute.estimatedMinutes) : '-- min';
  const arrivalTimeText = activeRoute
    ? formatTimeArrival(activeRoute.estimatedMinutes)
    : '--:--';

  return (
    <View style={styles.sheetContainer}>
      {/* Recovery Phase Header Badge */}
      {(isRecovery1 || isRecovery2) && (
        <View style={[styles.recoveryBanner, isRecovery1 ? styles.leg1Banner : styles.leg2Banner]}>
          <Text style={[styles.recoveryBannerText, isRecovery1 ? styles.leg1Text : styles.leg2Text]}>
            {isRecovery1
              ? '🚨 RECOVERY ROUTE · LEG 1 OF 2 (PICKUP)'
              : '✓ CARGO SECURED · LEG 2 OF 2 (FINAL DELIVERY)'}
          </Text>
        </View>
      )}

      {/* Main Destination Info Row */}
      <View style={styles.destinationRow}>
        <View style={styles.pinIconBox}>
          <MapPin
            size={18}
            color={isRecovery1 ? '#B45309' : '#111827'}
          />
        </View>
        <View style={styles.destTextContainer}>
          <Text style={styles.destSub}>
            {isRecovery1 ? 'RECOVERY HUB' : isRecovery2 ? 'FINAL DESTINATION' : 'NEXT WAREHOUSE'}
          </Text>
          <Text style={styles.destTitle} numberOfLines={1}>
            {destination ? destination.name : 'Select Destination Warehouse'}
          </Text>
          <Text style={styles.destCity}>{destination?.city || 'Telangana Logistics Network'}</Text>
        </View>

        {!isNavigating && (
          <TouchableOpacity
            style={styles.changeBtn}
            onPress={onOpenWarehouseSelector}
            activeOpacity={0.7}
          >
            <Text style={styles.changeBtnText}>CHANGE</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Metrics Row: Distance, ETA, Arrival Time */}
      <View style={styles.metricsRow}>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>DISTANCE</Text>
          <Text style={styles.metricValue}>{distanceText}</Text>
        </View>

        <View style={styles.metricDivider} />

        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>EST. TIME</Text>
          <Text style={styles.metricValue}>{etaText}</Text>
        </View>

        <View style={styles.metricDivider} />

        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>ARRIVAL</Text>
          <Text style={styles.metricValue}>{arrivalTimeText}</Text>
        </View>
      </View>

      {/* Rerouting Banner */}
      {isRerouting && (
        <View style={styles.reroutingBanner}>
          <RefreshCw size={14} color="#B45309" />
          <Text style={styles.reroutingText}>Route Deviation · Recalculating Path...</Text>
        </View>
      )}

      {/* Turn-by-Turn Maneuver Box (when active) */}
      {isNavigating && (
        <View style={styles.maneuverBox}>
          <View style={styles.maneuverTopRow}>
            <View style={styles.distBadge}>
              <Text style={styles.distBadgeText}>
                {distanceToNextManeuverMeters >= 1000
                  ? `${(distanceToNextManeuverMeters / 1000).toFixed(1)} km`
                  : `${Math.round(distanceToNextManeuverMeters)} m`}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.maneuverText} numberOfLines={2}>
                {currentManeuverText}
              </Text>
            </View>
          </View>
          {nextManeuverText && (
            <Text style={styles.nextManeuverSubText} numberOfLines={1}>
              Then: {nextManeuverText}
            </Text>
          )}
        </View>
      )}

      {/* Primary Action Button */}
      <View style={styles.actionRow}>
        {!isNavigating ? (
          <View style={styles.buttonFlexRow}>
            <TouchableOpacity
              style={[styles.primaryBtn, !destination && styles.disabledBtn]}
              onPress={onStartNavigation}
              disabled={!destination}
              activeOpacity={0.85}
            >
              <Navigation size={17} color={destination ? '#FFFFFF' : '#9CA3AF'} />
              <Text style={[styles.primaryBtnText, !destination && styles.disabledBtnText]}>
                START NAVIGATION
              </Text>
              <ArrowRight size={17} color={destination ? '#FFFFFF' : '#9CA3AF'} />
            </TouchableOpacity>

            {destination && onLaunchExternalGoogleMaps && (
              <TouchableOpacity
                style={styles.gmapsExternalBtn}
                onPress={onLaunchExternalGoogleMaps}
                activeOpacity={0.8}
                accessibilityLabel="Open in Google Maps"
              >
                <ExternalLink size={16} color="#111827" />
                <Text style={styles.gmapsBtnText}>GMAP</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.buttonFlexRow}>
            <TouchableOpacity
              style={styles.stopBtn}
              onPress={onStopNavigation}
              activeOpacity={0.85}
            >
              <XSquare size={17} color="#B91C1C" />
              <Text style={styles.stopBtnText}>END NAVIGATION</Text>
            </TouchableOpacity>

            {onToggleVoiceMute && (
              <TouchableOpacity
                style={[styles.voiceBtn, isVoiceMuted && styles.voiceMutedBtn]}
                onPress={onToggleVoiceMute}
                activeOpacity={0.8}
                accessibilityLabel="Toggle Voice Guidance"
              >
                {isVoiceMuted ? (
                  <VolumeX size={17} color="#B91C1C" />
                ) : (
                  <Volume2 size={17} color="#111827" />
                )}
              </TouchableOpacity>
            )}

            {onLaunchExternalGoogleMaps && (
              <TouchableOpacity
                style={styles.gmapsExternalBtn}
                onPress={onLaunchExternalGoogleMaps}
                activeOpacity={0.8}
                accessibilityLabel="Open in Google Maps"
              >
                <ExternalLink size={16} color="#111827" />
                <Text style={styles.gmapsBtnText}>GMAP</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  sheetContainer: {
    position: 'absolute',
    bottom: 12,
    left: 14,
    right: 14,
    zIndex: 100,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
  },
  recoveryBanner: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 9999,
    marginBottom: 12,
    alignItems: 'center',
  },
  leg1Banner: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FEF3C7',
    borderWidth: 1,
  },
  leg2Banner: {
    backgroundColor: '#F0FDF4',
    borderColor: '#DCFCE7',
    borderWidth: 1,
  },
  leg1Text: {
    color: '#B45309',
  },
  leg2Text: {
    color: '#15803D',
  },
  recoveryBannerText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  destinationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  pinIconBox: {
    width: 36,
    height: 36,
    borderRadius: 9999,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  destTextContainer: {
    flex: 1,
  },
  destSub: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.5,
  },
  destTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.2,
  },
  destCity: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },
  changeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  changeBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: 0.3,
  },
  metricsRow: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#E5E7EB',
  },
  metricLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.2,
  },
  reroutingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FEF3C7',
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 12,
  },
  reroutingText: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: '700',
  },
  maneuverBox: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    marginBottom: 12,
    gap: 4,
  },
  maneuverTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  distBadge: {
    backgroundColor: '#111827',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  distBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  maneuverText: {
    flex: 1,
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
  },
  nextManeuverSubText: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '500',
    paddingLeft: 2,
  },
  actionRow: {
    marginTop: 2,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    paddingVertical: 13,
    borderRadius: 9999,
    gap: 8,
  },
  disabledBtn: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  disabledBtnText: {
    color: '#9CA3AF',
  },
  stopBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    paddingVertical: 13,
    borderRadius: 9999,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  stopBtnText: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  buttonFlexRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gmapsExternalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 9999,
    gap: 6,
  },
  gmapsBtnText: {
    color: '#111827',
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  voiceBtn: {
    width: 46,
    height: 46,
    backgroundColor: '#F3F4F6',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceMutedBtn: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FEE2E2',
  },
});
