import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Navigation } from 'lucide-react-native';
import { LocationCoordinate } from '../types/navigation';

interface DriverMarkerProps {
  location: LocationCoordinate;
  truckId?: string;
  isSimulating?: boolean;
}

export const DriverMarker: React.FC<DriverMarkerProps> = ({
  location,
  truckId = 'TRK-218',
  isSimulating = false,
}) => {
  const heading = location.heading ?? 0;

  return (
    <View style={styles.container}>
      {/* Truck ID Pill */}
      <View style={[styles.idBadge, isSimulating && styles.simBadge]}>
        <Text style={styles.idText}>{truckId}</Text>
        {isSimulating && <Text style={styles.simText}>SIM</Text>}
      </View>

      {/* Radar pulse outer ring */}
      <View style={styles.pulseRing} />

      {/* Rotating tactical compass marker */}
      <View
        style={[
          styles.markerCore,
          {
            transform: [{ rotate: `${heading}deg` }],
          },
        ]}
      >
        <Navigation size={18} color="#ffffff" fill="#38bdf8" />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  idBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderColor: '#38bdf8',
    borderWidth: 1.5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    elevation: 4,
  },
  simBadge: {
    borderColor: '#f59e0b',
  },
  idText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  simText: {
    color: '#f59e0b',
    fontSize: 8,
    fontWeight: '800',
    marginLeft: 3,
  },
  pulseRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(56, 189, 248, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.45)',
  },
  markerCore: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0284c7',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 6,
  },
});
