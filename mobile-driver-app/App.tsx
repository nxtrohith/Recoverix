import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Map, Navigation as NavIcon, ShieldAlert, Building2, Settings as SettingsIcon } from 'lucide-react-native';
import { NavigationProvider, useNavigationContext } from './context/NavigationContext';

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
      <StatusBar style="light" />

      {/* Screen Content Container */}
      <View style={styles.contentContainer}>
        {activeTab === 'cockpit' && <IndexScreen />}
        {activeTab === 'navigation' && <NavigationScreen />}
        {activeTab === 'recovery' && <RecoveryScreen />}
        {activeTab === 'warehouses' && <WarehouseScreen />}
        {activeTab === 'settings' && <SettingsScreen />}
      </View>

      {/* Tactical Bottom Navigation Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'cockpit' && styles.tabItemActive]}
          onPress={() => setActiveTab('cockpit')}
          activeOpacity={0.7}
        >
          <Map size={18} color={activeTab === 'cockpit' ? '#38bdf8' : '#64748b'} />
          <Text style={[styles.tabLabel, activeTab === 'cockpit' && styles.tabLabelActive]}>
            Cockpit
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'navigation' && styles.tabItemActive]}
          onPress={() => setActiveTab('navigation')}
          activeOpacity={0.7}
        >
          <NavIcon size={18} color={activeTab === 'navigation' ? '#38bdf8' : '#64748b'} />
          <Text style={[styles.tabLabel, activeTab === 'navigation' && styles.tabLabelActive]}>
            Navigation
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'recovery' && styles.tabItemActive]}
          onPress={() => setActiveTab('recovery')}
          activeOpacity={0.7}
        >
          <ShieldAlert
            size={18}
            color={
              activeTab === 'recovery'
                ? '#f59e0b'
                : isRecoveryActive
                ? '#f59e0b'
                : '#64748b'
            }
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'recovery' && styles.tabLabelRecovery,
              isRecoveryActive && !activeTab && { color: '#f59e0b' },
            ]}
          >
            Recovery
          </Text>
          {isRecoveryActive && <View style={styles.alertDot} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'warehouses' && styles.tabItemActive]}
          onPress={() => setActiveTab('warehouses')}
          activeOpacity={0.7}
        >
          <Building2 size={18} color={activeTab === 'warehouses' ? '#38bdf8' : '#64748b'} />
          <Text style={[styles.tabLabel, activeTab === 'warehouses' && styles.tabLabelActive]}>
            Hubs
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'settings' && styles.tabItemActive]}
          onPress={() => setActiveTab('settings')}
          activeOpacity={0.7}
        >
          <SettingsIcon size={18} color={activeTab === 'settings' ? '#38bdf8' : '#64748b'} />
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
    backgroundColor: '#090d16',
  },
  contentContainer: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    height: Platform.OS === 'ios' ? 62 : 56,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    position: 'relative',
  },
  tabItemActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 3,
  },
  tabLabelActive: {
    color: '#38bdf8',
    fontWeight: '800',
  },
  tabLabelRecovery: {
    color: '#f59e0b',
    fontWeight: '800',
  },
  alertDot: {
    position: 'absolute',
    top: 4,
    right: 12,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#dc2626',
  },
});
