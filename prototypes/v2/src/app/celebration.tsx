import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Component, Suspense, lazy, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Tiko } from '@/components/tiko/tiko';
import { Button } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAppState } from '@/state/app-state';

// Loaded on demand: if 3D can't start on a phone, only this screen falls back.
const TikoCanvas = lazy(() =>
  import('@/components/tiko-3d/tiko-canvas').then((m) => {
    // A module that failed to evaluate can resolve without exports; fail loudly instead.
    if (!m?.default) throw new Error('3D module did not load');
    return m;
  }),
);

// Paper confetti of the 2D version (positions from the validated design).
const PAPER = [
  { left: 46, top: 92, w: 10, h: 16, color: Colors.primary, rotate: '-24deg' },
  { left: 300, top: 70, w: 10, h: 16, color: Colors.green, rotate: '32deg' },
  { left: 330, top: 190, w: 9, h: 14, color: '#FFFFFF', rotate: '12deg' },
  { left: 70, top: 230, w: 9, h: 14, color: Colors.green, rotate: '48deg' },
  { left: 180, top: 48, w: 9, h: 14, color: '#FFC94D', rotate: '-40deg' },
  { left: 24, top: 330, w: 10, h: 16, color: '#FFC94D', rotate: '20deg' },
  { left: 340, top: 320, w: 10, h: 16, color: Colors.primary, rotate: '-12deg' },
  { left: 250, top: 130, w: 8, h: 12, color: Colors.primary, rotate: '60deg' },
];

/** 2D Tiko with paper confetti: shown while 3D loads, or instead of it. */
function FlatTiko() {
  const [pop] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 6, bounciness: 12 }).start();
  }, [pop]);
  return (
    <View style={styles.flat}>
      {PAPER.map((c) => (
        <View
          key={`${c.left}-${c.top}`}
          style={[styles.paper, { left: c.left, top: c.top, width: c.w, height: c.h, backgroundColor: c.color, transform: [{ rotate: c.rotate }] }]}
        />
      ))}
      <Animated.View style={{ transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
        <Tiko pose="happy" size={260} />
      </Animated.View>
    </View>
  );
}

/** If 3D can't start on a device, show the 2D Tiko instead of a blank screen. */
class Fallback3D extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('3D animation unavailable, showing the 2D Tiko instead:', error.message, info.componentStack);
  }
  render() {
    return this.state.failed ? <FlatTiko /> : this.props.children;
  }
}

/** Shown once, right after the questionnaire: Tiko is « born ». */
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
      <View style={styles.stage} accessible accessibilityLabel="Animation : Tiko apparaît, vous fait coucou et lance des confettis">
        <Fallback3D>
          <Suspense fallback={<FlatTiko />}>
            <TikoCanvas reduceMotion={reduceMotion} />
          </Suspense>
        </Fallback3D>
      </View>

      <Animated.View
        style={[
          styles.panel,
          { opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] },
        ]}>
        <Text weight="extrabold" style={styles.title} accessibilityRole="header">
          Tiko est prêt !
        </Text>
        <Text style={styles.subtitle}>
          Tiko connaît déjà {profile.name || 'votre commerce'}. Écrivez-lui comme un client pour voir ses réponses.
        </Text>
        <Button label="Tester Tiko maintenant" onPress={next} style={styles.button} />
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.primarySoft },
  stage: { flex: 1 },
  flat: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  paper: { position: 'absolute', borderRadius: 2 },
  panel: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: 12 },
  title: { fontSize: 30, lineHeight: 36, letterSpacing: -0.6, textAlign: 'center' },
  subtitle: { fontSize: 16, lineHeight: 24, color: Colors.muted, textAlign: 'center' },
  button: { marginTop: 12 },
});
