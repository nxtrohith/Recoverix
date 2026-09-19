import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii } from '../config/theme';
import { getGoogleMapsKey, hasGoogleMapsKey } from '../services/directions';
import type { LatLng } from '../services/mission';

type Props = {
  position: LatLng | null;
  polyline?: LatLng[];
  pickup?: LatLng | null;
  destination?: LatLng | null;
  recoveryMode?: boolean;
  nextInstruction?: string | null;
};

/** Web navigation map — colorful Google Maps roadmap or SVG simulation. */
export function NavigationMap({
  position,
  polyline = [],
  pickup,
  destination,
  recoveryMode,
  nextInstruction,
}: Props) {
  const containerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const overlays = useRef<any[]>([]);
  const center = position || destination || pickup || { latitude: 17.385, longitude: 78.4867 };
  const routeColor = recoveryMode ? colors.mapRecovery : colors.mapRoute;

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
          zoom: 13,
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          mapTypeId: 'roadmap',
          // Default colorful Google Maps look (no dark custom styles)
          styles: [],
          gestureHandling: 'greedy',
        });
      }
      overlays.current.forEach((o) => o.setMap?.(null));
      overlays.current = [];

      if (polyline.length > 1) {
        const path = polyline.map((p) => ({ lat: p.latitude, lng: p.longitude }));
        // White casing like Google Maps navigation
        const casing = new g.Polyline({
          path,
          strokeColor: colors.mapRouteOutline,
          strokeOpacity: 1,
          strokeWeight: 10,
          map: mapRef.current,
          zIndex: 1,
        });
        const line = new g.Polyline({
          path,
          strokeColor: routeColor,
          strokeOpacity: 1,
          strokeWeight: 6,
          map: mapRef.current,
          zIndex: 2,
        });
        overlays.current.push(casing, line);
      }

      const addMarker = (
        p: LatLng | null | undefined,
        title: string,
        fill: string,
        scale = 7,
      ) => {
        if (!p) return;
        const m = new g.Marker({
          position: { lat: p.latitude, lng: p.longitude },
          map: mapRef.current,
          title,
          icon: {
            path: g.SymbolPath.CIRCLE,
            scale: title === 'You' ? 9 : scale,
            fillColor: fill,
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 3,
          },
          zIndex: title === 'You' ? 10 : 5,
        });
        overlays.current.push(m);
      };

      addMarker(position, 'You', colors.main, 9);
      addMarker(pickup, 'Pickup', colors.recovery, 8);
      addMarker(destination, 'Destination', colors.success, 8);

      if (position) {
        mapRef.current.panTo({ lat: position.latitude, lng: position.longitude });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    position,
    polyline,
    pickup,
    destination,
    recoveryMode,
    center.latitude,
    center.longitude,
    routeColor,
  ]);

  const instruction =
    nextInstruction ||
    (recoveryMode ? 'Follow recovery route' : 'Continue on route');

  if (!hasGoogleMapsKey()) {
    return (
      <View style={StyleSheet.absoluteFill}>
        <SvgSchematic
          position={position}
          polyline={polyline}
          pickup={pickup}
          destination={destination}
          recoveryMode={recoveryMode}
        />
        <NavInstructionBanner instruction={instruction} recoveryMode={recoveryMode} />
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      {React.createElement('div', {
        ref: containerRef,
        style: { width: '100%', height: '100%' },
      })}
      <NavInstructionBanner instruction={instruction} recoveryMode={recoveryMode} />
    </View>
  );
}

