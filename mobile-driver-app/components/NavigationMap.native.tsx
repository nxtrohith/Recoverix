import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { googleMapsLightStyle } from '../config/mapStyles';
import { colors, neoShadow, radii } from '../config/theme';
import type { LatLng } from '../services/mission';

type Props = {
  position: LatLng | null;
  polyline?: LatLng[];
  pickup?: LatLng | null;
  destination?: LatLng | null;
  recoveryMode?: boolean;
  nextInstruction?: string | null;
};

/** Native navigation map — colorful Google Maps–style roadmap + nav banner. */
export function NavigationMap({
  position,
  polyline = [],
  pickup,
  destination,
  recoveryMode,
  nextInstruction,
}: Props) {
  const mapRef = useRef<MapView>(null);
  const routeColor = recoveryMode ? colors.mapRecovery : colors.mapRoute;
  const instruction =
    nextInstruction ||
    (recoveryMode ? 'Follow recovery route' : 'Continue on route');

  useEffect(() => {
    if (position && mapRef.current) {
      mapRef.current.animateCamera({
        center: position,
        zoom: 14,
        heading: 0,
        pitch: 50,
      });
    }
  }, [position?.latitude, position?.longitude]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: position?.latitude ?? 17.385,
          longitude: position?.longitude ?? 78.4867,
          latitudeDelta: 0.35,
          longitudeDelta: 0.35,
        }}
        customMapStyle={googleMapsLightStyle}
        userInterfaceStyle="light"
        showsBuildings
        showsCompass
        showsTraffic
        pitchEnabled
        rotateEnabled
      >
        {polyline.length > 1 && (
          <>
            <Polyline
              coordinates={polyline}
              strokeColor={colors.mapRouteOutline}
              strokeWidth={10}
              zIndex={1}
            />
            <Polyline
              coordinates={polyline}
              strokeColor={routeColor}
              strokeWidth={6}
              zIndex={2}
            />
          </>
        )}
        {position && (
          <Marker coordinate={position} title="You" pinColor={colors.main} />
        )}
        {pickup && (
          <Marker coordinate={pickup} title="Pickup" pinColor={colors.recovery} />
        )}
        {destination && (
          <Marker
            coordinate={destination}
            title="Destination"
            pinColor={colors.success}
          />
        )}
      </MapView>

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
    </View>
  );
}

const styles = StyleSheet.create({
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
    ...neoShadow,
    shadowOffset: { width: 3, height: 3 },
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
