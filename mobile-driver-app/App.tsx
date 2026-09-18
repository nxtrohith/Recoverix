import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Map, Navigation as NavIcon, ShieldAlert, Building2, Settings as SettingsIcon } from 'lucide-react-native';
import { NavigationProvider, useNavigationContext } from './context/NavigationContext';
import { COLORS } from './config/theme';

import IndexScreen from './app/index';
import NavigationScreen from './app/navigation';
import RecoveryScreen from './app/recovery';
import WarehouseScreen from './app/warehouse';
import SettingsScreen from './app/settings';

type ScreenKey = 'cockpit' | 'navigation' | 'recovery' | 'warehouses' | 'settings';

function MainAppShell() {
  const [activeTab, setActiveTab] = useState<ScreenKey>('cockpit');
  const { mode } = useNavigationContext();

  const isRecoveryActive =
    mode === 'RECOVERY_ALERT' ||
    mode === 'RECOVERY_LEG_1' ||
    mode === 'AT_RECOVERY' ||
    mode === 'RECOVERY_LEG_2';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />

      {/* Screen Content Container */}
      <View style={styles.contentContainer}>
        {activeTab === 'cockpit' && <IndexScreen />}
        {activeTab === 'navigation' && <NavigationScreen />}
        {activeTab === 'recovery' && <RecoveryScreen />}
        {activeTab === 'warehouses' && <WarehouseScreen />}
        {activeTab === 'settings' && <SettingsScreen />}
      </View>

      {/* Civic-Tech Bottom Navigation Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'cockpit' && styles.tabItemActive]}
          onPress={() => setActiveTab('cockpit')}
          activeOpacity={0.8}
        >
          <Map size={16} color={activeTab === 'cockpit' ? '#FFFFFF' : '#6B7280'} />
          <Text style={[styles.tabLabel, activeTab === 'cockpit' && styles.tabLabelActive]}>
            Cockpit
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'navigation' && styles.tabItemActive]}
          onPress={() => setActiveTab('navigation')}
          activeOpacity={0.8}
        >
          <NavIcon size={16} color={activeTab === 'navigation' ? '#FFFFFF' : '#6B7280'} />
          <Text style={[styles.tabLabel, activeTab === 'navigation' && styles.tabLabelActive]}>
            Navigation
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === 'recovery' && styles.tabItemActive,
            isRecoveryActive && activeTab !== 'recovery' && styles.tabItemRecoveryAlert,
          ]}
          onPress={() => setActiveTab('recovery')}
          activeOpacity={0.8}
        >
          <ShieldAlert
            size={16}
            color={
              activeTab === 'recovery'
                ? '#FFFFFF'
                : isRecoveryActive
                ? '#B91C1C'
                : '#6B7280'
            }
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'recovery' && styles.tabLabelActive,
              isRecoveryActive && activeTab !== 'recovery' && { color: '#B91C1C' },
            ]}
          >
            Recovery
          </Text>
          {isRecoveryActive && <View style={styles.alertDot} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'warehouses' && styles.tabItemActive]}
          onPress={() => setActiveTab('warehouses')}
          activeOpacity={0.8}
        >
          <Building2 size={16} color={activeTab === 'warehouses' ? '#FFFFFF' : '#6B7280'} />
          <Text style={[styles.tabLabel, activeTab === 'warehouses' && styles.tabLabelActive]}>
            Hubs
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'settings' && styles.tabItemActive]}
          onPress={() => setActiveTab('settings')}
          activeOpacity={0.8}
        >
          <SettingsIcon size={16} color={activeTab === 'settings' ? '#FFFFFF' : '#6B7280'} />
          <Text style={[styles.tabLabel, activeTab === 'settings' && styles.tabLabelActive]}>
            Settings
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationProvider>
        <MainAppShell />
      </NavigationProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  contentContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  tabBar: {
    flexDirection: 'row',
    height: Platform.OS === 'ios' ? 64 : 60,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 9999,
    position: 'relative',
    gap: 6,
  },
  tabItemActive: {
    backgroundColor: '#111827',
  },
  tabItemRecoveryAlert: {
    backgroundColor: '#FEF2F2',
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    letterSpacing: -0.1,
  },
  tabLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  alertDot: {
    position: 'absolute',
    top: 4,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#B91C1C',
  },
});
