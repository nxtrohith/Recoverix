import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity, Text } from 'react-native';
import { Crosshair, Plus, Minus, Compass, Navigation as NavIcon, Volume2, VolumeX, CornerUpRight } from 'lucide-react-native';
import { LocationCoordinate, Warehouse, Route, RecoveryAssignment, NavigationManeuver } from '../types/navigation';
import { DriverMarker } from './DriverMarker';
import { WarehouseMarker } from './WarehouseMarker';

interface MapViewProps {
  driverLocation: LocationCoordinate;
  warehouses: Warehouse[];
  selectedWarehouse: Warehouse | null;
  destinationWarehouse: Warehouse | null;
  recoveryWarehouse: Warehouse | null;
  activeRoute: Route | null;
  recoveryAssignment: RecoveryAssignment | null;
  isSimulating: boolean;
  isNavigatorMode?: boolean;
  currentManeuver?: NavigationManeuver | null;
  isVoiceMuted?: boolean;
  onSelectWarehouse: (w: Warehouse) => void;
  onRecenter?: () => void;
  onToggleNavigatorMode?: () => void;
  onToggleVoiceMute?: () => void;
}

// ── Web Fallback Interactive Tactical Map ──────────────────────────────────────
// Used when testing in web browsers, ensuring smooth rendering without native bridge crashes.
const WebTacticalMap: React.FC<MapViewProps> = ({
  driverLocation,
  warehouses,
  selectedWarehouse,
  destinationWarehouse,
  recoveryWarehouse,
  activeRoute,
  recoveryAssignment,
  isSimulating,
  isNavigatorMode = false,
  currentManeuver,
  isVoiceMuted = false,
  onSelectWarehouse,
  onRecenter,
  onToggleNavigatorMode,
  onToggleVoiceMute,
}) => {
  const [zoom, setZoom] = React.useState(1.0);
  const [centerOffset, setCenterOffset] = React.useState({ x: 0, y: 0 });

  // Map geographic bounds for Telangana:
  // Lat: ~16.5 to 19.0, Lon: ~77.5 to 81.0
  const MIN_LAT = 16.5;
  const MAX_LAT = 19.0;
  const MIN_LON = 77.4;
  const MAX_LON = 80.6;

  // Convert lat/lng to percentage in container (width 100%, height 100%)
  const toMapCoords = (lat: number, lon: number) => {
    const x = ((lon - MIN_LON) / (MAX_LON - MIN_LON)) * 100;
    const y = ((MAX_LAT - lat) / (MAX_LAT - MIN_LAT)) * 100;
    return { x, y };
  };

  const driverCoords = toMapCoords(driverLocation.latitude, driverLocation.longitude);

  // In Navigator Follow Mode: camera smoothly centers on vehicle and rotates with heading
  const currentZoom = isNavigatorMode ? 1.55 : zoom;
  const panX = isNavigatorMode ? 50 - driverCoords.x : centerOffset.x;
  const panY = isNavigatorMode ? 60 - driverCoords.y : centerOffset.y;
  const mapRotation = isNavigatorMode ? -(driverLocation.heading ?? 0) : 0;

  const handleRecenter = () => {
    setZoom(1.15);
    setCenterOffset({ x: 0, y: 0 });
    onRecenter?.();
  };

  return (
    <View style={styles.webContainer}>
      {/* Tactical Grid Background */}
      <View style={styles.gridOverlay} />

      {/* Navigator Mode Active Banner */}
      {isNavigatorMode && (
        <View style={styles.navigatorPill}>
          <Compass size={12} color="#10b981" />
          <Text style={styles.navigatorPillText}>NAVIGATOR FOLLOW · 3D HEADS-UP</Text>
        </View>
      )}

      {/* Map Content Layer with Zoom, Pan & Heading Rotation */}
      <View
        style={[
          styles.mapLayer,
          {
            transform: [
              { scale: currentZoom },
              { translateX: panX },
              { translateY: panY },
              { rotate: `${mapRotation}deg` },
            ],
          },
        ]}
      >
        {/* Render Route Polyline using SVG-like lines */}
        {activeRoute && activeRoute.waypoints.length > 1 && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {activeRoute.waypoints.slice(0, -1).map((wp, idx) => {
              const nextWp = activeRoute.waypoints[idx + 1];
              const p1 = toMapCoords(wp.latitude, wp.longitude);
              const p2 = toMapCoords(nextWp.latitude, nextWp.longitude);

              // Calculate line segment length and angle
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const length = Math.sqrt(dx * dx + dy * dy);
              const angle = Math.atan2(dy, dx) * (180 / Math.PI);

              const isRecoveryLeg =
                recoveryAssignment &&
                recoveryAssignment.status !== 'DELIVERED' &&
                recoveryAssignment.status !== 'PENDING';

              const strokeColor = isRecoveryLeg ? '#f59e0b' : '#38bdf8';

              return (
                <View
                  key={`seg-${idx}`}
                  style={{
                    position: 'absolute',
                    left: `${p1.x}%`,
                    top: `${p1.y}%`,
                    width: `${length}%`,
                    height: 3.5,
                    backgroundColor: strokeColor,
                    transformOrigin: '0% 50%',
                    transform: [{ rotate: `${angle}deg` }],
                    borderRadius: 2,
                    shadowColor: strokeColor,
                    shadowOpacity: 0.8,
                    shadowRadius: 4,
                  }}
                />
              );
            })}
          </View>
        )}

        {/* Maneuver Turn Marker */}
        {currentManeuver && currentManeuver.coordinate && (
          (() => {
            const mCoord = toMapCoords(currentManeuver.coordinate.latitude, currentManeuver.coordinate.longitude);
            return (
              <View
                style={{
                  position: 'absolute',
                  left: `${mCoord.x}%`,
                  top: `${mCoord.y}%`,
                  marginLeft: -16,
                  marginTop: -16,
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: '#0284c7',
                  borderWidth: 2,
                  borderColor: '#ffffff',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 40,
                  shadowColor: '#0284c7',
                  shadowOpacity: 0.8,
                  shadowRadius: 6,
                }}
              >
                <CornerUpRight size={18} color="#ffffff" />
              </View>
            );
          })()
        )}

        {/* Warehouses Pins */}
        {warehouses.map((w) => {
          const coords = toMapCoords(w.latitude, w.longitude);
          const isDest = destinationWarehouse?.id === w.id;
          const isRec = recoveryWarehouse?.id === w.id;
          const isSel = selectedWarehouse?.id === w.id;

          return (
            <View
              key={w.id}
              style={{
                position: 'absolute',
                left: `${coords.x}%`,
                top: `${coords.y}%`,
                transform: [{ translateX: -16 }, { translateY: -16 }],
                zIndex: isDest || isRec ? 30 : 10,
              }}
            >
              <WarehouseMarker
                warehouse={w}
                isDestination={isDest}
                isRecovery={isRec}
                isSelected={isSel}
                onPress={() => onSelectWarehouse(w)}
              />
            </View>
          );
        })}

        {/* Driver Truck Marker */}
        <View
          style={{
            position: 'absolute',
            left: `${driverCoords.x}%`,
            top: `${driverCoords.y}%`,
            transform: [{ translateX: -20 }, { translateY: -20 }],
            zIndex: 50,
          }}
        >
          <DriverMarker
            location={driverLocation}
            isSimulating={isSimulating}
          />
        </View>
      </View>

      {/* Tactical Map Controls */}
      <View style={styles.floatingControls}>
        <TouchableOpacity
          style={[styles.controlBtn, isNavigatorMode && styles.navigatorBtnActive]}
          onPress={onToggleNavigatorMode}
          accessibilityLabel="Toggle Navigator Follow Mode"
        >
          <Compass size={18} color={isNavigatorMode ? '#10b981' : '#94a3b8'} />
        </TouchableOpacity>

        {onToggleVoiceMute && (
          <TouchableOpacity
            style={[styles.controlBtn, isVoiceMuted && styles.voiceMutedBtn]}
            onPress={onToggleVoiceMute}
            accessibilityLabel="Toggle Voice Guidance"
          >
            {isVoiceMuted ? (
              <VolumeX size={18} color="#f87171" />
            ) : (
              <Volume2 size={18} color="#10b981" />
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.controlBtn}
          onPress={() => setZoom((z) => Math.min(2.5, z + 0.25))}
          accessibilityLabel="Zoom In"
        >
          <Plus size={18} color="#f8fafc" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlBtn}
          onPress={() => setZoom((z) => Math.max(0.75, z - 0.25))}
          accessibilityLabel="Zoom Out"
        >
          <Minus size={18} color="#f8fafc" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlBtn, styles.recenterBtn]}
          onPress={handleRecenter}
          accessibilityLabel="Re-center on Driver"
        >
          <Crosshair size={18} color="#38bdf8" />
        </TouchableOpacity>
      </View>

      {/* Coordinates readout */}
      <View style={styles.coordsFooter}>
        <Text style={styles.coordsText}>
          {driverLocation.latitude.toFixed(4)}°N, {driverLocation.longitude.toFixed(4)}°E
        </Text>
      </View>
    </View>
  );
};

