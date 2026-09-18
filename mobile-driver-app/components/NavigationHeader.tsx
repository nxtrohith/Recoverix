import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Truck, ShieldAlert, Radio, List } from 'lucide-react-native';
import { DriverProfile } from '../types/navigation';

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
          <Truck size={18} color="#38bdf8" />
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
          <Radio size={12} color={isSimulating ? '#f59e0b' : '#10b981'} />
          <Text style={[styles.badgeText, { color: isSimulating ? '#f59e0b' : '#10b981' }]}>
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
          <List size={16} color="#94a3b8" />
        </TouchableOpacity>

        {/* Urgent Recovery Trigger Button */}
        <TouchableOpacity
          style={[styles.recoveryTriggerBtn, hasActiveRecovery && styles.recoveryActiveBtn]}
          onPress={onTriggerRecovery}
          activeOpacity={0.8}
        >
          <ShieldAlert size={14} color="#ffffff" />
          <Text style={styles.recoveryBtnText}>RECOVERY</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    position: 'absolute',
    top: 12,
    left: 14,
    right: 14,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.28)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 8,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  truckIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#0c4a6e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  truckId: {
    fontSize: 14,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: 0.6,
  },
  driverName: {
    fontSize: 11,
    color: '#94a3b8',
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
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  gpsBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: '#10b981',
  },
  simBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: '#f59e0b',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  recoveryTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#dc2626',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    shadowColor: '#dc2626',
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  recoveryActiveBtn: {
    backgroundColor: '#d97706',
    shadowColor: '#d97706',
  },
  recoveryBtnText: {
    color: '#ffffff',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
});
