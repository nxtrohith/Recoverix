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
          <Zap size={14} color="#111827" />
          <Text style={styles.dockTitle}>SIMULATION ENGINE</Text>
          <Text style={styles.progressText}>{progressPercent}%</Text>
        </View>

        {/* Speed Selector Pill Buttons */}
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
            <Play size={14} color="#FFFFFF" fill="#FFFFFF" />
            <Text style={styles.startBtnText}>START SIMULATION</Text>
          </TouchableOpacity>
        ) : isPaused ? (
          <TouchableOpacity
            style={styles.resumeBtn}
            onPress={onResume}
            activeOpacity={0.85}
          >
            <Play size={14} color="#FFFFFF" fill="#FFFFFF" />
            <Text style={styles.startBtnText}>RESUME</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.pauseBtn}
            onPress={onPause}
            activeOpacity={0.85}
          >
            <Pause size={14} color="#B45309" fill="#B45309" />
            <Text style={styles.pauseBtnText}>PAUSE</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.resetBtn}
          onPress={onReset}
          activeOpacity={0.7}
          accessibilityLabel="Reset Simulation"
        >
          <RotateCcw size={14} color="#111827" />
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
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dockTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: 0.3,
  },
  progressText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    marginLeft: 4,
  },
  speedGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  speedBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  speedBtnActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  speedBtnText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#4B5563',
  },
  speedBtnTextActive: {
    color: '#FFFFFF',
  },
  progressBarBg: {
    height: 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#111827',
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
    backgroundColor: '#111827',
    paddingVertical: 9,
    borderRadius: 9999,
    gap: 6,
  },
  resumeBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    paddingVertical: 9,
    borderRadius: 9999,
    gap: 6,
  },
  pauseBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFBEB',
    paddingVertical: 9,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#FEF3C7',
    gap: 6,
  },
  startBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  pauseBtnText: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  resetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    paddingVertical: 9,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 4,
  },
  resetBtnText: {
    color: '#111827',
    fontSize: 11,
    fontWeight: '700',
  },
});
