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

  const recoveryPath = recoveryAnalysis?.selectedRecovery?.path || [];
  const recoveryLatLngs = useMemo(() => {
    return recoveryPath
      .map((id) => nodeLatLng(nodeById.get(id)))
      .filter(Boolean);
  }, [recoveryPath, nodeById]);

  const shipmentCurrent = nodeLatLng(
    nodeById.get(selectedShipment?.currentNode),
  );
  const shipmentDest = nodeLatLng(
    nodeById.get(selectedShipment?.destinationNode),
  );

  const recoveryVehicleId = recoveryAnalysis?.selectedRecovery?.vehicleId;
  const recoveryVehicle =
    vehicles.find((v) => v.id === recoveryVehicleId) ||
    (selectedVehicle?.id === recoveryVehicleId ? selectedVehicle : null);

  const fitPositions = useMemo(() => {
    const pts = [];
    if (focusNodeId) {
      const p = nodeLatLng(nodeById.get(focusNodeId));
      if (p) pts.push(p);
    }
    if (shipmentCurrent) pts.push(shipmentCurrent);
    if (shipmentDest) pts.push(shipmentDest);
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
    shipmentCurrent,
    shipmentDest,
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

          {(graph.nodes || []).map((n) => {
            const pos = nodeLatLng(n);
            if (!pos) return null;
            return (
              <CircleMarker
                key={n.id}
                center={pos}
                radius={5}
                pathOptions={{
                  color: '#1e293b',
                  fillColor: '#64748b',
                  fillOpacity: 0.85,
                  weight: 1,
                }}
              >
                <Popup>
                  <strong>{n.name || n.id}</strong>
                  <br />
                  {n.type} · {n.district}
                </Popup>
              </CircleMarker>
            );
          })}

          {vehicles.map((v) => {
            const pos = nodeLatLng(nodeById.get(v.currentNode));
            if (!pos) return null;
            const isRecovery = recoveryVehicleId && v.id === recoveryVehicleId;
            const isSelected = selectedVehicle?.id === v.id;
            return (
              <CircleMarker
                key={`v-${v.id}`}
                center={pos}
                radius={isRecovery || isSelected ? 9 : 6}
                pathOptions={{
                  color: isRecovery ? '#b45309' : '#0369a1',
                  fillColor: isRecovery ? '#f59e0b' : '#38bdf8',
                  fillOpacity: 0.95,
                  weight: 2,
                }}
              >
                <Popup>
                  <strong>{v.vehicleNumber || v.id}</strong>
                  <br />
                  {v.status}
                  {isRecovery ? ' · RECOVERY VEHICLE' : ''}
                </Popup>
              </CircleMarker>
            );
          })}

          {shipmentCurrent ? (
            <CircleMarker
              center={shipmentCurrent}
              radius={10}
              pathOptions={{
                color: '#9f1239',
                fillColor: '#e11d48',
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
