import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';

/** Page wrapper: safe area, keyboard handling, optional sticky footer (main button). */
export function Screen({
  children,
  footer,
  scroll = true,
  edges = ['bottom'],
}: {
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  edges?: ('top' | 'bottom')[];
}) {
  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, styles.content]}>{children}</View>
        )}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Subtitle({ children }: { children: ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'whatsapp';
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${variant}`],
        isDisabled && styles.buttonDisabled,
        pressed && !isDisabled && styles.buttonPressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'whatsapp' ? '#fff' : Colors.primary} />
      ) : (
        <Text style={[styles.buttonLabel, styles[`buttonLabel_${variant}`]]}>
          {icon ? `${icon}  ` : ''}
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  emoji,
  selected,
  onPress,
}: {
  label: string;
  emoji?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
        {emoji ? `${emoji} ` : ''}
        {label}
      </Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label?: string; prefix?: string }) {
  const { label, prefix, style, ...rest } = props;
  return (
    <View style={styles.fieldWrap}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View style={styles.field}>
        {prefix ? <Text style={styles.fieldPrefix}>{prefix}</Text> : null}
        <TextInput
          placeholderTextColor={Colors.textMuted}
          style={[styles.fieldInput, rest.multiline && styles.fieldMultiline, style]}
          {...rest}
        />
      </View>
    </View>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }]} />
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ChatBubble({
  text,
  role,
  time,
  footer,
}: {
  text: string;
  role: 'customer' | 'assistant' | 'owner';
  time?: string;
  footer?: ReactNode;
}) {
  const isCustomer = role === 'customer';
  return (
    <View style={[styles.bubbleRow, isCustomer ? styles.bubbleRowLeft : styles.bubbleRowRight]}>
      <View
        style={[
          styles.bubble,
          isCustomer ? styles.bubbleCustomer : styles.bubbleAssistant,
          role === 'owner' && styles.bubbleOwner,
        ]}>
        {role !== 'customer' ? (
          <Text style={styles.bubbleAuthor}>{role === 'owner' ? '👤 Vous' : '🤖 Assistant'}</Text>
        ) : null}
        <Text style={styles.bubbleText}>{text}</Text>
        {time ? <Text style={styles.bubbleTime}>{time}</Text> : null}
        {footer}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, gap: Spacing.md, flexGrow: 1 },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
    backgroundColor: Colors.background,
  },
  title: { fontSize: 26, fontWeight: '800', color: Colors.text, lineHeight: 32 },
  subtitle: { fontSize: 16, color: Colors.textMuted, lineHeight: 22 },

  button: {
    minHeight: 56,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  button_primary: { backgroundColor: Colors.primary },
  button_whatsapp: { backgroundColor: Colors.whatsapp },
  button_secondary: { backgroundColor: Colors.primarySoft },
  button_ghost: { backgroundColor: 'transparent' },
  buttonDisabled: { opacity: 0.4 },
  buttonPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  buttonLabel: { fontSize: 17, fontWeight: '700' },
  buttonLabel_primary: { color: '#fff' },
  buttonLabel_whatsapp: { color: '#fff' },
  buttonLabel_secondary: { color: Colors.primaryDark },
  buttonLabel_ghost: { color: Colors.textMuted },

  chip: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  chipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  chipLabel: { fontSize: 16, color: Colors.text },
  chipLabelSelected: { color: Colors.primaryDark, fontWeight: '700' },

  fieldWrap: { gap: Spacing.xs },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.background,
  },
  fieldPrefix: { fontSize: 18, color: Colors.text, marginRight: Spacing.sm, fontWeight: '600' },
  fieldInput: { flex: 1, fontSize: 18, paddingVertical: 14, color: Colors.text },
  fieldMultiline: { minHeight: 90, textAlignVertical: 'top' },

  progressTrack: { height: 6, borderRadius: 3, backgroundColor: Colors.surface, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: Colors.primary },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },

  bubbleRow: { flexDirection: 'row', marginVertical: 4 },
  bubbleRowLeft: { justifyContent: 'flex-start' },
  bubbleRowRight: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '82%', borderRadius: Radius.md, padding: 12, gap: 4 },
  bubbleCustomer: { backgroundColor: Colors.bubbleCustomer, borderTopLeftRadius: 4 },
  bubbleAssistant: { backgroundColor: Colors.bubbleAssistant, borderTopRightRadius: 4 },
  bubbleOwner: { backgroundColor: Colors.greenSoft },
  bubbleAuthor: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  bubbleText: { fontSize: 16, color: Colors.text, lineHeight: 22 },
  bubbleTime: { fontSize: 11, color: Colors.textMuted, alignSelf: 'flex-end' },
});
