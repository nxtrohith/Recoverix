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

function getManeuverIcon(type?: ManeuverType) {
  switch (type) {
    case 'turn-right':
    case 'turn-slight-right':
    case 'turn-sharp-right':
    case 'fork-right':
    case 'ramp-right':
      return <CornerUpRight size={28} color="#ffffff" />;
    case 'turn-left':
    case 'turn-slight-left':
    case 'turn-sharp-left':
    case 'fork-left':
    case 'ramp-left':
      return <CornerUpLeft size={28} color="#ffffff" />;
    case 'uturn':
      return <RotateCcw size={28} color="#ffffff" />;
    case 'roundabout':
      return <RotateCcw size={28} color="#ffffff" />;
    default:
      return <ArrowUp size={28} color="#ffffff" />;
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
          <RefreshCw size={16} color="#f59e0b" />
          <Text style={styles.reroutingTitle}>OFF-ROUTE · RECALCULATING OPTIMAL ROUTE...</Text>
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
            <VolumeX size={20} color="#f87171" />
          ) : (
            <Volume2 size={20} color="#ffffff" />
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
            isRecovery && { backgroundColor: '#f59e0b' },
          ]}
        />
      </View>

      {/* 5. Tactical Heads-Up Telemetry Gauges */}
      <View style={styles.gaugesRow}>
        <View style={styles.gaugeCard}>
          <Gauge size={16} color="#38bdf8" />
          <Text style={styles.gaugeLabel}>SPEED</Text>
          <Text style={styles.gaugeValue}>{formatSpeed(speed)}</Text>
        </View>

        <View style={styles.gaugeCard}>
          <Navigation size={16} color="#10b981" />
          <Text style={styles.gaugeLabel}>REMAINING</Text>
          <Text style={styles.gaugeValue}>{formatDistance(remainingDist)}</Text>
        </View>

        <View style={styles.gaugeCard}>
          <Clock size={16} color="#f59e0b" />
          <Text style={styles.gaugeLabel}>ETA</Text>
          <Text style={styles.gaugeValue}>{formatETA(remainingMin)}</Text>
        </View>
      </View>

      {/* 6. Destination Facility Bar */}
      <View style={styles.destinationBar}>
        <Flag size={18} color="#10b981" />
        <View style={{ flex: 1 }}>
          <Text style={styles.destLabel}>TARGET FACILITY</Text>
          <Text style={styles.destName}>{destinationWarehouse?.name || 'No Destination'}</Text>
        </View>
        <Text style={styles.destArrival}>{formatTimeArrival(remainingMin)}</Text>
      </View>

      {/* 7. Upcoming Maneuvers List */}
      <View style={styles.maneuversHeader}>
        <Text style={styles.maneuversTitle}>ALL ROUTE MANEUVERS</Text>
        <TouchableOpacity onPress={() => recalculateRoute()}>
          <Text style={styles.recalculateLink}>Recalculate</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.maneuverList} contentContainerStyle={{ paddingBottom: 20 }}>
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
              <ArrowUpRight size={16} color={isCurrent ? '#38bdf8' : '#64748b'} />
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
        <Navigation size={18} color="#0f172a" fill="#0f172a" />
        <Text style={styles.gmapsLaunchText}>OPEN IN GOOGLE MAPS APP</Text>
      </TouchableOpacity>

      {/* 9. Bottom Controls Bar */}
      <View style={styles.footerControls}>
        {!isSimulating ? (
          <TouchableOpacity
            style={styles.simStartBtn}
            onPress={startSimulation}
            activeOpacity={0.8}
          >
            <Play size={16} color="#ffffff" fill="#ffffff" />
            <Text style={styles.btnText}>SIMULATE TRAVEL</Text>
          </TouchableOpacity>
        ) : isSimPaused ? (
          <TouchableOpacity
            style={styles.simResumeBtn}
            onPress={resumeSimulation}
            activeOpacity={0.8}
          >
            <Play size={16} color="#ffffff" fill="#ffffff" />
            <Text style={styles.btnText}>RESUME</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.simPauseBtn}
            onPress={pauseSimulation}
            activeOpacity={0.8}
          >
            <Pause size={16} color="#ffffff" fill="#ffffff" />
            <Text style={styles.btnText}>PAUSE SIM</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.exitBtn}
          onPress={stopNavigation}
          activeOpacity={0.8}
        >
          <XSquare size={16} color="#ffffff" />
          <Text style={styles.btnText}>EXIT</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090d16',
    padding: 14,
  },
  reroutingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  reroutingTitle: {
    color: '#fbbf24',
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  turnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284c7',
    borderRadius: 16,
    padding: 16,
    marginTop: 6,
    marginBottom: 8,
    shadowColor: '#0284c7',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  turnBannerRecovery: {
    backgroundColor: '#d97706',
    shadowColor: '#d97706',
  },
  turnIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  turnTextGroup: {
    flex: 1,
  },
  turnMeters: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    opacity: 0.9,
    letterSpacing: 0.5,
  },
  turnInstruction: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  voiceHeaderBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  voiceHeaderBtnMuted: {
    backgroundColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    borderColor: '#f87171',
  },
  nextStepBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 8,
    marginBottom: 10,
  },
  nextStepPrefix: {
    fontSize: 10,
    fontWeight: '900',
    color: '#38bdf8',
    letterSpacing: 0.8,
  },
  nextStepText: {
    flex: 1,
    fontSize: 11.5,
    color: '#cbd5e1',
    fontWeight: '600',
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: '#1e293b',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
    borderRadius: 2,
  },
  gaugesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  gaugeCard: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 10,
    alignItems: 'center',
    gap: 4,
  },
  gaugeLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.6,
  },
  gaugeValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#f8fafc',
  },
  destinationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 12,
    gap: 10,
    marginBottom: 14,
  },
  destLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.6,
  },
  destName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#f8fafc',
  },
  destArrival: {
    fontSize: 14,
    fontWeight: '800',
    color: '#10b981',
  },
  maneuversHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  maneuversTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.8,
  },
  recalculateLink: {
    fontSize: 11,
    fontWeight: '800',
    color: '#38bdf8',
  },
  maneuverList: {
    flex: 1,
  },
  maneuverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 12,
    marginBottom: 8,
  },
  maneuverItemCurrent: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  stepCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  stepCircleCurrent: {
    backgroundColor: '#0284c7',
  },
  stepNum: {
    fontSize: 11,
    fontWeight: '800',
    color: '#38bdf8',
  },
  stepNumCurrent: {
    color: '#ffffff',
  },
  stepDetails: {
    flex: 1,
  },
  stepInstruction: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#f8fafc',
  },
  stepInstructionCurrent: {
    color: '#38bdf8',
    fontWeight: '800',
  },
  stepDistance: {
    fontSize: 11,
    color: '#64748b',
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
    backgroundColor: '#0284c7',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  simPauseBtn: {
    flex: 2,
    flexDirection: 'row',
    backgroundColor: '#d97706',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  simResumeBtn: {
    flex: 2,
    flexDirection: 'row',
    backgroundColor: '#10b981',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  exitBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#dc2626',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  gmapsLaunchFullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#38bdf8',
    paddingVertical: 13,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
    shadowColor: '#38bdf8',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  gmapsLaunchText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
});
