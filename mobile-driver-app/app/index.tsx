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
import { colors, neoShadow, radii, spacing, typography } from '../config/theme';
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
      <View style={styles.blobA} />
      <View style={styles.blobB} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandChip}>
          <Text style={styles.brand}>Recoverix</Text>
        </View>
        <Text style={styles.title}>Driver Selection</Text>
        <Text style={styles.sub}>
          Choose your profile to open the recovery cockpit. Live vehicle and
          assignment data come from the logistics backend.
        </Text>
        <View style={styles.apiChip}>
          <Text style={styles.api}>API · {getApiBaseUrl()}</Text>
        </View>

        {loading && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.main} size="large" />
            <Text style={styles.muted}>Loading fleet…</Text>
          </View>
        )}

        {error && !loading && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
              onPress={refresh}
            >
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
  blobA: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.main,
    opacity: 0.28,
  },
  blobB: {
    position: 'absolute',
    bottom: 80,
    left: -50,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.chartTransit,
    opacity: 0.2,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: 48,
  },
  brandChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.main,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    ...neoShadow,
  },
  brand: {
    ...typography.brand,
    color: colors.black,
    fontSize: 22,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
  },
  sub: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  apiChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: spacing.sm,
  },
  api: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  list: { gap: spacing.md },
  center: { alignItems: 'center', gap: 12, paddingVertical: 40 },
  muted: { color: colors.textMuted, fontWeight: '700' },
  errorBox: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderWidth: 2,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: 10,
    ...neoShadow,
  },
  errorText: { color: colors.text, fontWeight: '700' },
  retry: {
    alignSelf: 'flex-start',
    backgroundColor: colors.danger,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: colors.border,
    ...neoShadow,
  },
  retryText: { color: colors.black, fontWeight: '900' },
  pressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
    shadowOffset: { width: 2, height: 2 },
  },
});
