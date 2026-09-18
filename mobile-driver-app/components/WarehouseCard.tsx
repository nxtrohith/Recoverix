import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Building2, Navigation, MapPin } from 'lucide-react-native';
import { Warehouse } from '../types/navigation';
import { formatDistance } from '../utils/formatting';

interface WarehouseCardProps {
  warehouse: Warehouse;
  distanceKm: number;
  isSelected?: boolean;
  onSelect: (warehouse: Warehouse) => void;
}

export const WarehouseCard: React.FC<WarehouseCardProps> = ({
  warehouse,
  distanceKm,
  isSelected = false,
  onSelect,
}) => {
  const isRecovery = warehouse.hubType === 'RECOVERY_CENTER';

  return (
    <TouchableOpacity
      style={[
        styles.cardContainer,
        isSelected && styles.selectedCard,
        isRecovery && styles.recoveryCard,
      ]}
      onPress={() => onSelect(warehouse)}
      activeOpacity={0.75}
    >
      <View style={styles.leftCol}>
        <View
          style={[
            styles.iconBox,
            isRecovery && { backgroundColor: 'rgba(245, 158, 11, 0.15)' },
          ]}
        >
          <Building2 size={20} color={isRecovery ? '#f59e0b' : '#38bdf8'} />
        </View>

        <View style={styles.textDetails}>
          <View style={styles.headerRow}>
            <Text style={styles.title} numberOfLines={1}>
              {warehouse.name}
            </Text>
            {isRecovery && (
              <View style={styles.recoveryTag}>
                <Text style={styles.recoveryTagText}>RECOVERY</Text>
              </View>
            )}
          </View>

          <View style={styles.cityRow}>
            <MapPin size={11} color="#64748b" />
            <Text style={styles.cityText}>{warehouse.city}</Text>
            <Text style={styles.dot}>•</Text>
            <Text style={styles.capacityText}>
              {warehouse.capacityUnits ? `${warehouse.capacityUnits} units` : warehouse.id}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.rightCol}>
        <Text style={styles.distText}>{formatDistance(distanceKm)}</Text>
        <View style={[styles.selectBtn, isSelected && styles.selectedBtn]}>
          <Navigation size={12} color={isSelected ? '#0f172a' : '#38bdf8'} />
          <Text style={[styles.selectBtnText, isSelected && styles.selectedBtnText]}>
            {isSelected ? 'ACTIVE' : 'GO'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  selectedCard: {
    borderColor: '#38bdf8',
    backgroundColor: '#0c4a6e',
  },
  recoveryCard: {
    borderColor: '#f59e0b',
  },
  leftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  textDetails: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#f8fafc',
    flexShrink: 1,
  },
  recoveryTag: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: '#f59e0b',
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  recoveryTagText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#f59e0b',
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  cityText: {
    fontSize: 11,
    color: '#94a3b8',
    marginLeft: 3,
  },
  dot: {
    color: '#475569',
    marginHorizontal: 4,
  },
  capacityText: {
    fontSize: 11,
    color: '#64748b',
  },
  rightCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  distText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#38bdf8',
  },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#0f172a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  selectedBtn: {
    backgroundColor: '#38bdf8',
  },
  selectBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38bdf8',
  },
  selectedBtnText: {
    color: '#0f172a',
  },
});
