import { router } from 'expo-router';
import { Check, ChevronLeft, ChevronRight } from '@/components/icons';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Tiko, type TikoPose } from '@/components/tiko/tiko';
import { Colors, Font, Radius, Spacing } from '@/constants/theme';

/**
 * Page wrapper: safe area, keyboard avoidance and an optional sticky footer
 * that stays above the keyboard (main button).
 */
export function Screen({
  children,
  header,
  footer,
  scroll = true,
  edges = ['top', 'bottom'],
  background = Colors.surface,
  contentStyle,
}: {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  edges?: ('top' | 'bottom')[];
  background?: string;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: background }]} edges={edges}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        {header}
        {scroll ? (
          <ScrollView
            contentContainerStyle={[styles.content, contentStyle]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, styles.content, contentStyle]}>{children}</View>
        )}
        {footer ? <View style={[styles.footer, { backgroundColor: background }]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Round back button, plus a progress bar or a title. */
export function TopBar({
  title,
  progress,
  onBack,
  right,
  background,
}: {
  title?: string;
  progress?: { value: number; label: string };
  onBack?: (() => void) | null;
  right?: ReactNode;
  background?: string;
}) {
  const back = onBack === undefined ? () => router.back() : onBack;
  return (
    <View style={[styles.topBar, background ? { backgroundColor: background } : null]}>
      {back ? (
        <IconButton label="Retour" onPress={back}>
          <ChevronLeft size={24} color={Colors.ink} strokeWidth={2.4} />
        </IconButton>
      ) : null}
      {progress ? (
        <>
          <View style={styles.flex}>
            <ProgressBar value={progress.value} />
          </View>
          <Text weight="bold" style={styles.topBarCount}>
            {progress.label}
          </Text>
        </>
      ) : (
        <Text weight="extrabold" style={styles.topBarTitle} numberOfLines={1}>
          {title}
        </Text>
      )}
      {right}
    </View>
  );
}

export function IconButton({
  children,
  onPress,
  label,
  background = Colors.surfaceMuted,
  size = 44,
}: {
  children: ReactNode;
  onPress: () => void;
  label: string;
  background?: string;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, backgroundColor: background },
        styles.center,
        pressed && styles.pressed,
      ]}>
      {children}
    </Pressable>
  );
}

