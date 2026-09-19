import React, { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { colors } from '../config/theme';
import type { LatLng } from '../services/mission';

type Props = {
  position: LatLng | null;
  polyline?: LatLng[];
  pickup?: LatLng | null;
  destination?: LatLng | null;
  recoveryMode?: boolean;
};

/** Native navigation map (iOS / Android). */
export function NavigationMap({
  position,
  polyline = [],
  pickup,
  destination,
  recoveryMode,
}: Props) {
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (position && mapRef.current) {
      mapRef.current.animateCamera({
        center: position,
        zoom: 12,
        heading: 0,
        pitch: 45,
      });
    }
  }, [position?.latitude, position?.longitude]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      initialRegion={{
        latitude: position?.latitude ?? 17.385,
        longitude: position?.longitude ?? 78.4867,
        latitudeDelta: 1.2,
        longitudeDelta: 1.2,
      }}
      customMapStyle={darkMapStyle}
    >
      {polyline.length > 1 && (
        <Polyline
          coordinates={polyline}
          strokeColor={recoveryMode ? colors.mapRecovery : colors.mapRoute}
          strokeWidth={5}
        />
      )}
      {position && <Marker coordinate={position} title="You" pinColor={colors.accent} />}
      {pickup && <Marker coordinate={pickup} title="Pickup" pinColor={colors.recovery} />}
      {destination && (
        <Marker coordinate={destination} title="Destination" pinColor={colors.success} />
      )}
    </MapView>
  );
}

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#0E1628' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9AA8C0' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#243049' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0B1220' }] },
];

export default NavigationMap;
