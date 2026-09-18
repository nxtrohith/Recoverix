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
            isRecovery && { backgroundColor: '#FFFBEB', borderColor: '#FEF3C7' },
          ]}
        >
          <Building2 size={18} color={isRecovery ? '#B45309' : '#111827'} />
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
            <MapPin size={12} color="#6B7280" />
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
          <Navigation size={11} color={isSelected ? '#FFFFFF' : '#111827'} />
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
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1,
  },
  selectedCard: {
    borderColor: '#111827',
    borderWidth: 1.5,
  },
  recoveryCard: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFEFA',
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
    borderRadius: 9999,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
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
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    flexShrink: 1,
    letterSpacing: -0.1,
  },
  recoveryTag: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FEF3C7',
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  recoveryTagText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.3,
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  cityText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 3,
    fontWeight: '500',
  },
  dot: {
    color: '#D1D5DB',
    marginHorizontal: 5,
  },
  capacityText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  rightCol: {
    alignItems: 'flex-end',
    gap: 6,
  },
  distText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.1,
  },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  selectedBtn: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  selectBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: 0.2,
  },
  selectedBtnText: {
    color: '#FFFFFF',
  },
});
