import { useNetworkState } from 'expo-network';
import { CircleAlert, CircleCheck, Info, WifiOff } from '@/components/icons';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Colors, Radius, Spacing } from '@/constants/theme';

type ToastKind = 'success' | 'info' | 'error';
type Toast = { id: number; message: string; kind: ToastKind };

const ToastContext = createContext<((message: string, kind?: ToastKind) => void) | null>(null);

const ICONS = { success: CircleCheck, info: Info, error: CircleAlert };
const ICON_COLORS = { success: '#3BE39A', info: '#FFFFFF', error: '#FF8A80' };

/** Short confirmations (« Horaires : modification enregistrée ») shown on top of every screen. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [anim] = useState(() => new Animated.Value(0));
  const counter = useRef(0);
  const insets = useSafeAreaInsets();

  const show = useCallback((message: string, kind: ToastKind = 'success') => {
    counter.current += 1;
    setToast({ id: counter.current, message, kind });
    AccessibilityInfo.announceForAccessibility(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
    const hide = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setToast(null));
    }, 2600);
    return () => clearTimeout(hide);
  }, [toast, anim]);

  const Icon = toast ? ICONS[toast.kind] : null;

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && Icon ? (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[
            styles.toast,
            {
              top: insets.top + Spacing.sm,
              opacity: anim,
              transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
            },
          ]}>
          <Icon size={20} color={ICON_COLORS[toast.kind]} strokeWidth={2.4} />
          <Text weight="bold" style={styles.toastText}>
            {toast.message}
          </Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used inside ToastProvider');
  return show;
}

const OFFLINE_MESSAGE = 'Pas de connexion. Vos changements seront envoyés au retour du réseau.';

/** Thin banner when the phone has no connection (frequent with mobile data in Abidjan). */
export function OfflineBanner() {
  const network = useNetworkState();
  const insets = useSafeAreaInsets();
  const offline = network.isConnected === false || network.isInternetReachable === false;

  useEffect(() => {
    if (offline) AccessibilityInfo.announceForAccessibility(OFFLINE_MESSAGE);
  }, [offline]);

  if (!offline) return null;
  return (
    <View style={[styles.banner, { paddingTop: insets.top + 6 }]} accessibilityLiveRegion="assertive" accessibilityRole="alert">
      <WifiOff size={18} color={Colors.onPrimary} strokeWidth={2.4} />
      <Text weight="bold" style={styles.bannerText}>
        {OFFLINE_MESSAGE}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: Radius.md,
    backgroundColor: Colors.ink,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  toastText: { flex: 1, color: '#FFFFFF', fontSize: 15, lineHeight: 20 },
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: Spacing.md,
    paddingBottom: 10,
    backgroundColor: '#FFC94D',
  },
  bannerText: { flex: 1, fontSize: 14, lineHeight: 19, color: Colors.onPrimary },
});