function NavInstructionBanner({
  instruction,
  recoveryMode,
}: {
  instruction: string;
  recoveryMode?: boolean;
}) {
  return (
    <View style={styles.navBanner} pointerEvents="none">
      <View style={[styles.navCard, recoveryMode && styles.navCardRecovery]}>
        <View style={[styles.turnGlyph, recoveryMode && styles.turnGlyphRecovery]}>
          <Text style={styles.turnArrow}>↑</Text>
        </View>
        <View style={styles.navCopy}>
          <Text style={styles.navEyebrow}>
            {recoveryMode ? 'RECOVERY NAV' : 'NAVIGATION'}
          </Text>
          <Text style={styles.navInstruction} numberOfLines={2}>
            {instruction}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** Colorful Google Maps–like schematic when no Maps API key is set. */
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
    const pad = 0.1;
    const w = Math.max(maxLng - minLng, 0.05);
    const h = Math.max(maxLat - minLat, 0.05);
    const project = (p: LatLng) => {
      const x = ((p.longitude - minLng) / w) * (100 - pad * 200) + pad * 100;
      const y = (1 - (p.latitude - minLat) / h) * (100 - pad * 200) + pad * 100;
      return { x, y, s: `${x},${y}` };
    };
    return {
      path: polyline.map((p) => project(p).s).join(' '),
      you: position ? project(position) : null,
      pickup: pickup ? project(pickup) : null,
      dest: destination ? project(destination) : null,
    };
  }, [polyline, position, pickup, destination]);

  const routeStroke = recoveryMode ? colors.mapRecovery : colors.mapRoute;

  return (
    <View style={styles.schematic}>
      {React.createElement(
        'svg',
        {
          viewBox: '0 0 100 100',
          width: '100%',
          height: '100%',
          preserveAspectRatio: 'none',
          style: { position: 'absolute', inset: 0 },
        },
        // Land base
        React.createElement('rect', {
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          fill: colors.mapLand,
        }),
        // Parks
        React.createElement('ellipse', {
          cx: 18,
          cy: 28,
          rx: 14,
          ry: 10,
          fill: colors.mapPark,
          opacity: 0.9,
        }),
        React.createElement('ellipse', {
          cx: 82,
          cy: 72,
          rx: 16,
          ry: 11,
          fill: colors.mapPark,
          opacity: 0.85,
        }),
        // Water
        React.createElement('ellipse', {
          cx: 70,
          cy: 22,
          rx: 18,
          ry: 9,
          fill: colors.mapWater,
        }),
        React.createElement('path', {
          d: 'M5,88 Q30,75 55,88 T95,85 L95,100 L5,100 Z',
          fill: colors.mapWater,
        }),
        // Building blocks
        React.createElement('rect', {
          x: 28,
          y: 40,
          width: 12,
          height: 8,
          fill: colors.mapBuilding,
          stroke: '#cfc8bc',
          strokeWidth: 0.3,
        }),
        React.createElement('rect', {
          x: 44,
          y: 52,
          width: 10,
          height: 7,
          fill: colors.mapBuilding,
          stroke: '#cfc8bc',
          strokeWidth: 0.3,
        }),
        React.createElement('rect', {
          x: 58,
          y: 38,
          width: 14,
          height: 9,
          fill: colors.mapBuilding,
          stroke: '#cfc8bc',
          strokeWidth: 0.3,
        }),
        // Grid roads (white)
        React.createElement('line', {
          x1: 0,
          y1: 35,
          x2: 100,
          y2: 38,
          stroke: colors.mapRoad,
          strokeWidth: 2.2,
        }),
        React.createElement('line', {
          x1: 0,
          y1: 58,
          x2: 100,
          y2: 55,
          stroke: colors.mapRoad,
          strokeWidth: 1.6,
        }),
        React.createElement('line', {
          x1: 32,
          y1: 0,
          x2: 36,
          y2: 100,
          stroke: colors.mapRoad,
          strokeWidth: 1.8,
        }),
        React.createElement('line', {
          x1: 62,
          y1: 0,
          x2: 58,
          y2: 100,
          stroke: colors.mapRoad,
          strokeWidth: 1.4,
        }),
        // Major highway (yellow)
        React.createElement('line', {
          x1: 0,
          y1: 48,
          x2: 100,
          y2: 50,
          stroke: colors.mapRoadMajor,
          strokeWidth: 2.8,
        }),
        // Route casing + line
        points?.path
          ? React.createElement('polyline', {
              points: points.path,
              fill: 'none',
              stroke: colors.mapRouteOutline,
              strokeWidth: '3.4',
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            })
          : null,
        points?.path
          ? React.createElement('polyline', {
              points: points.path,
              fill: 'none',
              stroke: routeStroke,
              strokeWidth: '2.2',
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            })
          : null,
        points?.pickup
          ? React.createElement('circle', {
              cx: points.pickup.x,
              cy: points.pickup.y,
              r: '2.4',
              fill: colors.recovery,
              stroke: '#fff',
              strokeWidth: '0.6',
            })
          : null,
        points?.dest
          ? React.createElement('circle', {
              cx: points.dest.x,
              cy: points.dest.y,
              r: '2.4',
              fill: colors.success,
              stroke: '#fff',
              strokeWidth: '0.6',
            })
          : null,
        points?.you
          ? React.createElement(
              'g',
              null,
              React.createElement('circle', {
                cx: points.you.x,
                cy: points.you.y,
                r: '3.2',
                fill: colors.main,
                stroke: '#fff',
                strokeWidth: '0.8',
              }),
              React.createElement('circle', {
                cx: points.you.x,
                cy: points.you.y,
                r: '5.5',
                fill: 'none',
                stroke: colors.main,
                strokeWidth: '0.5',
                opacity: 0.35,
              }),
            )
          : null,
      )}
      <View style={styles.mapBadge}>
        <Text style={styles.mapBadgeText}>
          {recoveryMode ? 'Recovery · Maps simulation' : 'Maps simulation'}
        </Text>
      </View>
      {!points && (
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
    backgroundColor: colors.mapLand,
    overflow: 'hidden',
  },
  schematicEmpty: {
    color: colors.textMuted,
    marginTop: 80,
    textAlign: 'center',
    fontWeight: '700',
  },
  mapBadge: {
    position: 'absolute',
    bottom: 300,
    left: 12,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    shadowColor: colors.black,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  mapBadgeText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.4,
  },
  navBanner: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    zIndex: 20,
  },
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.main,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 6,
    paddingHorizontal: 8,
    shadowColor: colors.black,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  navCardRecovery: {
    backgroundColor: colors.recovery,
  },
  turnGlyph: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  turnGlyphRecovery: {
    backgroundColor: colors.warning,
  },
  turnArrow: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.black,
  },
  navCopy: { flex: 1, gap: 1 },
  navEyebrow: {
    color: colors.black,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  navInstruction: {
    color: colors.black,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 17,
  },
});

export default NavigationMap;
