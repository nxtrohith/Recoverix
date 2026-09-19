import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { colors } from '../config/theme';
import { CockpitProvider } from '../context/CockpitContext';

export default function RootLayout() {
  return (
    <CockpitProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '800' },
          contentStyle: { backgroundColor: colors.bg },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Driver Selection', headerShown: false }} />
        <Stack.Screen name="cockpit" options={{ title: 'Driver Cockpit', headerShown: false }} />
      </Stack>
    </CockpitProvider>
  );
}
