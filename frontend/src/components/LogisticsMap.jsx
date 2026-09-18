import { useEffect, useMemo } from 'react';
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  buildRecoveryMapState,
  nodeLatLng,
} from './recovery/recoveryMapState';
import { candidateTypeLabel } from './recovery/candidateUtils';

const TELANGANA_CENTER = [17.9, 79.0];
const DEFAULT_ZOOM = 7;

/** Visual hierarchy — keep within existing App.css palette. */
const COLORS = {
  hub: '#64748b',
  hubStroke: '#1e293b',
  edge: '#94a3b8',
  expectedRoute: '#64748b',
  expectedNode: '#94a3b8',
  actual: '#e11d48',
  actualStroke: '#9f1239',
  vehicle: '#38bdf8',
  vehicleStroke: '#0369a1',
  recoveryVehicle: '#f59e0b',
  recoveryVehicleStroke: '#b45309',
  affectedVehicle: '#fb7185',
  affectedStroke: '#9f1239',
  vehicleRoute: '#0ea5e9',
  recoveryToPickup: '#ea580c',
  recoveryToDest: '#c2410c',
  recoveryPath: '#ea580c',
  recoveryHub: '#fb923c',
  destination: '#22c55e',
  destinationStroke: '#166534',
  preview: '#a8a29e',
  origin: '#94a3b8',
  originStroke: '#334155',
};

function FitBounds({ positions, fitKey }) {
  const map = useMap();
  useEffect(() => {
    const valid = (positions || []).filter(
      (p) => Array.isArray(p) && p.length === 2 && p.every((n) => Number.isFinite(n)),
    );
    if (valid.length >= 2) {
      map.fitBounds(L.latLngBounds(valid), { padding: [48, 48], maxZoom: 11 });
    } else if (valid.length === 1) {
      map.setView(valid[0], 10);
    }
  }, [map, positions, fitKey]);
  return null;
}

function nodeLabel(nodeById, id) {
  if (!id) return '—';
  const n = nodeById?.get(id);
  return n?.name || id;
}

