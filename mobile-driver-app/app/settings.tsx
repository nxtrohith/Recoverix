import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, TextInput } from 'react-native';
import { User, Truck, Radio, Zap, RotateCcw, ShieldCheck, Database, Code, MapPin, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { useNavigationContext } from '../context/NavigationContext';
import { INITIAL_DRIVER_LOCATION } from '../data/mockDriver';
import { locationService } from '../services/locationService';
import { GOOGLE_MAPS_CONFIG, getGoogleMapsApiKey, setGoogleMapsApiKey } from '../config/maps';
import { testGoogleMapsApiKey } from '../services/googleMapsService';

export default function SettingsScreen() {
  const {
    driver,
    driverLocation,
    isSimulating,
    simSpeed,
    toggleSimulationMode,
    setSimulationSpeed,
  } = useNavigationContext();

  const [apiKeyInput, setApiKeyInput] = useState(getGoogleMapsApiKey());
  const [testResult, setTestResult] = useState<{ valid: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const handleTestKey = async () => {
    setTesting(true);
    setGoogleMapsApiKey(apiKeyInput);
    const res = await testGoogleMapsApiKey(apiKeyInput.trim());
    setTestResult(res);
    setTesting(false);
  };

  const handleResetLocation = () => {
    locationService.setManualLocation(INITIAL_DRIVER_LOCATION);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      {/* 1. Driver Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.avatarBox}>
          <User size={28} color="#38bdf8" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.driverName}>{driver.name}</Text>
          <Text style={styles.truckId}>{driver.truckId} · {driver.fleet}</Text>
          <View style={styles.dutyBadge}>
            <Text style={styles.dutyText}>● {driver.status}</Text>
          </View>
        </View>
      </View>

      {/* 2. Telemetry & Navigation Mode */}
      <Text style={styles.sectionHeader}>LOCATION TELEMETRY & GPS</Text>
      <View style={styles.settingsGroup}>
        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingTitle}>Simulation Mode</Text>
            <Text style={styles.settingDesc}>
              Override physical GPS to simulate highway transit for demonstrations
            </Text>
          </View>
          <Switch
            value={isSimulating}
            onValueChange={toggleSimulationMode}
            trackColor={{ false: '#334155', true: '#f59e0b' }}
            thumbColor={isSimulating ? '#ffffff' : '#94a3b8'}
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingTitle}>Simulation Speed Multiplier</Text>
            <Text style={styles.settingDesc}>Accelerate movement along highway waypoints</Text>
          </View>
          <View style={styles.speedRow}>
            {[1, 3, 5, 10].map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.speedBtn, simSpeed === s && styles.speedBtnActive]}
                onPress={() => setSimulationSpeed(s)}
              >
                <Text style={[styles.speedText, simSpeed === s && styles.speedTextActive]}>
                  {s}x
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.resetRow}
          onPress={handleResetLocation}
          activeOpacity={0.7}
        >
          <RotateCcw size={16} color="#38bdf8" />
          <Text style={styles.resetText}>Reset Position to Hyderabad Central Hub</Text>
        </TouchableOpacity>
      </View>

      {/* Google Maps Platform API Section */}
      <Text style={styles.sectionHeader}>GOOGLE MAPS PLATFORM NAVIGATION</Text>
      <View style={styles.settingsGroup}>
        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingTitle}>Google Maps API Key</Text>
            <Text style={styles.settingDesc}>
              Powers real-time turn-by-turn routing and Google Directions API
            </Text>
          </View>
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.keyInput}
            value={apiKeyInput}
            onChangeText={setApiKeyInput}
            placeholder="Enter Google Maps API Key..."
            placeholderTextColor="#64748b"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.testBtn}
            onPress={handleTestKey}
            disabled={testing}
          >
            <Text style={styles.testBtnText}>{testing ? 'Testing...' : 'Test Key'}</Text>
          </TouchableOpacity>
        </View>

        {testResult && (
          <View
            style={[
              styles.testResultBox,
              testResult.valid ? styles.testSuccess : styles.testWarning,
            ]}
          >
            {testResult.valid ? (
              <CheckCircle2 size={16} color="#10b981" />
            ) : (
              <AlertCircle size={16} color="#f59e0b" />
            )}
            <Text
              style={[
                styles.testResultText,
                testResult.valid ? { color: '#10b981' } : { color: '#fbbf24' },
              ]}
            >
              {testResult.message}
            </Text>
          </View>
        )}

        <View style={styles.divider} />
        <Text style={styles.attributionNotice}>
          Solution ID: {GOOGLE_MAPS_CONFIG.solutionId} · Google Maps Platform Compliant
        </Text>
      </View>

      {/* 3. Live Telemetry Coordinates */}
      <Text style={styles.sectionHeader}>CURRENT SENSOR TELEMETRY</Text>
      <View style={styles.telemetryCard}>
        <View style={styles.telemetryRow}>
          <Text style={styles.telemetryLabel}>Latitude</Text>
          <Text style={styles.telemetryVal}>{driverLocation.latitude.toFixed(6)}° N</Text>
        </View>
        <View style={styles.telemetryRow}>
          <Text style={styles.telemetryLabel}>Longitude</Text>
          <Text style={styles.telemetryVal}>{driverLocation.longitude.toFixed(6)}° E</Text>
        </View>
        <View style={styles.telemetryRow}>
          <Text style={styles.telemetryLabel}>Compass Heading</Text>
          <Text style={styles.telemetryVal}>{Math.round(driverLocation.heading ?? 0)}°</Text>
        </View>
      </View>

      {/* 4. Future Integration Architecture Notice */}
      <Text style={styles.sectionHeader}>ISOLATION & INTEGRATION BOUNDARY</Text>
      <View style={styles.integrationCard}>
        <View style={styles.integrationHeader}>
          <ShieldCheck size={18} color="#10b981" />
          <Text style={styles.integrationTitle}>Strict Module Isolation Verified</Text>
        </View>
        <Text style={styles.integrationBody}>
          This mobile module currently operates 100% independently with local mock services
          (`MockDriverLocationProvider` and `MockRecoveryProvider`). No backend APIs,
          databases, or WebSockets are connected.
        </Text>
        <Text style={styles.integrationBody}>
          Future backend integration points:
          {'\n'}• `services/locationService.ts` → Connect real GPS socket to fleet backend
          {'\n'}• `services/mockRecoveryService.ts` → Connect recovery webhooks to dispatch queue
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 16,
    gap: 14,
    marginBottom: 20,
  },
  avatarBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1.5,
    borderColor: '#38bdf8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ffffff',
  },
  truckId: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  dutyBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 6,
  },
  dutyText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#10b981',
  },
  sectionHeader: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  settingsGroup: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 14,
    marginBottom: 20,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  settingTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#f8fafc',
  },
  settingDesc: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
    maxWidth: '85%',
  },
  speedRow: {
    flexDirection: 'row',
    gap: 4,
  },
  speedBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#1e293b',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  speedBtnActive: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b',
  },
  speedText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8',
  },
  speedTextActive: {
    color: '#0f172a',
    fontWeight: '900',
  },
  resetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  resetText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38bdf8',
  },
  divider: {
    height: 1,
    backgroundColor: '#1e293b',
    marginVertical: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    alignItems: 'center',
  },
  keyInput: {
    flex: 1,
    backgroundColor: '#090d16',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 12,
    color: '#f8fafc',
    fontFamily: 'monospace',
  },
  testBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  testBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '800',
  },
  testResultBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  testSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  testWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  testResultText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
  },
  attributionNotice: {
    fontSize: 10,
    color: '#64748b',
    fontStyle: 'italic',
  },
  telemetryCard: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 14,
    marginBottom: 20,
    gap: 8,
  },
  telemetryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  telemetryLabel: {
    fontSize: 12,
    color: '#94a3b8',
  },
  telemetryVal: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#f8fafc',
    fontFamily: 'monospace',
  },
  integrationCard: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    padding: 14,
    marginBottom: 30,
  },
  integrationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  integrationTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#10b981',
  },
  integrationBody: {
    fontSize: 11.5,
    color: '#94a3b8',
    lineHeight: 18,
    marginTop: 4,
  },
});
