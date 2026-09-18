import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import {
  Navigation,
  Clock,
  Gauge,
  ArrowUpRight,
  ArrowUpLeft,
  ArrowUp,
  Flag,
  XSquare,
  Play,
  Pause,
  Volume2,
  VolumeX,
  RefreshCw,
  CornerUpRight,
  CornerUpLeft,
  RotateCcw,
  Compass,
} from 'lucide-react-native';
import { useNavigationContext } from '../context/NavigationContext';
import { formatDistance, formatETA, formatTimeArrival, formatSpeed } from '../utils/formatting';
import { ManeuverType } from '../types/navigation';

function getManeuverIcon(type?: ManeuverType, color = '#FFFFFF') {
  switch (type) {
    case 'turn-right':
    case 'turn-slight-right':
    case 'turn-sharp-right':
    case 'fork-right':
    case 'ramp-right':
      return <CornerUpRight size={24} color={color} />;
    case 'turn-left':
    case 'turn-slight-left':
    case 'turn-sharp-left':
    case 'fork-left':
    case 'ramp-left':
      return <CornerUpLeft size={24} color={color} />;
    case 'uturn':
      return <RotateCcw size={24} color={color} />;
    case 'roundabout':
      return <RotateCcw size={24} color={color} />;
    default:
      return <ArrowUp size={24} color={color} />;
  }
}

