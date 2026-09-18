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

const TELANGANA_CENTER = [17.9, 79.0];
const DEFAULT_ZOOM = 7;

function FitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    const valid = (positions || []).filter(
      (p) => Array.isArray(p) && p.length === 2 && p.every((n) => Number.isFinite(n)),
    );
    if (valid.length >= 2) {
      map.fitBounds(L.latLngBounds(valid), { padding: [40, 40] });
    } else if (valid.length === 1) {
      map.setView(valid[0], 10);
    }
  }, [map, positions]);
  return null;
}

function nodeLatLng(node) {
  if (!node) return null;
  const lat = node.latitude;
  const lon = node.longitude;
  if (lat == null || lon == null) return null;
  return [lat, lon];
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

  // Prefer assigned / pickup-confirmed incident path over ephemeral analysis
  const recoveryPath =
    ((activeIncident?.status === 'ASSIGNED' ||
      activeIncident?.status === 'PICKUP_CONFIRMED') &&
    activeIncident?.recoveryPath?.length
      ? activeIncident.recoveryPath
      : null) ||
    recoveryAnalysis?.selectedRecovery?.path ||
    [];
  const recoveryLatLngs = useMemo(() => {
    return recoveryPath
      .map((id) => nodeLatLng(nodeById.get(id)))
      .filter(Boolean);
  }, [recoveryPath, nodeById]);

  const shipmentOrigin = nodeLatLng(nodeById.get(selectedShipment?.originNode));
  const shipmentCurrent = nodeLatLng(
    nodeById.get(selectedShipment?.currentNode),
  );
  const shipmentDest = nodeLatLng(
    nodeById.get(selectedShipment?.destinationNode),
  );

  const incidentHub = nodeLatLng(nodeById.get(activeIncident?.hubName));

  const recoveryVehicleId =
    activeIncident?.recoveryVehicleId ||
    recoveryAnalysis?.selectedRecovery?.vehicleId;
  const affectedVehicleId = activeIncident?.vehicleId;
  const recoveryVehicle =
    vehicles.find((v) => v.id === recoveryVehicleId) ||
    (selectedVehicle?.id === recoveryVehicleId ? selectedVehicle : null);

  const plannedCorridor = useMemo(() => {
    const pts = [];
    if (shipmentOrigin) pts.push(shipmentOrigin);
    if (shipmentCurrent) pts.push(shipmentCurrent);
    if (shipmentDest) pts.push(shipmentDest);
    return pts;
  }, [shipmentOrigin, shipmentCurrent, shipmentDest]);

  const hasIncident =
    Boolean(activeIncident) &&
    activeIncident.status &&
    activeIncident.status !== 'RESOLVED';

  const fitPositions = useMemo(() => {
    const pts = [];
    if (focusNodeId) {
      const p = nodeLatLng(nodeById.get(focusNodeId));
      if (p) pts.push(p);
    }
    if (shipmentOrigin) pts.push(shipmentOrigin);
    if (shipmentCurrent) pts.push(shipmentCurrent);
    if (shipmentDest) pts.push(shipmentDest);
    if (incidentHub) pts.push(incidentHub);
    pts.push(...recoveryLatLngs);
    if (selectedVehicle?.currentNode) {
      const p = nodeLatLng(nodeById.get(selectedVehicle.currentNode));
      if (p) pts.push(p);
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
    shipmentOrigin,
    shipmentCurrent,
    shipmentDest,
    incidentHub,
    recoveryLatLngs,
    selectedVehicle,
    graph,
  ]);

  if (loading) {
    return (
      <section className="map-panel panel">
        <h2>Logistics Map</h2>
        <p className="muted">Loading graph…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="map-panel panel">
        <h2>Logistics Map</h2>
        <p className="error-text">{error}</p>
      </section>
    );
  }

  if (!graph?.nodes?.length) {
    return (
      <section className="map-panel panel">
        <h2>Logistics Map</h2>
        <p className="muted">No graph nodes returned from /api/graph.</p>
      </section>
    );
  }

  return (
    <section className="map-panel panel">
      <h2>Logistics Map</h2>
      <div className="map-legend">
        <span><i className="swatch hub" /> hubs</span>
        <span><i className="swatch edge" /> routes</span>
        <span><i className="swatch vehicle" /> vehicles</span>
        <span><i className="swatch ship" /> shipment</span>
        <span><i className="swatch dest" /> destination</span>
        <span><i className="swatch recovery" /> recovery path</span>
        {hasIncident ? <span><i className="swatch incident" /> incident hub</span> : null}
      </div>
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
          <FitBounds positions={fitPositions} />

          {edgePositions.map((latlngs, idx) => (
            <Polyline
              key={`e-${idx}`}
              positions={latlngs}
              pathOptions={{ color: '#94a3b8', weight: 1.5, opacity: 0.55 }}
            />
          ))}

          {/* Planned corridor: Origin → Current → Destination (pre-recovery) */}
          {!recoveryLatLngs.length && plannedCorridor.length >= 2 ? (
            <Polyline
              positions={plannedCorridor}
              pathOptions={{
                color: hasIncident ? '#be123c' : '#64748b',
                weight: hasIncident ? 4 : 3,
                opacity: 0.85,
                dashArray: hasIncident ? '8 6' : undefined,
              }}
            />
          ) : null}

          {(graph.nodes || []).map((n) => {
            const pos = nodeLatLng(n);
            if (!pos) return null;
            const onRecovery = recoveryPath.includes(n.id);
            return (
              <CircleMarker
                key={n.id}
                center={pos}
                radius={onRecovery ? 7 : 5}
                pathOptions={{
                  color: onRecovery ? '#c2410c' : '#1e293b',
                  fillColor: onRecovery ? '#fb923c' : '#64748b',
                  fillOpacity: 0.85,
                  weight: onRecovery ? 2 : 1,
                }}
              >
                <Popup>
                  <strong>{n.name || n.id}</strong>
                  <br />
                  {n.type} · {n.district}
                  {onRecovery ? ' · recovery hub' : ''}
                </Popup>
              </CircleMarker>
            );
          })}

          {vehicles.map((v) => {
            const pos = nodeLatLng(nodeById.get(v.currentNode));
            if (!pos) return null;
            const isRecovery = recoveryVehicleId && v.id === recoveryVehicleId;
            const isAffected = affectedVehicleId && v.id === affectedVehicleId;
            const isSelected = selectedVehicle?.id === v.id;
            return (
              <CircleMarker
                key={`v-${v.id}`}
                center={pos}
                radius={isRecovery || isAffected || isSelected ? 9 : 6}
                pathOptions={{
                  color: isRecovery
                    ? '#b45309'
                    : isAffected
                      ? '#9f1239'
                      : '#0369a1',
                  fillColor: isRecovery
                    ? '#f59e0b'
                    : isAffected
                      ? '#fb7185'
                      : '#38bdf8',
                  fillOpacity: 0.95,
                  weight: 2,
                }}
              >
                <Popup>
                  <strong>{v.vehicleNumber || v.id}</strong>
                  <br />
                  {v.status}
                  {isRecovery ? ' · RECOVERY VEHICLE' : ''}
                  {isAffected && !isRecovery ? ' · AFFECTED VEHICLE' : ''}
                </Popup>
              </CircleMarker>
            );
          })}

          {shipmentOrigin && !hasIncident ? (
            <CircleMarker
              center={shipmentOrigin}
              radius={8}
              pathOptions={{
                color: '#334155',
                fillColor: '#94a3b8',
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

          {shipmentCurrent ? (
            <CircleMarker
              center={shipmentCurrent}
              radius={hasIncident ? 12 : 10}
              pathOptions={{
                color: '#9f1239',
                fillColor: '#e11d48',
                fillOpacity: 1,
                weight: hasIncident ? 3 : 2,
              }}
            >
              <Popup>
                {hasIncident ? 'Incident hub / shipment current' : 'Shipment current'}
                <br />
                {selectedShipment?.trackingNumber || selectedShipment?.id}
              </Popup>
            </CircleMarker>
          ) : null}

          {shipmentDest ? (
            <CircleMarker
              center={shipmentDest}
              radius={10}
              pathOptions={{
                color: '#166534',
                fillColor: '#22c55e',
                fillOpacity: 1,
                weight: 2,
              }}
            >
              <Popup>
                Destination
                <br />
                {selectedShipment?.destination || selectedShipment?.destinationNode}
              </Popup>
            </CircleMarker>
          ) : null}

          {recoveryLatLngs.length >= 2 ? (
            <Polyline
              positions={recoveryLatLngs}
              pathOptions={{ color: '#ea580c', weight: 5, opacity: 0.95 }}
            />
          ) : null}

          {recoveryPath.map((nodeId) => {
            const pos = nodeLatLng(nodeById.get(nodeId));
            if (!pos) return null;
            return (
              <CircleMarker
                key={`rp-${nodeId}`}
                center={pos}
                radius={6}
                pathOptions={{
                  color: '#c2410c',
                  fillColor: '#fb923c',
                  fillOpacity: 0.95,
                  weight: 2,
                }}
              >
                <Popup>Recovery node: {nodeId}</Popup>
              </CircleMarker>
            );
          })}

          {recoveryVehicle && !vehicles.some((v) => v.id === recoveryVehicle.id) ? (
            (() => {
              const pos = nodeLatLng(nodeById.get(recoveryVehicle.currentNode));
              if (!pos) return null;
              return (
                <CircleMarker
                  center={pos}
                  radius={9}
                  pathOptions={{
                    color: '#b45309',
                    fillColor: '#f59e0b',
                    fillOpacity: 0.95,
                    weight: 2,
                  }}
                >
                  <Popup>Recovery vehicle</Popup>
                </CircleMarker>
              );
            })()
          ) : null}
        </MapContainer>
      </div>
    </section>
  );
}

