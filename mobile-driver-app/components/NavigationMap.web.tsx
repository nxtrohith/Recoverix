import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../config/theme';
import { getGoogleMapsKey, hasGoogleMapsKey } from '../services/directions';
import type { LatLng } from '../services/mission';

type Props = {
  position: LatLng | null;
  polyline?: LatLng[];
  pickup?: LatLng | null;
  destination?: LatLng | null;
  recoveryMode?: boolean;
};

/** Web navigation map — Google Maps JS or SVG schematic fallback. */
export function NavigationMap({
  position,
  polyline = [],
  pickup,
  destination,
  recoveryMode,
}: Props) {
  const containerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const overlays = useRef<any[]>([]);
  const center = position || destination || pickup || { latitude: 17.385, longitude: 78.4867 };

  useEffect(() => {
    if (!hasGoogleMapsKey()) return;
    let cancelled = false;

    (async () => {
      await loadGoogleMaps(getGoogleMapsKey());
      if (cancelled || !containerRef.current || !(window as any).google) return;
      const g = (window as any).google.maps;
      if (!mapRef.current) {
        mapRef.current = new g.Map(containerRef.current, {
          center: { lat: center.latitude, lng: center.longitude },
          zoom: 10,
          disableDefaultUI: true,
          zoomControl: true,
          styles: darkGoogleStyles,
        });
      }
      overlays.current.forEach((o) => o.setMap?.(null));
      overlays.current = [];

      if (polyline.length > 1) {
        const line = new g.Polyline({
          path: polyline.map((p) => ({ lat: p.latitude, lng: p.longitude })),
          strokeColor: recoveryMode ? colors.mapRecovery : colors.mapRoute,
          strokeWeight: 5,
          map: mapRef.current,
        });
        overlays.current.push(line);
      }
      const addMarker = (p: LatLng | null | undefined, title: string, color: string) => {
        if (!p) return;
        const m = new g.Marker({
          position: { lat: p.latitude, lng: p.longitude },
          map: mapRef.current,
          title,
          icon: {
            path: g.SymbolPath.CIRCLE,
            scale: title === 'You' ? 8 : 7,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
          },
        });
        overlays.current.push(m);
      };
      addMarker(position, 'You', colors.accent);
      addMarker(pickup, 'Pickup', colors.recovery);
      addMarker(destination, 'Destination', colors.success);
      if (position) {
        mapRef.current.panTo({ lat: position.latitude, lng: position.longitude });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [position, polyline, pickup, destination, recoveryMode, center.latitude, center.longitude]);

  if (!hasGoogleMapsKey()) {
    return (
      <SvgSchematic
        position={position}
        polyline={polyline}
        pickup={pickup}
        destination={destination}
        recoveryMode={recoveryMode}
      />
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      {React.createElement('div', {
        ref: containerRef,
        style: { width: '100%', height: '100%' },
      })}
    </View>
  );
}

function SvgSchematic({
  position,
  polyline = [],
  pickup,
  destination,
  recoveryMode,
}: Props) {
  const points = useMemo(() => {
    const all = [
      ...polyline,
      ...(position ? [position] : []),
      ...(pickup ? [pickup] : []),
      ...(destination ? [destination] : []),
    ];
    if (!all.length) return null;
    const lats = all.map((p) => p.latitude);
    const lngs = all.map((p) => p.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const pad = 0.08;
    const w = Math.max(maxLng - minLng, 0.05);
    const h = Math.max(maxLat - minLat, 0.05);
    const project = (p: LatLng) => {
      const x = ((p.longitude - minLng) / w) * (100 - pad * 200) + pad * 100;
      const y = (1 - (p.latitude - minLat) / h) * (100 - pad * 200) + pad * 100;
      return `${x},${y}`;
    };
    return {
      path: polyline.map(project).join(' '),
      you: position ? project(position) : null,
      pickup: pickup ? project(pickup) : null,
      dest: destination ? project(destination) : null,
    };
  }, [polyline, position, pickup, destination]);

  return (
    <View style={[styles.schematic, recoveryMode && styles.schematicRecovery]}>
      <Text style={styles.schematicLabel}>
        {recoveryMode ? 'RECOVERY ROUTE' : 'ACTIVE ROUTE'} · graph fallback
      </Text>
      {points ? (
        React.createElement(
          'svg',
          { viewBox: '0 0 100 100', width: '100%', height: '100%', preserveAspectRatio: 'none' },
          points.path
            ? React.createElement('polyline', {
                points: points.path,
                fill: 'none',
                stroke: recoveryMode ? colors.mapRecovery : colors.mapRoute,
                strokeWidth: '1.8',
              })
            : null,
          points.pickup
            ? React.createElement('circle', {
                cx: points.pickup.split(',')[0],
                cy: points.pickup.split(',')[1],
                r: '2.2',
                fill: colors.recovery,
              })
            : null,
          points.dest
            ? React.createElement('circle', {
                cx: points.dest.split(',')[0],
                cy: points.dest.split(',')[1],
                r: '2.2',
                fill: colors.success,
              })
            : null,
          points.you
            ? React.createElement('circle', {
                cx: points.you.split(',')[0],
                cy: points.you.split(',')[1],
                r: '2.6',
                fill: colors.accent,
              })
            : null,
        )
      ) : (
        <Text style={styles.schematicEmpty}>Waiting for route…</Text>
      )}
    </View>
  );
}

function loadGoogleMaps(key: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as any).google?.maps) return Promise.resolve();
  const existing = document.getElementById('google-maps-js');
  if (existing) {
    return new Promise((resolve) => {
      existing.addEventListener('load', () => resolve());
      if ((window as any).google?.maps) resolve();
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = 'google-maps-js';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Maps failed to load'));
    document.head.appendChild(script);
  });
}

const styles = StyleSheet.create({
  schematic: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0E1628',
    padding: 12,
  },
  schematicRecovery: {
    backgroundColor: '#1A100C',
  },
  schematicLabel: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 8,
  },
  schematicEmpty: {
    color: colors.textMuted,
    marginTop: 40,
    textAlign: 'center',
  },
});

const darkGoogleStyles = [
  { elementType: 'geometry', stylers: [{ color: '#0E1628' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9AA8C0' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#243049' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0B1220' }] },
];

export default NavigationMap;
