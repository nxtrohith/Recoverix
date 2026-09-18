import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Building2, AlertTriangle, Flag } from 'lucide-react-native';
import { Warehouse } from '../types/navigation';

interface WarehouseMarkerProps {
  warehouse: Warehouse;
  isDestination?: boolean;
  isRecovery?: boolean;
  isSelected?: boolean;
  onPress?: (warehouse: Warehouse) => void;
}

export const WarehouseMarker: React.FC<WarehouseMarkerProps> = ({
  warehouse,
  isDestination = false,
  isRecovery = false,
  isSelected = false,
  onPress,
}) => {
  let bgColor = '#FFFFFF';
  let borderColor = '#E5E7EB';
  let textColor = '#111827';
  let iconColor = '#4B5563';

  if (isRecovery) {
    bgColor = '#FFFBEB';
    borderColor = '#FDE68A';
    textColor = '#B45309';
    iconColor = '#B45309';
  } else if (isDestination || isSelected) {
    bgColor = '#111827';
    borderColor = '#111827';
    textColor = '#FFFFFF';
    iconColor = '#FFFFFF';
  }

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onPress?.(warehouse)}
      style={styles.wrapper}
    >
      {/* Label pill */}
      <View style={[styles.pill, { backgroundColor: bgColor, borderColor }]}>
        {isRecovery ? (
          <AlertTriangle size={11} color={iconColor} style={styles.icon} />
        ) : isDestination ? (
          <Flag size={11} color={iconColor} style={styles.icon} />
        ) : (
          <Building2 size={11} color={iconColor} style={styles.icon} />
        )}
        <Text style={[styles.title, { color: textColor }]}>
          {warehouse.city || warehouse.name}
        </Text>
      </View>

      {/* Pin stem and dot */}
      <View style={[styles.pinDot, { backgroundColor: borderColor === '#E5E7EB' ? '#9CA3AF' : borderColor }]} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9999,
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  icon: {
    marginRight: 4,
  },
  title: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  pinDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 2,
  },
});