export default function NavigationScreen() {
  const {
    driver,
    driverLocation,
    destinationWarehouse,
    activeRoute,
    mode,
    guidanceState,
    isVoiceMuted,
    isRerouting,
    toggleVoiceMute,
    recalculateRoute,
    isSimulating,
    isSimPaused,
    stopNavigation,
    startSimulation,
    pauseSimulation,
    resumeSimulation,
    launchExternalNavigation,
  } = useNavigationContext();

  const isRecovery = mode === 'RECOVERY_LEG_1' || mode === 'RECOVERY_LEG_2';
  const speed = driverLocation.speed ? driverLocation.speed * 3.6 : (isSimulating ? 58 : 0);

  const remainingDist = guidanceState.remainingDistanceKm || (activeRoute ? activeRoute.distanceKm : 0);
  const remainingMin = guidanceState.remainingMinutes || (activeRoute ? activeRoute.estimatedMinutes : 0);

  const currentManeuver =
    guidanceState.currentManeuver?.instruction ||
    (activeRoute ? activeRoute.maneuvers?.[0]?.instruction : 'Continue on primary highway');

  const distToTurnMeters = guidanceState.distanceToNextManeuverMeters;
  const distToTurnText =
    distToTurnMeters >= 1000
      ? `In ${(distToTurnMeters / 1000).toFixed(1)} km`
      : `In ${Math.round(distToTurnMeters)} m`;

  return (
    <View style={styles.container}>
      {/* 1. Rerouting Alert Banner */}
      {isRerouting && (
        <View style={styles.reroutingCard}>
          <RefreshCw size={15} color="#B45309" />
          <Text style={styles.reroutingTitle}>OFF-ROUTE · RECALCULATING ROUTE...</Text>
        </View>
      )}

      {/* 2. Top Turn-by-Turn Banner */}
      <View style={[styles.turnBanner, isRecovery && styles.turnBannerRecovery]}>
        <View style={styles.turnIconBox}>
          {getManeuverIcon(guidanceState.currentManeuver?.maneuverType)}
        </View>

        <View style={styles.turnTextGroup}>
          <Text style={styles.turnMeters}>{distToTurnText}</Text>
          <Text style={styles.turnInstruction} numberOfLines={2}>
            {currentManeuver}
          </Text>
        </View>

        {/* In-App Voice Guidance Toggle Button */}
        <TouchableOpacity
          style={[styles.voiceHeaderBtn, isVoiceMuted && styles.voiceHeaderBtnMuted]}
          onPress={toggleVoiceMute}
          activeOpacity={0.7}
          accessibilityLabel="Toggle Voice Guidance"
        >
          {isVoiceMuted ? (
            <VolumeX size={18} color="#B91C1C" />
          ) : (
            <Volume2 size={18} color="#111827" />
          )}
        </TouchableOpacity>
      </View>

      {/* 3. Next Upcoming Step Preview */}
      {guidanceState.nextManeuver && (
        <View style={styles.nextStepBar}>
          <Text style={styles.nextStepPrefix}>THEN</Text>
          <Text style={styles.nextStepText} numberOfLines={1}>
            {guidanceState.nextManeuver.instruction}
          </Text>
        </View>
      )}

      {/* 4. Route Progress Bar */}
      <View style={styles.progressBarContainer}>
        <View
          style={[
            styles.progressBarFill,
            { width: `${guidanceState.routeProgressPercent}%` },
            isRecovery && { backgroundColor: '#B45309' },
          ]}
        />
      </View>

      {/* 5. Tactical Heads-Up Telemetry Gauges */}
      <View style={styles.gaugesRow}>
        <View style={styles.gaugeCard}>
          <Gauge size={16} color="#111827" />
          <Text style={styles.gaugeLabel}>SPEED</Text>
          <Text style={styles.gaugeValue}>{formatSpeed(speed)}</Text>
        </View>

        <View style={styles.gaugeCard}>
          <Navigation size={16} color="#15803D" />
          <Text style={styles.gaugeLabel}>REMAINING</Text>
          <Text style={styles.gaugeValue}>{formatDistance(remainingDist)}</Text>
        </View>

        <View style={styles.gaugeCard}>
          <Clock size={16} color="#B45309" />
          <Text style={styles.gaugeLabel}>ETA</Text>
          <Text style={styles.gaugeValue}>{formatETA(remainingMin)}</Text>
        </View>
      </View>

      {/* 6. Destination Facility Bar */}
      <View style={styles.destinationBar}>
        <View style={styles.destIconBox}>
          <Flag size={16} color="#15803D" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.destLabel}>TARGET HUB</Text>
          <Text style={styles.destName}>{destinationWarehouse?.name || 'No Destination'}</Text>
        </View>
        <Text style={styles.destArrival}>{formatTimeArrival(remainingMin)}</Text>
      </View>

      {/* 7. Upcoming Maneuvers List */}
      <View style={styles.maneuversHeader}>
        <Text style={styles.maneuversTitle}>ROUTE MANEUVERS</Text>
        <TouchableOpacity onPress={() => recalculateRoute()}>
          <Text style={styles.recalculateLink}>Recalculate</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.maneuverList} contentContainerStyle={{ paddingBottom: 16 }}>
        {activeRoute?.maneuvers.map((m, idx) => {
          const isCurrent = idx === guidanceState.currentStepIndex;
          return (
            <View
              key={m.id || idx}
              style={[styles.maneuverItem, isCurrent && styles.maneuverItemCurrent]}
            >
              <View style={[styles.stepCircle, isCurrent && styles.stepCircleCurrent]}>
                <Text style={[styles.stepNum, isCurrent && styles.stepNumCurrent]}>
                  {idx + 1}
                </Text>
              </View>
              <View style={styles.stepDetails}>
                <Text style={[styles.stepInstruction, isCurrent && styles.stepInstructionCurrent]}>
                  {m.instruction}
                </Text>
                <Text style={styles.stepDistance}>{formatDistance(m.distanceMeters / 1000)}</Text>
              </View>
              <ArrowUpRight size={16} color={isCurrent ? '#111827' : '#9CA3AF'} />
            </View>
          );
        })}
      </ScrollView>

      {/* 8. Google Maps External Navigation Button (Fallback) */}
      <TouchableOpacity
        style={styles.gmapsLaunchFullBtn}
        onPress={launchExternalNavigation}
        activeOpacity={0.85}
      >
        <Navigation size={15} color="#111827" />
        <Text style={styles.gmapsLaunchText}>OPEN IN GOOGLE MAPS</Text>
      </TouchableOpacity>

      {/* 9. Bottom Controls Bar */}
      <View style={styles.footerControls}>
        {!isSimulating ? (
          <TouchableOpacity
            style={styles.simStartBtn}
            onPress={startSimulation}
            activeOpacity={0.85}
          >
            <Play size={14} color="#FFFFFF" fill="#FFFFFF" />
            <Text style={styles.btnText}>SIMULATE</Text>
          </TouchableOpacity>
        ) : isSimPaused ? (
          <TouchableOpacity
            style={styles.simResumeBtn}
            onPress={resumeSimulation}
            activeOpacity={0.85}
          >
            <Play size={14} color="#FFFFFF" fill="#FFFFFF" />
            <Text style={styles.btnText}>RESUME</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.simPauseBtn}
            onPress={pauseSimulation}
            activeOpacity={0.85}
          >
            <Pause size={14} color="#B45309" fill="#B45309" />
            <Text style={styles.pauseBtnText}>PAUSE</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.exitBtn}
          onPress={stopNavigation}
          activeOpacity={0.85}
        >
          <XSquare size={14} color="#B91C1C" />
          <Text style={styles.exitBtnText}>EXIT</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    padding: 16,
  },
  reroutingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FEF3C7',
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 10,
  },
  reroutingTitle: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  turnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  turnBannerRecovery: {
    borderLeftWidth: 4,
    borderLeftColor: '#B45309',
  },
  turnIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  turnTextGroup: {
    flex: 1,
  },
  turnMeters: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  turnInstruction: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  voiceHeaderBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  voiceHeaderBtnMuted: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FEE2E2',
  },
  nextStepBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    marginBottom: 10,
  },
  nextStepPrefix: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.8,
  },
  nextStepText: {
    flex: 1,
    fontSize: 12,
    color: '#111827',
    fontWeight: '600',
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#111827',
    borderRadius: 2,
  },
  gaugesRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  gaugeCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  gaugeLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.6,
  },
  gaugeValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  destinationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    gap: 10,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  destIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  destLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.6,
  },
  destName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    marginTop: 1,
  },
  destArrival: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  maneuversHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  maneuversTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.8,
  },
  recalculateLink: {
    fontSize: 11,
    fontWeight: '600',
    color: '#111827',
  },
  maneuverList: {
    flex: 1,
  },
  maneuverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  maneuverItemCurrent: {
    borderColor: '#111827',
    backgroundColor: '#F9FAFB',
  },
  stepCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  stepCircleCurrent: {
    backgroundColor: '#111827',
  },
  stepNum: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280',
  },
  stepNumCurrent: {
    color: '#FFFFFF',
  },
  stepDetails: {
    flex: 1,
  },
  stepInstruction: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#4B5563',
  },
  stepInstructionCurrent: {
    color: '#111827',
    fontWeight: '700',
  },
  stepDistance: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  footerControls: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 10,
  },
  simStartBtn: {
    flex: 2,
    flexDirection: 'row',
    backgroundColor: '#111827',
    paddingVertical: 12,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  simPauseBtn: {
    flex: 2,
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FEF3C7',
    paddingVertical: 12,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  simResumeBtn: {
    flex: 2,
    flexDirection: 'row',
    backgroundColor: '#111827',
    paddingVertical: 12,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  exitBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    paddingVertical: 12,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  pauseBtnText: {
    color: '#B45309',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  exitBtnText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  gmapsLaunchFullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 11,
    borderRadius: 9999,
    gap: 8,
    marginTop: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  gmapsLaunchText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
