import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DriverCard } from '../components/DriverCard';
import { colors, radii, spacing, typography } from '../config/theme';
import { useCockpit } from '../context/CockpitContext';
import { useDriverRoster } from '../hooks/useDriverCockpit';
import { getApiBaseUrl } from '../services/api';

export default function DriverSelectionScreen() {
  const router = useRouter();
  const { loading, error, drivers, refresh } = useDriverRoster();
  const { selectDriver, session } = useCockpit();

  useEffect(() => {
    if (session) router.replace('/cockpit');
  }, [session, router]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>SH-205</Text>
        <Text style={styles.title}>Driver Selection</Text>
        <Text style={styles.sub}>
          Choose your profile to open the recovery cockpit. Live vehicle and
          assignment data come from the logistics backend.
        </Text>
        <Text style={styles.api}>API · {getApiBaseUrl()}</Text>

        {loading && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.muted}>Loading fleet…</Text>
          </View>
        )}

        {error && !loading && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retry} onPress={refresh}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.list}>
          {drivers.map((d) => (
            <DriverCard
              key={d.driverId}
              driver={d}
              onSelect={async (driver) => {
                await selectDriver(driver);
                router.replace('/cockpit');
              }}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: 48,
  },
  brand: {
    ...typography.brand,
    color: colors.accent,
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
  },
  sub: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  api: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  list: { gap: spacing.md },
  center: { alignItems: 'center', gap: 12, paddingVertical: 40 },
  muted: { color: colors.textMuted },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: 10,
  },
  errorText: { color: colors.text },
  retry: {
    alignSelf: 'flex-start',
    backgroundColor: colors.danger,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.pill,
  },
  retryText: { color: colors.white, fontWeight: '800' },
});
