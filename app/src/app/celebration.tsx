import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Component, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Canvas } from '@/components/robot-3d/fiber';
import { RobotScene } from '@/components/robot-3d/robot-scene';
import { Button } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAppState } from '@/state/app-state';

/** If 3D can't start on a device, show a simple emoji robot instead of a blank screen. */
class Fallback3D extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <View style={styles.fallback}>
          <Text style={styles.fallbackEmoji}>🤖</Text>
        </View>
      );
    }
    return this.props.children;
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
          <Canvas camera={{ position: [0, 0.4, 6], fov: 40 }} style={styles.canvas}>
            <RobotScene reduceMotion={reduceMotion} />
          </Canvas>
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
  canvas: { flex: 1 },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fallbackEmoji: { fontSize: 120 },
  panel: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.md },
  title: { fontSize: 28, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  subtitle: { fontSize: 17, color: Colors.textMuted, textAlign: 'center', lineHeight: 24 },
});
