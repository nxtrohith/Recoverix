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
          <Text style={styles.recoveryBannerText}>
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
            size={20}
            color={isRecovery1 ? '#f59e0b' : isRecovery2 ? '#10b981' : '#38bdf8'}
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
          <RefreshCw size={14} color="#f59e0b" />
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
              <Navigation size={18} color="#ffffff" />
              <Text style={styles.primaryBtnText}>START NAVIGATION</Text>
              <ArrowRight size={18} color="#ffffff" />
            </TouchableOpacity>

            {destination && onLaunchExternalGoogleMaps && (
              <TouchableOpacity
                style={styles.gmapsExternalBtn}
                onPress={onLaunchExternalGoogleMaps}
                activeOpacity={0.8}
                accessibilityLabel="Open in Google Maps"
              >
                <ExternalLink size={16} color="#38bdf8" />
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
              <XSquare size={18} color="#ffffff" />
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
                  <VolumeX size={18} color="#f87171" />
                ) : (
                  <Volume2 size={18} color="#10b981" />
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
                <ExternalLink size={16} color="#38bdf8" />
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
    left: 12,
    right: 12,
    zIndex: 100,
    backgroundColor: '#0f172a',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#334155',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 12,
  },
  recoveryBanner: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  leg1Banner: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: '#f59e0b',
    borderWidth: 1,
  },
  leg2Banner: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: '#10b981',
    borderWidth: 1,
  },
  recoveryBannerText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: 0.6,
  },
  destinationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  pinIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  destTextContainer: {
    flex: 1,
  },
  destSub: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.6,
  },
  destTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#f8fafc',
  },
  destCity: {
    fontSize: 12,
    color: '#64748b',
  },
  changeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  changeBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38bdf8',
    letterSpacing: 0.5,
  },
  metricsRow: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 12,
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
    backgroundColor: '#334155',
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#f8fafc',
  },
  reroutingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  reroutingText: {
    color: '#fbbf24',
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  maneuverBox: {
    backgroundColor: '#0c4a6e',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 12,
    gap: 4,
  },
  maneuverTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  distBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  distBadgeText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '900',
  },
  maneuverText: {
    flex: 1,
    color: '#e0f2fe',
    fontSize: 12.5,
    fontWeight: '700',
  },
  nextManeuverSubText: {
    color: '#94a3b8',
    fontSize: 11,
    paddingLeft: 2,
    fontStyle: 'italic',
  },
  actionRow: {
    marginTop: 2,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284c7',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 10,
    shadowColor: '#0284c7',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  disabledBtn: {
    backgroundColor: '#334155',
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  stopBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
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
    backgroundColor: '#1e293b',
    borderWidth: 1.5,
    borderColor: '#38bdf8',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 6,
  },
  gmapsBtnText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  voiceBtn: {
    padding: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceMutedBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#f87171',
  },
});
