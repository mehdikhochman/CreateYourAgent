import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { OfflineBanner, ToastProvider } from '@/components/feedback';
import { Colors, Font } from '@/constants/theme';
import { AppStateProvider } from '@/state/app-state';

// Keep the orange splash until the fonts are ready, so text never jumps.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    [Font.medium]: PlusJakartaSans_500Medium,
    [Font.semibold]: PlusJakartaSans_600SemiBold,
    [Font.bold]: PlusJakartaSans_700Bold,
    [Font.extrabold]: PlusJakartaSans_800ExtraBold,
  });
  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <AppStateProvider>
      <ToastProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.surface } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding/phone" />
          <Stack.Screen name="onboarding/category" />
          <Stack.Screen name="onboarding/questions" />
          <Stack.Screen name="celebration" options={{ gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="test-chat" />
          <Stack.Screen name="onboarding/whatsapp" />
          <Stack.Screen name="(tabs)" options={{ gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="conversation/[id]" />
          <Stack.Screen name="edit/[step]" />
          <Stack.Screen name="learned" />
        </Stack>
        <OfflineBanner />
      </ToastProvider>
    </AppStateProvider>
  );
}
