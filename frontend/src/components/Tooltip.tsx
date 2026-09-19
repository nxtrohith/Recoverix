import React from 'react';
import { MapPin, Truck } from 'lucide-react';
import type { HoveredEntity } from '../types';
import { getHubColor } from '../utils/projection';

interface TooltipProps {
  entity: HoveredEntity | null;
}

export const Tooltip: React.FC<TooltipProps> = ({ entity }) => {
  if (!entity) return null;

  const { screenX, screenY, kind, hubData, truckData } = entity;

  // Offset tooltip to stay near cursor
  const tooltipStyle: React.CSSProperties = {
    position: 'fixed',
    left: `${screenX + 16}px`,
    top: `${screenY + 16}px`,
    pointerEvents: 'none',
    zIndex: 9999,
  };

  if (kind === 'hub' && hubData) {
    const hubColor = getHubColor(hubData.hubType);
    return (
      <div className="hud-tooltip" style={tooltipStyle}>
        <div className="tooltip-header">
          <MapPin size={14} style={{ color: hubColor }} />
          <span className="tooltip-title">{hubData.city} Hub</span>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-key">Facility:</span>
          <span className="tooltip-val">{hubData.name.replace(/ \(Telangana\)/, '')}</span>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-key">Type:</span>
          <span className="tooltip-badge" style={{ borderColor: hubColor, color: hubColor }}>
            {hubData.hubType}
          </span>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-key">Total Network Trips:</span>
          <span className="tooltip-val font-mono font-bold">{hubData.tripCount}</span>
        </div>
      </div>
    );
  }

  if (kind === 'truck' && truckData) {
    return (
      <div className="hud-tooltip" style={tooltipStyle}>
        <div className="tooltip-header">
          <Truck size={14} className="text-orange" />
          <span className="tooltip-title font-mono">{truckData.vehicleNumber}</span>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-key">Vehicle Type:</span>
          <span className="tooltip-val capitalize">{truckData.type}</span>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-key">Route:</span>
          <span className="tooltip-val">
            {truckData.originName} &rarr; {truckData.destinationName}
          </span>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-key">Status:</span>
          <span className="tooltip-val text-teal">{truckData.status}</span>
        </div>
        <div className="tooltip-progress-row">
          <div className="tooltip-progress-text">
            <span>Trip Progress</span>
            <span className="font-mono">{truckData.progressPercent}%</span>
          </div>
          <div className="tooltip-progress-bar">
            <div
              className="tooltip-progress-fill"
              style={{ width: `${truckData.progressPercent}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return null;
};
