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
          <User size={24} color="#111827" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.driverName}>{driver.name}</Text>
          <Text style={styles.truckId}>{driver.truckId} · {driver.fleet}</Text>
          <View style={styles.dutyBadge}>
            <View style={styles.statusDot} />
            <Text style={styles.dutyText}>{driver.status}</Text>
          </View>
        </View>
      </View>

      {/* 2. Telemetry & Navigation Mode */}
      <Text style={styles.sectionHeader}>LOCATION TELEMETRY & GPS</Text>
      <View style={styles.settingsGroup}>
        <View style={styles.settingRow}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={styles.settingTitle}>Simulation Mode</Text>
            <Text style={styles.settingDesc}>
              Override physical GPS to simulate transit for testing and demo flows
            </Text>
          </View>
          <Switch
            value={isSimulating}
            onValueChange={toggleSimulationMode}
            trackColor={{ false: '#E5E7EB', true: '#111827' }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.settingRow}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={styles.settingTitle}>Speed Multiplier</Text>
            <Text style={styles.settingDesc}>Accelerate movement along highway waypoints</Text>
          </View>
          <View style={styles.speedRow}>
            {[1, 3, 5, 10].map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.speedBtn, simSpeed === s && styles.speedBtnActive]}
                onPress={() => setSimulationSpeed(s)}
                activeOpacity={0.8}
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
          <View style={styles.resetIconBox}>
            <RotateCcw size={14} color="#111827" />
          </View>
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
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.testBtn}
            onPress={handleTestKey}
            disabled={testing}
            activeOpacity={0.85}
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
              <CheckCircle2 size={16} color="#15803D" />
            ) : (
              <AlertCircle size={16} color="#B45309" />
            )}
            <Text
              style={[
                styles.testResultText,
                testResult.valid ? { color: '#15803D' } : { color: '#B45309' },
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
        <View style={styles.divider} />
        <View style={styles.telemetryRow}>
          <Text style={styles.telemetryLabel}>Longitude</Text>
          <Text style={styles.telemetryVal}>{driverLocation.longitude.toFixed(6)}° E</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.telemetryRow}>
          <Text style={styles.telemetryLabel}>Compass Heading</Text>
          <Text style={styles.telemetryVal}>{Math.round(driverLocation.heading ?? 0)}°</Text>
        </View>
      </View>

      {/* 4. Module Isolation Boundary Notice */}
      <Text style={styles.sectionHeader}>ISOLATION & INTEGRATION BOUNDARY</Text>
      <View style={styles.integrationCard}>
        <View style={styles.integrationHeader}>
          <ShieldCheck size={18} color="#15803D" />
          <Text style={styles.integrationTitle}>Strict Module Isolation Verified</Text>
        </View>
        <Text style={styles.integrationBody}>
          This mobile driver app operates 100% independently with local mock services
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
    backgroundColor: '#F8F9FA',
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 14,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  truckId: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
  },
  dutyBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
    marginTop: 6,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#15803D',
  },
  dutyText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
    letterSpacing: 0.4,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 4,
  },
  settingsGroup: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  settingTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  settingDesc: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    lineHeight: 16,
  },
  speedRow: {
    flexDirection: 'row',
    gap: 6,
  },
  speedBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  speedBtnActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  speedText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
  },
  speedTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  resetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  resetIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
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
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 12,
    color: '#111827',
    fontFamily: 'monospace',
  },
  testBtn: {
    backgroundColor: '#111827',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 9999,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  testBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  testResultBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    marginTop: 10,
  },
  testSuccess: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  testWarning: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FEF3C7',
  },
  testResultText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  attributionNotice: {
    fontSize: 10.5,
    color: '#9CA3AF',
  },
  telemetryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  telemetryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  telemetryLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  telemetryVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    fontFamily: 'monospace',
  },
  integrationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 30,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  integrationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  integrationTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  integrationBody: {
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 18,
    marginTop: 4,
  },
});
