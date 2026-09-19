import React from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { HUB_COLORS } from '../utils/projection';

interface TimelineControlsProps {
  simulatedNow: number;
  minTime: number;
  maxTime: number;
  isPlaying: boolean;
  speedMultiplier: number;
  onTogglePlay: () => void;
  onReset: () => void;
  onScrub: (time: number) => void;
  onSpeedChange: (speed: number) => void;
}

const SPEED_OPTIONS = [1, 5, 25];

export const TimelineControls: React.FC<TimelineControlsProps> = ({
  simulatedNow,
  minTime,
  maxTime,
  isPlaying,
  speedMultiplier,
  onTogglePlay,
  onReset,
  onScrub,
  onSpeedChange,
}) => {
  const totalDuration = maxTime - minTime;
  const progressRatio = totalDuration > 0 ? (simulatedNow - minTime) / totalDuration : 0;
  const progressPercent = Math.min(100, Math.max(0, progressRatio * 100));

  const formatShortTime = (ms: number) => {
    const d = new Date(ms);
    return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')} UTC`;
  };

  return (
    <footer className="control-tower-footer">
      {/* Legend */}
      <div className="legend-strip">
        <span className="legend-heading">MAP LEGEND:</span>
        <div className="legend-items">
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: HUB_COLORS.Hub }} />
            <span>Hub</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: HUB_COLORS.Intermediate }} />
            <span>Intermediate</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: HUB_COLORS.Delivery }} />
            <span>Delivery / DC</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: HUB_COLORS.Collection }} />
            <span>Collection</span>
          </div>
          <div className="legend-item">
            <span className="legend-line idle" />
            <span>Idle Route</span>
          </div>
          <div className="legend-item">
            <span className="legend-line active" />
            <span>Active Route</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot truck-dot" />
            <span>In-Transit Truck</span>
          </div>
        </div>
      </div>

      {/* Main Scrubber and Playback Bar */}
      <div className="playback-bar">
        {/* Play / Pause & Reset */}
        <div className="playback-buttons">
          <button
            className={`btn-play-pause ${isPlaying ? 'playing' : ''}`}
            onClick={onTogglePlay}
            title={isPlaying ? 'Pause Simulation' : 'Play Simulation'}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
            <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
          </button>

          <button className="btn-reset" onClick={onReset} title="Reset to Start">
            <RotateCcw size={16} />
            <span>RESET</span>
          </button>
        </div>

        {/* Timeline Range Scrubber */}
        <div className="timeline-slider-group">
          <div className="time-boundary-labels">
            <span className="boundary-time font-mono">{formatShortTime(minTime)}</span>
            <span className="current-sim-time font-mono">
              {formatShortTime(simulatedNow)} ({progressPercent.toFixed(1)}%)
            </span>
            <span className="boundary-time font-mono">{formatShortTime(maxTime)}</span>
          </div>

          <div className="slider-wrapper">
            <input
              type="range"
              min={minTime}
              max={maxTime}
              value={simulatedNow}
              onChange={(e) => onScrub(Number(e.target.value))}
              className="timeline-range"
            />
            <div
              className="timeline-fill-glow"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Speed Multipliers */}
        <div className="speed-buttons-group">
          <span className="speed-label">WARP:</span>
          {SPEED_OPTIONS.map((speed) => (
            <button
              key={speed}
              className={`speed-pill ${speedMultiplier === speed ? 'active' : ''}`}
              onClick={() => onSpeedChange(speed)}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>
    </footer>
  );
};
