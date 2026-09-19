import React, { useState } from 'react';
import { Activity, ArrowRight, Truck } from 'lucide-react';
import type { ControlTowerEvent, LocationNode, Route, Vehicle } from '../types';

interface ActiveTruckItem {
  vehicle: Vehicle;
  route: Route;
  originLoc: LocationNode;
  destLoc: LocationNode;
  progressPercent: number;
}

interface RightPanelProps {
  activeTrucks: ActiveTruckItem[];
  events: ControlTowerEvent[];
}

export const RightPanel: React.FC<RightPanelProps> = ({ activeTrucks, events }) => {
  const [activeTab, setActiveTab] = useState<'trucks' | 'events'>('trucks');

  return (
    <aside className="control-tower-sidebar">
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab-btn ${activeTab === 'trucks' ? 'active' : ''}`}
          onClick={() => setActiveTab('trucks')}
        >
          <Truck size={15} />
          <span>ACTIVE TRUCKS</span>
          <span className="badge-count">{activeTrucks.length}</span>
        </button>
        <button
          className={`sidebar-tab-btn ${activeTab === 'events' ? 'active' : ''}`}
          onClick={() => setActiveTab('events')}
        >
          <Activity size={15} />
          <span>EVENT FEED</span>
          <span className="badge-count live">{events.length}</span>
        </button>
      </div>

      <div className="sidebar-scrollable">
        {activeTab === 'trucks' ? (
          <div className="trucks-list">
            {activeTrucks.length === 0 ? (
              <div className="empty-panel-message">
                <Truck size={28} className="text-dim mb-2" />
                <p>No trucks currently moving at this simulation timestamp.</p>
                <span className="text-sub">Play or scrub timeline to view active transits.</span>
              </div>
            ) : (
              activeTrucks.map(({ vehicle, route, originLoc, destLoc, progressPercent }) => (
                <div key={vehicle._id} className="truck-card">
                  <div className="truck-card-header">
                    <div className="truck-id-badge">
                      <Truck size={13} className="text-orange" />
                      <span className="vehicle-no font-mono">{vehicle.vehicleNumber}</span>
                    </div>
                    <span className="truck-type-tag">{vehicle.type.toUpperCase()}</span>
                  </div>

                  <div className="truck-route-row">
                    <span className="city-pill">{originLoc.city}</span>
                    <ArrowRight size={12} className="text-dim mx-1" />
                    <span className="city-pill">{destLoc.city}</span>
                  </div>

                  <div className="progress-container">
                    <div className="progress-label-row">
                      <span className="progress-caption">{route.routeCode}</span>
                      <span className="progress-val font-mono">{progressPercent}%</span>
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="events-list">
            {events.length === 0 ? (
              <div className="empty-panel-message">
                <Activity size={28} className="text-dim mb-2" />
                <p>No lifecycle events logged yet.</p>
                <span className="text-sub">Events trigger as simulation crosses departure/arrival marks.</span>
              </div>
            ) : (
              events.map((ev) => (
                <div key={ev.id} className={`event-card ${ev.type.toLowerCase()}`}>
                  <div className="event-meta-row">
                    <span className={`event-type-tag ${ev.type.toLowerCase()}`}>
                      {ev.type === 'TRUCK_DEPARTURE' ? 'DEPARTURE' : 'ARRIVAL'}
                    </span>
                    <span className="event-time font-mono">{ev.relativeTime}</span>
                  </div>

                  <div className="event-details">
                    <span className="event-vehicle font-mono">{ev.vehicleNumber}</span>
                    <span className="event-route-path">
                      {ev.originCity} &rarr; {ev.destinationCity}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
