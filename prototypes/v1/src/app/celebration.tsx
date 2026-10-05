import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Component, Suspense, lazy, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAppState } from '@/state/app-state';

// Loaded on demand: if 3D can't start on a phone, only this screen falls back.
const RobotCanvas = lazy(() =>
  import('@/components/robot-3d/robot-canvas').then((m) => {
    // A module that failed to evaluate can resolve without exports; fail loudly instead.
    if (!m?.default) throw new Error('3D module did not load');
    return m;
  }),
);

function EmojiRobot() {
  return (
    <View style={styles.fallback}>
      <Text style={styles.fallbackEmoji}>🤖</Text>
    </View>
  );
}

/** If 3D can't start on a device, show a simple emoji robot instead of a blank screen. */
class Fallback3D extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('3D animation unavailable, showing the emoji robot instead:', error.message, info.componentStack);
  }
  render() {
    return this.state.failed ? <EmojiRobot /> : this.props.children;
  }
}

/** Shown once, right after the questionnaire: the assistant is "born". */
export default function Celebration() {
  const { profile } = useAppState();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [reveal] = useState(() => new Animated.Value(0));

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
  }, []);

  useEffect(() => {
    // A little buzz when the confetti bursts, then the text slides in.
    const buzz = setTimeout(() => {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }, 750);
    Animated.timing(reveal, { toValue: 1, duration: 500, delay: 1100, useNativeDriver: true }).start();
    return () => clearTimeout(buzz);
  }, [reveal]);

  const next = () => router.replace({ pathname: '/test-chat', params: { onboarding: '1' } });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.stage} accessible accessibilityLabel="Animation : votre assistant robot apparaît et vous salue">
        <Fallback3D>
          <Suspense fallback={<EmojiRobot />}>
            <RobotCanvas reduceMotion={reduceMotion} />
          </Suspense>
        </Fallback3D>
      </View>

      <Animated.View
        style={[
          styles.panel,
          { opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] },
        ]}>
        <Text style={styles.title}>Votre assistant est prêt !</Text>
        <Text style={styles.subtitle}>
          Il connaît déjà {profile.name || 'votre commerce'}. Testez-le comme si vous étiez un client.
        </Text>
        <Button label="Le tester maintenant" onPress={next} />
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.primarySoft },
  stage: { flex: 1 },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fallbackEmoji: { fontSize: 120 },
  panel: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.md },
  title: { fontSize: 28, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  subtitle: { fontSize: 17, color: Colors.textMuted, textAlign: 'center', lineHeight: 24 },
});
