import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { Colors } from '@/constants/theme';
import { AppStateProvider } from '@/state/app-state';

export default function RootLayout() {
  return (
    <AppStateProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTintColor: Colors.primary,
          headerTitleStyle: { color: Colors.text, fontWeight: '700' },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: Colors.background },
        }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding/phone" options={{ title: '' }} />
        <Stack.Screen name="onboarding/category" options={{ title: '' }} />
        <Stack.Screen name="onboarding/questions" options={{ title: '' }} />
        <Stack.Screen name="test-chat" options={{ title: 'Tester mon assistant' }} />
        <Stack.Screen name="onboarding/whatsapp" options={{ title: 'Connecter WhatsApp' }} />
        <Stack.Screen name="home" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="conversation/[id]" options={{ title: '' }} />
        <Stack.Screen name="celebration" options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="settings" options={{ title: 'Mon assistant' }} />
        <Stack.Screen name="edit/[step]" options={{ title: '' }} />
        <Stack.Screen name="learned" options={{ title: 'Réponses apprises' }} />
      </Stack>
    </AppStateProvider>
  );
}
