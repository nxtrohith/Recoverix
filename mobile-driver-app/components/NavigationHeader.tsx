import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Truck, ShieldAlert, Radio, List } from 'lucide-react-native';
import { DriverProfile } from '../types/navigation';
import { COLORS } from '../config/theme';

interface NavigationHeaderProps {
  driver: DriverProfile;
  isSimulating: boolean;
  hasActiveRecovery: boolean;
  onTriggerRecovery: () => void;
  onOpenWarehouseList: () => void;
  onToggleSimulation: () => void;
}

export const NavigationHeader: React.FC<NavigationHeaderProps> = ({
  driver,
  isSimulating,
  hasActiveRecovery,
  onTriggerRecovery,
  onOpenWarehouseList,
  onToggleSimulation,
}) => {
  return (
    <View style={styles.headerContainer}>
      {/* Driver & Truck Badge */}
      <View style={styles.driverInfo}>
        <View style={styles.truckIconBox}>
          <Truck size={16} color={COLORS.textPrimary} />
        </View>
        <View>
          <Text style={styles.truckId}>{driver.truckId}</Text>
          <Text style={styles.driverName}>{driver.name}</Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionGroup}>
        {/* GPS vs SIM Mode Toggle */}
        <TouchableOpacity
          style={[styles.badgeBtn, isSimulating ? styles.simBadge : styles.gpsBadge]}
          onPress={onToggleSimulation}
          activeOpacity={0.7}
        >
          <Radio size={12} color={isSimulating ? COLORS.warning : COLORS.success} />
          <Text style={[styles.badgeText, { color: isSimulating ? COLORS.warning : COLORS.success }]}>
            {isSimulating ? 'SIM' : 'GPS'}
          </Text>
        </TouchableOpacity>

        {/* Warehouses List Button */}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onOpenWarehouseList}
          activeOpacity={0.7}
          accessibilityLabel="Warehouses"
        >
          <List size={16} color={COLORS.textPrimary} />
        </TouchableOpacity>

        {/* Urgent Recovery Trigger Button */}
        <TouchableOpacity
          style={[styles.recoveryTriggerBtn, hasActiveRecovery && styles.recoveryActiveBtn]}
          onPress={onTriggerRecovery}
          activeOpacity={0.8}
        >
          <ShieldAlert size={14} color={hasActiveRecovery ? '#FFFFFF' : COLORS.error} />
          <Text style={[styles.recoveryBtnText, hasActiveRecovery && styles.recoveryActiveBtnText]}>
            RECOVERY
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    position: 'absolute',
    top: 14,
    left: 16,
    right: 16,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  truckIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9999,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  truckId: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.1,
  },
  driverName: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
    borderWidth: 1,
  },
  gpsBadge: {
    backgroundColor: '#F0FDF4',
    borderColor: '#DCFCE7',
  },
  simBadge: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FEF3C7',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 9999,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  recoveryTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  recoveryActiveBtn: {
    backgroundColor: '#B91C1C',
    borderColor: '#B91C1C',
  },
  recoveryBtnText: {
    color: '#B91C1C',
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  recoveryActiveBtnText: {
    color: '#FFFFFF',
  },
});
