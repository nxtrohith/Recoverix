import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Play, Pause, RotateCcw, Zap } from 'lucide-react-native';

interface SimulationControlsProps {
  isSimulating: boolean;
  isPaused: boolean;
  speed: number;
  progressPercent: number;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onSetSpeed: (speed: number) => void;
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  isSimulating,
  isPaused,
  speed,
  progressPercent,
  onStart,
  onPause,
  onResume,
  onReset,
  onSetSpeed,
}) => {
  return (
    <View style={styles.dockContainer}>
      <View style={styles.topRow}>
        <View style={styles.titleGroup}>
          <Zap size={14} color="#f59e0b" />
          <Text style={styles.dockTitle}>SIMULATION ENGINE</Text>
          <Text style={styles.progressText}>{progressPercent}%</Text>
        </View>

        {/* Speed Selector Buttons */}
        <View style={styles.speedGroup}>
          {[1, 3, 5, 10].map((s) => (
            <TouchableOpacity
              key={`speed-${s}`}
              style={[styles.speedBtn, speed === s && styles.speedBtnActive]}
              onPress={() => onSetSpeed(s)}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.speedBtnText, speed === s && styles.speedBtnTextActive]}
              >
                {s}x
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressBarBg}>
        <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
      </View>

      {/* Action Buttons */}
      <View style={styles.btnRow}>
        {!isSimulating ? (
          <TouchableOpacity
            style={styles.startBtn}
            onPress={onStart}
            activeOpacity={0.85}
          >
            <Play size={16} color="#ffffff" fill="#ffffff" />
            <Text style={styles.startBtnText}>START SIMULATION</Text>
          </TouchableOpacity>
        ) : isPaused ? (
          <TouchableOpacity
            style={styles.resumeBtn}
            onPress={onResume}
            activeOpacity={0.85}
          >
            <Play size={16} color="#ffffff" fill="#ffffff" />
            <Text style={styles.startBtnText}>RESUME</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.pauseBtn}
            onPress={onPause}
            activeOpacity={0.85}
          >
            <Pause size={16} color="#ffffff" fill="#ffffff" />
            <Text style={styles.pauseBtnText}>PAUSE</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.resetBtn}
          onPress={onReset}
          activeOpacity={0.7}
          accessibilityLabel="Reset Simulation"
        >
          <RotateCcw size={16} color="#94a3b8" />
          <Text style={styles.resetBtnText}>RESET</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  dockContainer: {
    position: 'absolute',
    bottom: 275,
    left: 14,
    right: 14,
    zIndex: 90,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 6,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dockTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#f59e0b',
    letterSpacing: 0.6,
  },
  progressText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38bdf8',
    marginLeft: 4,
  },
  speedGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  speedBtn: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: '#1e293b',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  speedBtnActive: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b',
  },
  speedBtnText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#94a3b8',
  },
  speedBtnTextActive: {
    color: '#0f172a',
    fontWeight: '900',
  },
  progressBarBg: {
    height: 4,
    backgroundColor: '#1e293b',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
    borderRadius: 2,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  startBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284c7',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  resumeBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  pauseBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d97706',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  startBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  pauseBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  resetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 4,
  },
  resetBtnText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
  },
});