// ── Native Map Container ───────────────────────────────────────────────────────
export const MapView: React.FC<MapViewProps> = (props) => {
  if (Platform.OS === 'web') {
    return <WebTacticalMap {...props} />;
  }

  // On Native iOS / Android:
  // Dynamically load react-native-maps to avoid bundler issues in non-native runtimes
  const NativeMaps = require('react-native-maps');
  const RNMapView = NativeMaps.default;
  const { Marker, Polyline } = NativeMaps;
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (mapRef.current && props.driverLocation) {
      if (props.isNavigatorMode) {
        mapRef.current.animateCamera(
          {
            center: {
              latitude: props.driverLocation.latitude,
              longitude: props.driverLocation.longitude,
            },
            pitch: 52,
            heading: props.driverLocation.heading ?? 0,
            zoom: 16.5,
          },
          { duration: 400 }
        );
      } else {
        mapRef.current.animateToRegion(
          {
            latitude: props.driverLocation.latitude,
            longitude: props.driverLocation.longitude,
            latitudeDelta: 0.12,
            longitudeDelta: 0.12,
          },
          400
        );
      }
    }
  }, [props.driverLocation, props.isNavigatorMode]);

  return (
    <View style={styles.nativeContainer}>
      <RNMapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: props.driverLocation.latitude || 17.385,
          longitude: props.driverLocation.longitude || 78.4867,
          latitudeDelta: 1.8,
          longitudeDelta: 1.8,
        }}
        customMapStyle={DARK_TACTICAL_MAP_STYLE}
        showsCompass={false}
        showsUserLocation={false}
      >
        {/* Route Polyline */}
        {props.activeRoute && (
          <Polyline
            coordinates={props.activeRoute.waypoints}
            strokeColor={
              props.recoveryAssignment &&
              props.recoveryAssignment.status !== 'DELIVERED' &&
              props.recoveryAssignment.status !== 'PENDING'
                ? '#f59e0b'
                : '#38bdf8'
            }
            strokeWidth={4}
          />
        )}

        {/* Warehouses */}
        {props.warehouses.map((w) => (
          <Marker
            key={w.id}
            coordinate={{ latitude: w.latitude, longitude: w.longitude }}
            onPress={() => props.onSelectWarehouse(w)}
          >
            <WarehouseMarker
              warehouse={w}
              isDestination={props.destinationWarehouse?.id === w.id}
              isRecovery={props.recoveryWarehouse?.id === w.id}
              isSelected={props.selectedWarehouse?.id === w.id}
            />
          </Marker>
        ))}

        {/* Maneuver Turn Marker */}
        {props.currentManeuver && props.currentManeuver.coordinate && (
          <Marker
            coordinate={{
              latitude: props.currentManeuver.coordinate.latitude,
              longitude: props.currentManeuver.coordinate.longitude,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: '#0284c7',
                borderWidth: 2,
                borderColor: '#ffffff',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#0284c7',
                shadowOpacity: 0.8,
                shadowRadius: 6,
              }}
            >
              <CornerUpRight size={18} color="#ffffff" />
            </View>
          </Marker>
        )}

        {/* Driver Marker */}
        <Marker
          coordinate={{
            latitude: props.driverLocation.latitude,
            longitude: props.driverLocation.longitude,
          }}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <DriverMarker
            location={props.driverLocation}
            isSimulating={props.isSimulating}
          />
        </Marker>
      </RNMapView>

      {/* Floating Tactical Controls */}
      <View style={styles.floatingControls}>
        <TouchableOpacity
          style={[styles.controlBtn, props.isNavigatorMode && styles.navigatorBtnActive]}
          onPress={props.onToggleNavigatorMode}
          accessibilityLabel="Toggle Navigator Follow Mode"
        >
          <Compass size={18} color={props.isNavigatorMode ? '#10b981' : '#94a3b8'} />
        </TouchableOpacity>

        {props.onToggleVoiceMute && (
          <TouchableOpacity
            style={[styles.controlBtn, props.isVoiceMuted && styles.voiceMutedBtn]}
            onPress={props.onToggleVoiceMute}
            accessibilityLabel="Toggle Voice Guidance"
          >
            {props.isVoiceMuted ? (
              <VolumeX size={18} color="#f87171" />
            ) : (
              <Volume2 size={18} color="#10b981" />
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.controlBtn, styles.recenterBtn]}
          onPress={() => {
            if (mapRef.current) {
              mapRef.current.animateToRegion({
                latitude: props.driverLocation.latitude,
                longitude: props.driverLocation.longitude,
                latitudeDelta: 0.08,
                longitudeDelta: 0.08,
              });
            }
            props.onRecenter?.();
          }}
        >
          <Crosshair size={18} color="#38bdf8" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

// Tactical dark map styling for Native Google Maps
const DARK_TACTICAL_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1e293b' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#020617' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
];

const styles = StyleSheet.create({
  nativeContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  webContainer: {
    flex: 1,
    backgroundColor: '#090d16',
    overflow: 'hidden',
    position: 'relative',
  },
  gridOverlay: {
    ...StyleSheet.absoluteFill,
    opacity: 0.08,
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  mapLayer: {
    flex: 1,
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  floatingControls: {
    position: 'absolute',
    right: 16,
    top: 76,
    zIndex: 50,
    gap: 8,
  },
  controlBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.90)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 5,
  },
  recenterBtn: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  navigatorBtnActive: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
  },
  voiceMutedBtn: {
    borderColor: '#f87171',
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
  },
  navigatorPill: {
    position: 'absolute',
    top: 76,
    left: 16,
    zIndex: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#10b981',
  },
  navigatorPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10b981',
    letterSpacing: 0.5,
  },
  coordsFooter: {
    position: 'absolute',
    left: 16,
    top: 76,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
  },
  coordsText: {
    fontSize: 10,
    color: '#94a3b8',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