export default function LogisticsMap({
  graph,
  loading,
  error,
  vehicles = [],
  selectedShipment,
  selectedVehicle,
  recoveryAnalysis,
  activeIncident,
  focusNodeId,
  previewCandidateId = null,
}) {
  const nodeById = useMemo(() => {
    const map = new Map();
    for (const n of graph?.nodes || []) {
      map.set(n.id, n);
    }
    return map;
  }, [graph]);

  const edgePositions = useMemo(() => {
    return (graph?.edges || [])
      .map((e) => {
        const a = nodeLatLng(nodeById.get(e.source));
        const b = nodeLatLng(nodeById.get(e.target));
        if (!a || !b) return null;
        return [a, b];
      })
      .filter(Boolean);
  }, [graph, nodeById]);

  const recovery = useMemo(
    () =>
      buildRecoveryMapState({
        graph,
        selectedShipment,
        recoveryAnalysis,
        activeIncident,
        vehicles,
        selectedVehicle,
        previewCandidateId,
      }),
    [
      graph,
      selectedShipment,
      recoveryAnalysis,
      activeIncident,
      vehicles,
      selectedVehicle,
      previewCandidateId,
    ],
  );

  const hasIncident =
    Boolean(activeIncident) &&
    activeIncident.status &&
    activeIncident.status !== 'RESOLVED';

  const showRecoveryOverlays = recovery.active && hasIncident;

  const affectedVehicleId = activeIncident?.vehicleId || null;

  const fitPositions = useMemo(() => {
    const pts = [];
    if (focusNodeId) {
      const p = nodeLatLng(nodeById.get(focusNodeId));
      if (p) pts.push(p);
    }
    if (showRecoveryOverlays && recovery.fitPositions.length) {
      pts.push(...recovery.fitPositions);
    } else {
      const origin = nodeLatLng(nodeById.get(selectedShipment?.originNode));
      const current = nodeLatLng(nodeById.get(selectedShipment?.currentNode));
      const dest = nodeLatLng(nodeById.get(selectedShipment?.destinationNode));
      if (origin) pts.push(origin);
      if (current) pts.push(current);
      if (dest) pts.push(dest);
      if (selectedVehicle?.currentNode) {
        const p = nodeLatLng(nodeById.get(selectedVehicle.currentNode));
        if (p) pts.push(p);
      }
    }
    if (!pts.length) {
      for (const n of graph?.nodes || []) {
        const p = nodeLatLng(n);
        if (p) pts.push(p);
      }
    }
    return pts;
  }, [
    focusNodeId,
    nodeById,
    showRecoveryOverlays,
    recovery.fitPositions,
    selectedShipment,
    selectedVehicle,
    graph,
  ]);

  const fitKey = showRecoveryOverlays
    ? [
        activeIncident?.incidentId || activeIncident?.id || '',
        recovery.vehicleId || '',
        recovery.selectedCandidateId || '',
        previewCandidateId || '',
        (recovery.recoveryPath || []).join(','),
      ].join('|')
    : focusNodeId || selectedShipment?.id || selectedVehicle?.id || 'default';

  // Non-recovery corridor fallback (origin → current → dest)
  const plannedCorridor = useMemo(() => {
    if (showRecoveryOverlays) return [];
    const pts = [];
    const origin = nodeLatLng(nodeById.get(selectedShipment?.originNode));
    const current = nodeLatLng(nodeById.get(selectedShipment?.currentNode));
    const dest = nodeLatLng(nodeById.get(selectedShipment?.destinationNode));
    if (origin) pts.push(origin);
    if (current) pts.push(current);
    if (dest) pts.push(dest);
    return pts;
  }, [showRecoveryOverlays, nodeById, selectedShipment]);

  if (loading) {
    return (
      <section className="map-workspace border-0 shadow-none">
        <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
          Loading network graph…
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="map-workspace border-0 shadow-none">
        <div className="flex h-72 items-center justify-center px-6 text-center text-sm text-status-misplaced">
          {error}
        </div>
      </section>
    );
  }

  if (!graph?.nodes?.length) {
    return (
      <section className="map-workspace border-0 shadow-none">
        <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
          No graph nodes returned from /api/graph.
        </div>
      </section>
    );
  }

  const recoveryHubSet = new Set(
    showRecoveryOverlays ? recovery.recoveryPath || [] : [],
  );

  return (
    <section className="map-workspace border-0 shadow-none">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b-2 border-border bg-background px-4 py-2.5 text-[0.7rem] font-medium uppercase tracking-[0.06em]">
        <span><i className="map-swatch hub" /> hubs</span>
        <span><i className="map-swatch edge" /> network</span>
        <span><i className="map-swatch vehicle" /> vehicles</span>
        <span><i className="map-swatch ship" /> shipment</span>
        <span><i className="map-swatch dest" /> destination</span>
        {showRecoveryOverlays ? (
          <>
            <span><i className="map-swatch expected-route" /> expected route</span>
            <span><i className="map-swatch pickup" /> recovery pickup</span>
            <span><i className="map-swatch recovery" /> recovery path</span>
            <span><i className="map-swatch vehicle-route" /> vehicle route</span>
            {recovery.pickupCase ? (
              <span className="normal-case tracking-normal text-muted-foreground">
                type: {recovery.pickupCaseLabel}
              </span>
            ) : null}
          </>
        ) : (
          <span><i className="map-swatch recovery" /> recovery path</span>
        )}
      </div>
      {showRecoveryOverlays ? (
        <p className="border-b-2 border-border bg-secondary-background px-4 py-2 text-xs text-muted-foreground">
          Hub positions from network graph — not live GPS.
          {recovery.pickupNode ? (
            <>
              {' '}
              Pickup at <strong className="text-foreground">{nodeLabel(nodeById, recovery.pickupNode)}</strong>
              {recovery.expectedNode &&
              recovery.expectedNode !== recovery.pickupNode ? (
                <>
                  {' '}
                  (expected was{' '}
                  <strong className="text-foreground">{nodeLabel(nodeById, recovery.expectedNode)}</strong>)
                </>
              ) : null}
              .
            </>
          ) : null}
        </p>
      ) : null}
      <div className="map-canvas">
        <MapContainer
          center={TELANGANA_CENTER}
          zoom={DEFAULT_ZOOM}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds positions={fitPositions} fitKey={fitKey} />

          {/* Background network edges */}
          {edgePositions.map((latlngs, idx) => (
            <Polyline
              key={`e-${idx}`}
              positions={latlngs}
              pathOptions={{
                color: COLORS.edge,
                weight: 1.5,
                opacity: showRecoveryOverlays ? 0.35 : 0.55,
              }}
            />
          ))}

          {/* Expected shipment route (backend plannedRoute only) */}
          {showRecoveryOverlays && recovery.expectedLatLngs.length >= 2 ? (
            <Polyline
              positions={recovery.expectedLatLngs}
              pathOptions={{
                color: COLORS.expectedRoute,
                weight: 3,
                opacity: 0.75,
                dashArray: '10 8',
              }}
            />
          ) : null}

          {/* Existing vehicle movement (backend currentPath only) */}
          {showRecoveryOverlays && recovery.vehicleRouteLatLngs.length >= 2 ? (
            <Polyline
              positions={recovery.vehicleRouteLatLngs}
              pathOptions={{
                color: COLORS.vehicleRoute,
                weight: 4,
                opacity: 0.7,
                dashArray: '2 10',
              }}
            />
          ) : null}

          {/* Candidate preview (inspect only — de-emphasized) */}
          {showRecoveryOverlays &&
          recovery.preview?.latLngs?.length >= 2 ? (
            <Polyline
              positions={recovery.preview.latLngs}
              pathOptions={{
                color: COLORS.preview,
                weight: 3,
                opacity: 0.55,
                dashArray: '4 6',
              }}
            />
          ) : null}

          {/* Recovery path: vehicle → pickup → destination (split when possible) */}
          {showRecoveryOverlays &&
          recovery.toPickupLatLngs.length >= 2 ? (
            <Polyline
              positions={recovery.toPickupLatLngs}
              pathOptions={{
                color: COLORS.recoveryToPickup,
                weight: 5,
                opacity: 0.95,
              }}
            />
          ) : null}
          {showRecoveryOverlays &&
          recovery.fromPickupLatLngs.length >= 2 ? (
            <Polyline
              positions={recovery.fromPickupLatLngs}
              pathOptions={{
                color: COLORS.recoveryToDest,
                weight: 5,
                opacity: 0.95,
              }}
            />
          ) : null}
          {showRecoveryOverlays &&
          recovery.toPickupLatLngs.length < 2 &&
          recovery.fromPickupLatLngs.length < 2 &&
          recovery.recoveryLatLngs.length >= 2 ? (
            <Polyline
              positions={recovery.recoveryLatLngs}
              pathOptions={{
                color: COLORS.recoveryPath,
                weight: 5,
                opacity: 0.95,
              }}
            />
          ) : null}

          {/* Non-recovery planned corridor */}
          {!showRecoveryOverlays && plannedCorridor.length >= 2 ? (
            <Polyline
              positions={plannedCorridor}
              pathOptions={{
                color: COLORS.expectedRoute,
                weight: 3,
                opacity: 0.85,
              }}
            />
          ) : null}

          {/* Hub nodes */}
          {(graph.nodes || []).map((n) => {
            const pos = nodeLatLng(n);
            if (!pos) return null;
            const onRecovery = recoveryHubSet.has(n.id);
            return (
              <CircleMarker
                key={n.id}
                center={pos}
                radius={onRecovery ? 7 : 5}
                pathOptions={{
                  color: onRecovery ? COLORS.recoveryToDest : COLORS.hubStroke,
                  fillColor: onRecovery ? COLORS.recoveryHub : COLORS.hub,
                  fillOpacity: showRecoveryOverlays && !onRecovery ? 0.55 : 0.85,
                  weight: onRecovery ? 2 : 1,
                }}
              >
                <Popup>
                  <strong>{n.name || n.id}</strong>
                  <br />
                  {n.type} · {n.district}
                  {onRecovery ? ' · on recovery path' : ''}
                </Popup>
              </CircleMarker>
            );
          })}

          {/* Expected hub marker */}
          {showRecoveryOverlays &&
          recovery.expectedPos &&
          recovery.expectedNode !== recovery.actualNode ? (
            <CircleMarker
              center={recovery.expectedPos}
              radius={9}
              pathOptions={{
                color: COLORS.originStroke,
                fillColor: COLORS.expectedNode,
                fillOpacity: 0.95,
                weight: 2,
                dashArray: '3 3',
              }}
            >
              <Popup>
                Expected location
                <br />
                {nodeLabel(nodeById, recovery.expectedNode)}
              </Popup>
            </CircleMarker>
          ) : null}

          {/* Actual / recovery pickup — most prominent */}
          {showRecoveryOverlays && recovery.pickupPos ? (
            <CircleMarker
              center={recovery.pickupPos}
              radius={14}
              pathOptions={{
                color: COLORS.actualStroke,
                fillColor: COLORS.actual,
                fillOpacity: 1,
                weight: 3,
              }}
            >
              <Popup>
                <strong>RECOVERY PICKUP</strong>
                <br />
                Actual: {nodeLabel(nodeById, recovery.pickupNode)}
                {recovery.expectedNode ? (
                  <>
                    <br />
                    Expected: {nodeLabel(nodeById, recovery.expectedNode)}
                  </>
                ) : null}
                <br />
                <span className="muted">Hub record — not live GPS</span>
              </Popup>
            </CircleMarker>
          ) : null}

          {/* Destination */}
          {(showRecoveryOverlays
            ? recovery.destinationPos
            : nodeLatLng(nodeById.get(selectedShipment?.destinationNode))) ? (
            <CircleMarker
              center={
                showRecoveryOverlays
                  ? recovery.destinationPos
                  : nodeLatLng(nodeById.get(selectedShipment?.destinationNode))
              }
              radius={10}
              pathOptions={{
                color: COLORS.destinationStroke,
                fillColor: COLORS.destination,
                fillOpacity: 1,
                weight: 2,
              }}
            >
              <Popup>
                Destination
                <br />
                {nodeLabel(
                  nodeById,
                  showRecoveryOverlays
                    ? recovery.destinationNode
                    : selectedShipment?.destinationNode,
                )}
              </Popup>
            </CircleMarker>
          ) : null}

          {/* Origin (non-recovery or when distinct) */}
          {!showRecoveryOverlays &&
          nodeLatLng(nodeById.get(selectedShipment?.originNode)) ? (
            <CircleMarker
              center={nodeLatLng(nodeById.get(selectedShipment?.originNode))}
              radius={8}
              pathOptions={{
                color: COLORS.originStroke,
                fillColor: COLORS.origin,
                fillOpacity: 1,
                weight: 2,
              }}
            >
              <Popup>
                Origin
                <br />
                {selectedShipment?.origin || selectedShipment?.originNode}
              </Popup>
            </CircleMarker>
          ) : null}

          {!showRecoveryOverlays &&
          nodeLatLng(nodeById.get(selectedShipment?.currentNode)) ? (
            <CircleMarker
              center={nodeLatLng(nodeById.get(selectedShipment?.currentNode))}
              radius={10}
              pathOptions={{
                color: COLORS.actualStroke,
                fillColor: COLORS.actual,
                fillOpacity: 1,
                weight: 2,
              }}
            >
              <Popup>
                Shipment current
                <br />
                {selectedShipment?.trackingNumber || selectedShipment?.id}
              </Popup>
            </CircleMarker>
          ) : null}

          {/* Fleet vehicles */}
          {vehicles.map((v) => {
            const pos = nodeLatLng(nodeById.get(v.currentNode));
            if (!pos) return null;
            const isRecovery =
              showRecoveryOverlays &&
              recovery.vehicleId &&
              v.id === recovery.vehicleId;
            const isAffected =
              affectedVehicleId && v.id === affectedVehicleId && !isRecovery;
            const isSelected = selectedVehicle?.id === v.id && !isRecovery;
            // Hide default marker when dedicated recovery marker renders
            if (isRecovery) return null;
            return (
              <CircleMarker
                key={`v-${v.id}`}
                center={pos}
                radius={isAffected || isSelected ? 9 : 6}
                pathOptions={{
                  color: isAffected
                    ? COLORS.affectedStroke
                    : COLORS.vehicleStroke,
                  fillColor: isAffected
                    ? COLORS.affectedVehicle
                    : COLORS.vehicle,
                  fillOpacity: showRecoveryOverlays ? 0.45 : 0.95,
                  weight: 2,
                }}
              >
                <Popup>
                  <strong>{v.vehicleNumber || v.id}</strong>
                  <br />
                  {v.status}
                  {isAffected ? ' · AFFECTED VEHICLE' : ''}
                </Popup>
              </CircleMarker>
            );
          })}

          {/* Selected recovery vehicle — dedicated marker + popup */}
          {showRecoveryOverlays && recovery.vehiclePos ? (
            <CircleMarker
              center={recovery.vehiclePos}
              radius={11}
              pathOptions={{
                color: COLORS.recoveryVehicleStroke,
                fillColor: COLORS.recoveryVehicle,
                fillOpacity: 1,
                weight: 3,
              }}
            >
              <Popup>
                <strong>
                  Vehicle{' '}
                  {recovery.vehicleNumber || recovery.vehicleId || '—'}
                </strong>
                <br />
                Driver: {recovery.driverHandle || '—'}
                <br />
                Type:{' '}
                {recovery.pickupCase
                  ? recovery.pickupCaseLabel
                  : '—'}
                <br />
                Current node:{' '}
                {nodeLabel(nodeById, recovery.vehicleCurrentNode)}
                {recovery.pickupCase === 'at_node' ? (
                  <>
                    <br />
                    Already at pickup
                  </>
                ) : null}
                {recovery.pickupCase === 'pass_through' ? (
                  <>
                    <br />
                    Existing route intersects pickup
                  </>
                ) : null}
                {recovery.pickupCase === 'detour' ? (
                  <>
                    <br />
                    Detour to pickup then destination
                  </>
                ) : null}
              </Popup>
            </CircleMarker>
          ) : null}

          {/* Preview vehicle (inspect) */}
          {showRecoveryOverlays &&
          recovery.preview?.vehicle?.currentNode &&
          recovery.preview.vehicleId !== recovery.vehicleId
            ? (() => {
                const pos = nodeLatLng(
                  nodeById.get(recovery.preview.vehicle.currentNode),
                );
                if (!pos) return null;
                return (
                  <CircleMarker
                    key={`preview-v-${recovery.preview.vehicleId}`}
                    center={pos}
                    radius={8}
                    pathOptions={{
                      color: '#78716c',
                      fillColor: COLORS.preview,
                      fillOpacity: 0.85,
                      weight: 2,
                    }}
                  >
                    <Popup>
                      Preview:{' '}
                      {recovery.preview.vehicleNumber ||
                        recovery.preview.vehicleId}
                      <br />
                      {candidateTypeLabel(recovery.preview.pickupCase)}
                    </Popup>
                  </CircleMarker>
                );
              })()
            : null}
        </MapContainer>
      </div>
    </section>
  );
}
