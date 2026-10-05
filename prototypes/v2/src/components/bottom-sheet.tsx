import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';

/**
 * Sheet that slides up from the bottom. Closes with the backdrop, the
 * Android back button, or by dragging the handle down.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
  footer,
  heightRatio = 0.86,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  heightRatio?: number;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const [progress] = useState(() => new Animated.Value(0));
  const [drag] = useState(() => new Animated.Value(0));

  // Keep the modal mounted until the closing animation ends.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      drag.setValue(0);
      Animated.spring(progress, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 2 }).start();
    } else {
      Animated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, progress, drag]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 6,
        onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.dy > 120 || g.vy > 1.2) onClose();
          else Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start();
        },
      }),
    [drag, onClose],
  );
  const sheetHeight = Math.min(height * heightRatio, height - insets.top - 12);
  const translateY = Animated.add(
    progress.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight, 0] }),
    drag,
  );

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Fermer" onPress={onClose} />
      </Animated.View>
      <KeyboardAvoidingView style={styles.holder} behavior="padding" pointerEvents="box-none">
        <Animated.View
          accessibilityViewIsModal
          style={[styles.sheet, { height: sheetHeight, paddingBottom: Math.max(insets.bottom, Spacing.md), transform: [{ translateY }] }]}>
          <View {...pan.panHandlers} style={styles.handleArea}>
            <View style={styles.handle} />
          </View>
          <View style={styles.body}>{children}</View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: Colors.backdrop },
  holder: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    overflow: 'hidden',
  },
  handleArea: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#D5D5DB' },
  body: { flex: 1 },
  footer: { paddingHorizontal: 20, paddingTop: Spacing.sm, gap: Spacing.sm },
});
