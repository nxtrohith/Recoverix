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
        <Navigation size={16} color="#FFFFFF" fill="#FFFFFF" />
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
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
    marginBottom: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  simBadge: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  idText: {
    color: '#111827',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  simText: {
    color: '#B45309',
    fontSize: 8.5,
    fontWeight: '800',
    marginLeft: 3,
  },
  pulseRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(17, 24, 39, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(17, 24, 39, 0.12)',
  },
  markerCore: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#111827',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
});
