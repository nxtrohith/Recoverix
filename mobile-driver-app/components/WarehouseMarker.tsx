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
  let bgColor = '#1e293b';
  let borderColor = '#64748b';
  let textColor = '#cbd5e1';

  if (isRecovery) {
    bgColor = '#78350f';
    borderColor = '#f59e0b';
    textColor = '#fef3c7';
  } else if (isDestination) {
    bgColor = '#064e3b';
    borderColor = '#10b981';
    textColor = '#d1fae5';
  } else if (isSelected) {
    bgColor = '#0c4a6e';
    borderColor = '#38bdf8';
    textColor = '#e0f2fe';
  }

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onPress?.(warehouse)}
      style={styles.wrapper}
    >
      {/* Label bubble */}
      <View style={[styles.pill, { backgroundColor: bgColor, borderColor }]}>
        {isRecovery ? (
          <AlertTriangle size={11} color="#f59e0b" style={styles.icon} />
        ) : isDestination ? (
          <Flag size={11} color="#10b981" style={styles.icon} />
        ) : (
          <Building2 size={11} color="#94a3b8" style={styles.icon} />
        )}
        <Text style={[styles.title, { color: textColor }]}>
          {warehouse.city || warehouse.name}
        </Text>
      </View>

      {/* Pin stem and dot */}
      <View style={[styles.pinDot, { backgroundColor: borderColor }]} />
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
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 3,
    elevation: 4,
  },
  icon: {
    marginRight: 4,
  },
  title: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  pinDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 2,
  },
});
