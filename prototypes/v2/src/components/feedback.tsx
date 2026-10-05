import { useNetworkState } from 'expo-network';
import { CircleAlert, CircleCheck, Info, WifiOff } from '@/components/icons';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAppState } from '@/state/app-state';

type ToastKind = 'success' | 'info' | 'error';
/** A button inside the toast, e.g. « Annuler » after a deletion. */
type ToastAction = { label: string; onPress: () => void };
type Toast = { id: number; message: string; kind: ToastKind; action?: ToastAction };
type ShowToast = (message: string, kind?: ToastKind, action?: ToastAction) => void;

const ToastContext = createContext<ShowToast | null>(null);

const ICONS = { success: CircleCheck, info: Info, error: CircleAlert };
const ICON_COLORS = { success: '#3BE39A', info: '#FFFFFF', error: '#FF8A80' };

/** Short confirmations (« Horaires : modification enregistrée ») shown on top of every screen. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [anim] = useState(() => new Animated.Value(0));
  const counter = useRef(0);
  const insets = useSafeAreaInsets();

  const show = useCallback<ShowToast>((message, kind = 'success', action) => {
    counter.current += 1;
    setToast({ id: counter.current, message, kind, action });
    AccessibilityInfo.announceForAccessibility(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
    const hide = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setToast(null));
      // Longer when there is a button to reach.
    }, toast.action ? 5000 : 2600);
    return () => clearTimeout(hide);
  }, [toast, anim]);

  const Icon = toast ? ICONS[toast.kind] : null;

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && Icon ? (
        <Animated.View
          pointerEvents={toast.action ? 'box-none' : 'none'}
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
          {toast.action ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => {
                toast.action?.onPress();
                setToast(null);
              }}>
              <Text weight="extrabold" style={styles.toastAction}>
                {toast.action.label}
              </Text>
            </Pressable>
          ) : null}
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

// Once live, the owner's first worry is whether customers are left alone.
// Assumes Tiko answers from our server and keeps replying while this phone is
// offline: confirm with the backend before shipping this wording.
const OFFLINE_LIVE = 'Pas de connexion. Tiko répond quand même à vos clients ; vos changements partiront dès que ça revient.';
const OFFLINE_SETUP = 'Pas de connexion. Continuez, on enregistre dès que ça revient.';

/** Thin banner when the phone has no connection (frequent with mobile data in Abidjan). */
export function OfflineBanner() {
  const network = useNetworkState();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { profile } = useAppState();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const message = profile.whatsappConnected ? OFFLINE_LIVE : OFFLINE_SETUP;
  const wasOffline = useRef(false);

  useEffect(() => {
    if (offline) {
      AccessibilityInfo.announceForAccessibility(message);
    } else if (wasOffline.current) {
      toast('Connexion revenue. Tout est à jour.');
    }
    wasOffline.current = offline;
    // Only on a connection change, not when the message wording changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline]);

  if (!offline) return null;
  return (
    <View style={[styles.banner, { paddingTop: insets.top + 6 }]} accessibilityLiveRegion="assertive" accessibilityRole="alert">
      <WifiOff size={18} color={Colors.onPrimary} strokeWidth={2.4} />
      <Text weight="bold" style={styles.bannerText}>
        {message}
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
  toastAction: { color: Colors.primary, fontSize: 15 },
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
