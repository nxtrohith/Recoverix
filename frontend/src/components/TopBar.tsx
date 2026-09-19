import React from 'react';
import { Clock, Network, Radio, Truck } from 'lucide-react';

interface TopBarProps {
  simulatedNow: number;
  activeTrucksCount: number;
  totalTrucksCount: number;
  hubsCount: number;
  legsCount: number;
  isPlaying: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  simulatedNow,
  activeTrucksCount,
  totalTrucksCount,
  hubsCount,
  legsCount,
  isPlaying,
}) => {
  const formattedTime = new Date(simulatedNow).toUTCString().replace('GMT', 'UTC');

  return (
    <header className="control-tower-header">
      <div className="header-brand">
        <div className="status-indicator">
          <span className={`status-dot ${isPlaying ? 'live' : 'paused'}`} />
          <span className="system-tag">CONTROL TOWER</span>
        </div>
        <h1 className="header-title">TELANGANA LOGISTICS NETWORK</h1>
      </div>

      <div className="metrics-group">
        <div className="metric-pill">
          <Clock className="metric-icon accent-teal" size={16} />
          <div className="metric-content">
            <span className="metric-label">SIMULATION CLOCK</span>
            <span className="metric-value font-mono">{formattedTime}</span>
          </div>
        </div>

        <div className="metric-pill">
          <Truck className="metric-icon accent-orange" size={16} />
          <div className="metric-content">
            <span className="metric-label">ACTIVE TRUCKS</span>
            <span className="metric-value font-mono">
              <strong className="text-highlight">{activeTrucksCount}</strong>
              <span className="text-dim"> / {totalTrucksCount}</span>
            </span>
          </div>
        </div>

        <div className="metric-pill">
          <Radio className="metric-icon accent-gold" size={16} />
          <div className="metric-content">
            <span className="metric-label">HUBS RENDERED</span>
            <span className="metric-value font-mono">{hubsCount}</span>
          </div>
        </div>

        <div className="metric-pill">
          <Network className="metric-icon accent-blue" size={16} />
          <div className="metric-content">
            <span className="metric-label">NETWORK LEGS</span>
            <span className="metric-value font-mono">{legsCount}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