export function Title({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Text weight="extrabold" style={[styles.title, style]} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Subtitle({ children }: { children: ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

export function SectionLabel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Text weight="extrabold" style={[styles.sectionLabel, style]}>
      {children}
    </Text>
  );
}

type ButtonVariant = 'primary' | 'whatsapp' | 'secondary' | 'ghost';

const BUTTON_COLORS: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: Colors.primary, fg: Colors.onPrimary },
  whatsapp: { bg: Colors.green, fg: '#FFFFFF' },
  secondary: { bg: Colors.surface, fg: Colors.ink, border: Colors.border },
  ghost: { bg: 'transparent', fg: Colors.ink },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  size = 'lg',
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  /** Rendered before the label (a Lucide icon or a brand mark). */
  icon?: ReactNode;
  size?: 'xl' | 'lg' | 'md';
  style?: StyleProp<ViewStyle>;
}) {
  const isDisabled = disabled || loading;
  const c = BUTTON_COLORS[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        size === 'md' && styles.buttonMd,
        size === 'xl' && styles.buttonXl,
        { backgroundColor: c.bg },
        c.border ? { borderWidth: 1.5, borderColor: c.border } : null,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon}
          <Text
            weight={size === 'xl' ? 'extrabold' : 'bold'}
            style={[styles.buttonLabel, size === 'md' && styles.buttonLabelMd, size === 'xl' && styles.buttonLabelXl, { color: c.fg }]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** Small text link (« Tout voir », « Passer »). */
export function LinkButton({ label, onPress, color = Colors.link }: { label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable accessibilityRole="button" hitSlop={10} onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <Text weight="bold" style={[styles.link, { color }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label?: string; prefix?: ReactNode; hint?: string }) {
  const { label, prefix, hint, style, onFocus, onBlur, ...rest } = props;
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      {label ? (
        <Text weight="bold" style={styles.fieldLabel}>
          {label}
        </Text>
      ) : null}
      <View style={[styles.field, focused && styles.fieldFocused, rest.multiline && styles.fieldMultilineWrap]}>
        {prefix}
        <TextInput
          placeholderTextColor={Colors.faint}
          selectionColor={Colors.primary}
          style={[styles.fieldInput, rest.multiline && styles.fieldMultiline, style]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
      </View>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}>
      {selected ? <Check size={16} color={Colors.ink} strokeWidth={3} /> : icon}
      <Text weight={selected ? 'bold' : 'semibold'} style={styles.chipLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Black round check shown on selected cards. */
export function CheckBadge({ size = 28 }: { size?: number }) {
  return (
    <View style={[styles.center, { width: size, height: size, borderRadius: size / 2, backgroundColor: Colors.ink }]}>
      <Check size={size * 0.55} color="#FFFFFF" strokeWidth={3} />
    </View>
  );
}

export function CheckBox({ checked }: { checked: boolean }) {
  return (
    <View style={[styles.checkbox, checked && styles.checkboxOn]}>
      {checked ? <Check size={18} color={Colors.onPrimary} strokeWidth={3} /> : null}
    </View>
  );
}

/** Selectable card: a row (icon, title, description) or a square tile. */
export function SelectCard({
  title,
  description,
  icon,
  selected,
  onPress,
  tile,
  role = 'checkbox',
  style,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  selected: boolean;
  onPress: () => void;
  tile?: boolean;
  role?: 'checkbox' | 'radio';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={description ? `${title}, ${description}` : title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.selectCard,
        tile ? styles.selectTile : styles.selectRow,
        selected && styles.selectCardOn,
        pressed && styles.pressed,
        style,
      ]}>
      {icon}
      <View style={tile ? styles.selectTileText : styles.flex}>
        <Text weight="bold" style={styles.selectTitle}>
          {title}
        </Text>
        {description ? <Text style={styles.selectDescription}>{description}</Text> : null}
      </View>
      {selected ? (
        <View style={tile ? styles.selectTileBadge : null}>
          <CheckBadge size={tile ? 24 : 28} />
        </View>
      ) : null}
    </Pressable>
  );
}

export function ProgressBar({ value, color = Colors.primary, height = 6 }: { value: number; color?: string; height?: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <View
      style={[styles.progressTrack, { height, borderRadius: height / 2 }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}>
      <View style={{ width: `${pct}%`, height, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

/** White rounded block; children separated by hairlines (settings lists). */
export function Group({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.group, style]}>{children}</View>;
}

export function Row({
  label,
  value,
  right,
  left,
  warn,
  onPress,
  last,
  description,
}: {
  label: string;
  value?: string;
  right?: ReactNode;
  left?: ReactNode;
  warn?: boolean;
  onPress?: () => void;
  last?: boolean;
  description?: string;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={[label, description, value].filter(Boolean).join(', ')}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && styles.rowPressed]}>
      {left}
      <View style={description || (!value && !right) ? styles.flex : styles.rowLabelWrap}>
        <Text weight="bold" style={styles.rowLabel} numberOfLines={1}>
          {label}
        </Text>
        {description ? <Text style={styles.rowDescription}>{description}</Text> : null}
      </View>
      {description || (!value && !right) ? null : <View style={styles.flex} />}
      {right ??
        (value ? (
          <Text weight={warn ? 'bold' : 'medium'} style={[styles.rowValue, warn && styles.rowWarn]} numberOfLines={1}>
            {value}
          </Text>
        ) : null)}
      {onPress ? <ChevronRight size={20} color={Colors.faint} /> : null}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const BADGE_TONES = {
  primary: { bg: Colors.primary, fg: Colors.onPrimary },
  neutral: { bg: '#EEEEF1', fg: Colors.ink },
  green: { bg: Colors.greenSoft, fg: Colors.green },
  soft: { bg: Colors.primarySoft, fg: Colors.link },
};

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: keyof typeof BADGE_TONES }) {
  const t = BADGE_TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text weight="extrabold" style={[styles.badgeText, { color: t.fg }]}>
        {label}
      </Text>
    </View>
  );
}

/** Round initial for a customer, in alternating soft colours. */
export function Initial({ name, size = 44 }: { name: string; size?: number }) {
  const green = (name.charCodeAt(0) || 0) % 2 === 1;
  return (
    <View
      style={[
        styles.center,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: green ? Colors.greenSoft : Colors.primarySoft },
      ]}>
      <Text weight="extrabold" style={{ fontSize: size * 0.42, color: green ? Colors.green : Colors.link }}>
        {name.trim()[0]?.toUpperCase() ?? '?'}
      </Text>
    </View>
  );
}

export function EmptyState({ pose = 'think', title, text, action }: { pose?: TikoPose; title: string; text: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Tiko pose={pose} size={120} />
      <Text weight="extrabold" style={styles.emptyTitle}>
        {title}
      </Text>
      <Text style={styles.emptyText}>{text}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.4 },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.lg, gap: Spacing.md, flexGrow: 1 },
  footer: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.md, gap: Spacing.sm },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    minHeight: 60,
  },
  topBarCount: { fontSize: 13, color: Colors.muted },
  topBarTitle: { flex: 1, fontSize: 20, letterSpacing: -0.3 },

  title: { fontSize: 28, lineHeight: 34, letterSpacing: -0.5 },
  subtitle: { fontSize: 16, lineHeight: 23, color: Colors.muted, marginTop: -Spacing.sm },
  sectionLabel: { fontSize: 13, color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },

  button: {
    minHeight: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  buttonMd: { minHeight: 48, borderRadius: 14, paddingHorizontal: Spacing.md },
  buttonXl: { minHeight: 64, borderRadius: 18 },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  buttonLabel: { fontSize: 17 },
  buttonLabelMd: { fontSize: 15 },
  buttonLabelXl: { fontSize: 18 },
  link: { fontSize: 15, textDecorationLine: 'underline' },

  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 14, color: Colors.muted },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    minHeight: 56,
  },
  fieldFocused: { borderColor: Colors.primary },
  fieldMultilineWrap: { alignItems: 'flex-start' },
  fieldInput: { flex: 1, fontSize: 17, fontFamily: Font.medium, paddingVertical: 14, color: Colors.ink, outlineWidth: 0 },
  fieldMultiline: { minHeight: 96, textAlignVertical: 'top' },
  fieldHint: { fontSize: 13, color: Colors.muted },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft, borderWidth: 2 },
  chipLabel: { fontSize: 15 },

  checkbox: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#CFCFD6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },

  selectCard: {
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  selectRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: 18 },
  selectTile: { padding: 16, gap: Spacing.md, minHeight: 128 },
  selectTileText: { flex: 1, justifyContent: 'flex-end' },
  selectTileBadge: { position: 'absolute', top: 12, right: 12 },
  selectCardOn: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  selectTitle: { fontSize: 17, lineHeight: 22 },
  selectDescription: { fontSize: 14, lineHeight: 19, color: Colors.muted, marginTop: 2 },

  progressTrack: { backgroundColor: Colors.track, overflow: 'hidden' },

  group: { backgroundColor: Colors.surface, borderRadius: Radius.lg, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 56,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: '#EDEDF0' },
  rowPressed: { backgroundColor: Colors.surfaceMuted },
  rowLabelWrap: { flexShrink: 0, maxWidth: '55%' },
  rowLabel: { fontSize: 16 },
  rowDescription: { fontSize: 14, lineHeight: 19, color: Colors.muted, marginTop: 2 },
  rowValue: { flexShrink: 1, fontSize: 15, color: Colors.muted, textAlign: 'right' },
  rowWarn: { color: Colors.link },

  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.sm },

  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.pill, alignSelf: 'center' },
  badgeText: { fontSize: 13 },

  empty: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl, paddingHorizontal: Spacing.md },
  emptyTitle: { fontSize: 18, textAlign: 'center' },
  emptyText: { fontSize: 15, lineHeight: 22, color: Colors.muted, textAlign: 'center' },
});
