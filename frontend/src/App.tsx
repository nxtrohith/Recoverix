import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { RightPanel } from './components/RightPanel';
import { ThreeCanvas } from './components/ThreeCanvas';
import { TimelineControls } from './components/TimelineControls';
import { Tooltip } from './components/Tooltip';
import { TopBar } from './components/TopBar';
import { fetchControlTowerData, type ControlTowerData } from './services/api';
import type { ControlTowerEvent, HoveredEntity, LocationNode, Route, Vehicle } from './types';

export const App: React.FC = () => {
  const [data, setData] = useState<ControlTowerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Simulation Clock State
  const [simulatedNow, setSimulatedNow] = useState<number>(0);
  const [minTime, setMinTime] = useState<number>(0);
  const [maxTime, setMaxTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(5);

  // Hover Tooltip State
  const [hoveredEntity, setHoveredEntity] = useState<HoveredEntity | null>(null);

  // Fetch data on mount
  useEffect(() => {
    let mounted = true;
    fetchControlTowerData()
      .then((res) => {
        if (!mounted) return;
        setData(res);

        // Compute simulation time window across all routes
        if (res.routes.length > 0) {
          const deps = res.routes.map((r) => new Date(r.scheduledDeparture).getTime());
          const arrs = res.routes.map((r) => new Date(r.scheduledArrival).getTime());
          const start = Math.min(...deps);
          const end = Math.max(...arrs);
          setMinTime(start);
          setMaxTime(end);
          // Start simulation at earliest departure
          setSimulatedNow(start);
          // Auto play simulation after loading
          setIsPlaying(true);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.message || 'Failed to connect to API on port 4000');
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Compute Top 5 Hubs by trip count
  const { topHubNames } = useMemo(() => {
    if (!data) return { topHubNames: new Set<string>() };

    const hubTripCounts = new Map<string, number>();
    data.edges.forEach((e) => {
      hubTripCounts.set(e.source_name, (hubTripCounts.get(e.source_name) || 0) + (e.trip_count || 0));
      hubTripCounts.set(e.destination_name, (hubTripCounts.get(e.destination_name) || 0) + (e.trip_count || 0));
    });

    const sorted = Array.from(hubTripCounts.entries()).sort((a, b) => b[1] - a[1]);
    const top5 = new Set<string>(sorted.slice(0, 5).map(([name]) => name));

    return { topHubNames: top5 };
  }, [data]);

  // Lookup maps for fast access
  const locById = useMemo(() => {
    const map = new Map<string, LocationNode>();
    data?.locations.forEach((l) => map.set(l._id, l));
    return map;
  }, [data?.locations]);

  const routeById = useMemo(() => {
    const map = new Map<string, Route>();
    data?.routes.forEach((r) => map.set(r._id, r));
    return map;
  }, [data?.routes]);

  const vehicleByRouteId = useMemo(() => {
    const map = new Map<string, Vehicle>();
    data?.vehicles.forEach((v) => {
      if (v.currentRoute) map.set(v.currentRoute, v);
    });
    return map;
  }, [data?.vehicles]);

  // Simulation Clock Tick Loop
  const simNowRef = useRef(simulatedNow);
  simNowRef.current = simulatedNow;

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const speedRef = useRef(speedMultiplier);
  speedRef.current = speedMultiplier;

  useEffect(() => {
    let animId: number;
    let lastRealTime = performance.now();

    const loop = () => {
      const now = performance.now();
      const dtSec = (now - lastRealTime) / 1000;
      lastRealTime = now;

      if (isPlayingRef.current && maxTime > minTime) {
        // Base speed: 1 real second = 60 simulation seconds (1 min) at 1x
        const advanceMs = dtSec * 60 * 1000 * speedRef.current;
        let nextSimNow = simNowRef.current + advanceMs;

        if (nextSimNow >= maxTime) {
          nextSimNow = maxTime;
          setIsPlaying(false);
        }

        setSimulatedNow(nextSimNow);
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(animId);
  }, [minTime, maxTime]);

  // Derive Active (currently moving) Trucks
  const activeTrucks = useMemo(() => {
    if (!data) return [];

    const activeList: Array<{
      vehicle: Vehicle;
      route: Route;
      originLoc: LocationNode;
      destLoc: LocationNode;
      progressPercent: number;
    }> = [];

    data.vehicles.forEach((vehicle) => {
      if (vehicle.status !== 'in_transit' || !vehicle.currentRoute) return;
      const route = routeById.get(vehicle.currentRoute);
      if (!route) return;

      const originLoc = locById.get(route.origin);
      const destLoc = locById.get(route.destination);
      if (!originLoc || !destLoc) return;

      const dep = new Date(route.scheduledDeparture).getTime();
      const arr = new Date(route.scheduledArrival).getTime();

      if (simulatedNow >= dep && simulatedNow <= arr) {
        const duration = arr - dep;
        const progress = duration > 0 ? (simulatedNow - dep) / duration : 0;
        activeList.push({
          vehicle,
          route,
          originLoc,
          destLoc,
          progressPercent: Math.round(progress * 100),
        });
      }
    });

    // Sort by progress descending
    return activeList.sort((a, b) => b.progressPercent - a.progressPercent);
  }, [data, simulatedNow, locById, routeById]);

  // Derive Client-Side Event Feed
  const recentEvents = useMemo(() => {
    if (!data || !minTime) return [];

    const allEvents: ControlTowerEvent[] = [];

    data.routes.forEach((route) => {
      const vehicle = vehicleByRouteId.get(route._id);
      const originLoc = locById.get(route.origin);
      const destLoc = locById.get(route.destination);
      if (!vehicle || !originLoc || !destLoc) return;

      const depTime = new Date(route.scheduledDeparture).getTime();
      const arrTime = new Date(route.scheduledArrival).getTime();

      // Departure Event
      if (simulatedNow >= depTime) {
        const diffMs = simulatedNow - depTime;
        const diffMins = Math.floor(diffMs / 60000);
        const relTime = diffMins === 0 ? 'Just now' : `${diffMins}m ago`;
        allEvents.push({
          id: `dep_${route._id}`,
          type: 'TRUCK_DEPARTURE',
          timestamp: depTime,
          timeFormatted: new Date(depTime).toUTCString().slice(17, 22) + ' UTC',
          vehicleNumber: vehicle.vehicleNumber,
          routeCode: route.routeCode,
          originCity: originLoc.city,
          destinationCity: destLoc.city,
          relativeTime: relTime,
        });
      }

      // Arrival Event
      if (simulatedNow >= arrTime) {
        const diffMs = simulatedNow - arrTime;
        const diffMins = Math.floor(diffMs / 60000);
        const relTime = diffMins === 0 ? 'Just now' : `${diffMins}m ago`;
        allEvents.push({
          id: `arr_${route._id}`,
          type: 'TRUCK_ARRIVAL',
          timestamp: arrTime,
          timeFormatted: new Date(arrTime).toUTCString().slice(17, 22) + ' UTC',
          vehicleNumber: vehicle.vehicleNumber,
          routeCode: route.routeCode,
          originCity: originLoc.city,
          destinationCity: destLoc.city,
          relativeTime: relTime,
        });
      }
    });

    // Sort most recent first and take last 6
    return allEvents.sort((a, b) => b.timestamp - a.timestamp).slice(0, 6);
  }, [data, simulatedNow, minTime, locById, vehicleByRouteId]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="radar-spinner">
          <Loader2 className="animate-spin text-teal" size={48} />
        </div>
        <h2 className="loading-title">INITIALIZING CONTROL TOWER</h2>
        <p className="loading-sub">Connecting to MongoDB & Telangana Logistics Topology...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="loading-screen">
        <AlertCircle className="text-orange mb-3" size={48} />
        <h2 className="loading-title">NETWORK CONNECTION ERROR</h2>
        <p className="loading-sub">{error || 'Failed to load telemetry data.'}</p>
        <button className="btn-retry" onClick={() => window.location.reload()}>
          RETRY CONNECTION
        </button>
      </div>
    );
  }

  const inTransitTotal = data.vehicles.filter((v) => v.status === 'in_transit').length;

  return (
    <div className="control-tower-viewport">
      {/* 3D Canvas Background */}
      <ThreeCanvas
        nodes={data.nodes}
        edges={data.edges}
        locations={data.locations}
        routes={data.routes}
        vehicles={data.vehicles}
        geojson={data.geojson}
        simulatedNow={simulatedNow}
        topHubNames={topHubNames}
        onHover={setHoveredEntity}
      />

      {/* Floating HUD Tooltip */}
      <Tooltip entity={hoveredEntity} />

      {/* Top Stat Bar */}
      <TopBar
        simulatedNow={simulatedNow}
        activeTrucksCount={activeTrucks.length}
        totalTrucksCount={inTransitTotal}
        hubsCount={data.nodes.length}
        legsCount={data.edges.length}
        isPlaying={isPlaying}
      />

      {/* Right Telemetry Panel */}
      <RightPanel activeTrucks={activeTrucks} events={recentEvents} />

      {/* Bottom Timeline Controls & Legend */}
      <TimelineControls
        simulatedNow={simulatedNow}
        minTime={minTime}
        maxTime={maxTime}
        isPlaying={isPlaying}
        speedMultiplier={speedMultiplier}
        onTogglePlay={() => setIsPlaying(!isPlaying)}
        onReset={() => {
          setSimulatedNow(minTime);
          setIsPlaying(false);
        }}
        onScrub={(time) => setSimulatedNow(time)}
        onSpeedChange={(speed) => setSpeedMultiplier(speed)}
      />
    </div>
  );
};

export default App;
