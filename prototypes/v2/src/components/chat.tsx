import { router } from 'expo-router';
import { CheckCheck, ChevronLeft, Mic, SendHorizontal } from '@/components/icons';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { RichText, Text } from '@/components/text';
import { Colors, Font, Radius, Spacing } from '@/constants/theme';

/** WhatsApp-like header: back, avatar, name and a status line. */
export function ChatHeader({
  title,
  subtitle,
  subtitleColor = Colors.green,
  avatar,
  right,
  onBack,
}: {
  title: string;
  subtitle?: string;
  subtitleColor?: string;
  avatar?: ReactNode;
  right?: ReactNode;
  onBack?: () => void;
}) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Retour" hitSlop={10} onPress={onBack ?? (() => router.back())} style={styles.back}>
        <ChevronLeft size={28} color={Colors.ink} strokeWidth={2.4} />
      </Pressable>
      {avatar}
      <View style={styles.flex}>
        <Text weight="bold" style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text weight="semibold" style={[styles.headerSubtitle, { color: subtitleColor }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function DayChip({ label = 'Aujourd’hui' }: { label?: string }) {
  return (
    <View style={styles.day}>
      <Text weight="semibold" style={styles.dayText}>
        {label}
      </Text>
    </View>
  );
}

/**
 * One message. `side="right"` is the green « sent » bubble of the phone's
 * owner; `left` is white. Ticks: grey when delivered, blue once read.
 */
export function Bubble({
  side,
  text,
  time,
  ticks,
  author,
  children,
}: {
  side: 'left' | 'right';
  text: string;
  time?: string;
  ticks?: 'delivered' | 'read';
  author?: string;
  children?: ReactNode;
}) {
  const right = side === 'right';
  return (
    <View style={[styles.bubbleRow, right ? styles.rowRight : styles.rowLeft]}>
      <View style={[styles.bubble, right ? styles.bubbleSent : styles.bubbleReceived]}>
        {author ? (
          <Text weight="bold" style={styles.author}>
            {author}
          </Text>
        ) : null}
        <RichText style={styles.bubbleText}>{text}</RichText>
        <View style={styles.meta}>
          {time ? <Text style={styles.time}>{time}</Text> : null}
          {ticks ? (
            <CheckCheck
              size={17}
              color={ticks === 'read' ? Colors.tickRead : Colors.faint}
              strokeWidth={2.2}
              accessibilityLabel={ticks === 'read' ? 'Lu' : 'Distribué'}
            />
          ) : null}
        </View>
        {children}
      </View>
    </View>
  );
}

function Dot({ delay }: { delay: number }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.delay(600 - delay),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay]);
  return (
    <Animated.View
      style={[
        styles.dot,
        {
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }],
        },
      ]}
    />
  );
}

/** « Il écrit… » : three bouncing dots. */
export function TypingBubble({ avatar }: { avatar?: ReactNode }) {
  return (
    <View style={styles.typingRow} accessibilityLabel="L’assistant écrit" accessibilityLiveRegion="polite">
      {avatar}
      <View style={styles.typing}>
        <Dot delay={0} />
        <Dot delay={150} />
        <Dot delay={300} />
      </View>
    </View>
  );
}

/** Small note under a reply (« Commande : vous recevrez une notification »). */
export function NoticeChip({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <View style={styles.notice}>
      {icon}
      <Text weight="bold" style={styles.noticeText}>
        {text}
      </Text>
    </View>
  );
}

export function SuggestionChips({ items, onPick }: { items: string[]; onPick: (q: string) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={styles.suggestionsBar}
      contentContainerStyle={styles.suggestions}>
      {items.map((q) => (
        <Pressable
          key={q}
          accessibilityRole="button"
          accessibilityLabel={`Envoyer : ${q}`}
          onPress={() => onPick(q)}
          style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}>
          <Text weight="bold" style={styles.suggestionText}>
            {q}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** Message box. Shows a mic when empty (voice notes come later) and « send » once there is text. */
export function Composer({
  value,
  onChange,
  onSend,
  onMic,
  placeholder,
}: {
  value: string;
  onChange: (t: string) => void;
  onSend: () => void;
  onMic?: () => void;
  placeholder: string;
}) {
  const empty = !value.trim();
  return (
    <View style={styles.composer}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.faint}
        selectionColor={Colors.green}
        style={styles.input}
        onSubmitEditing={onSend}
        returnKeyType="send"
        submitBehavior="submit"
        accessibilityLabel={placeholder}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={empty ? 'Message vocal' : 'Envoyer'}
        onPress={empty ? onMic : onSend}
        style={({ pressed }) => [styles.send, pressed && styles.pressed]}>
        {empty ? <Mic size={24} color="#FFFFFF" strokeWidth={2.2} /> : <SendHorizontal size={22} color="#FFFFFF" strokeWidth={2.4} />}
      </Pressable>
    </View>
  );
}

export const chatStyles = StyleSheet.create({
  background: { flex: 1, backgroundColor: Colors.chatBackground },
  list: { paddingHorizontal: 12, paddingVertical: Spacing.md, gap: 8, flexGrow: 1 },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEE',
  },
  back: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17 },
  headerSubtitle: { fontSize: 13, marginTop: 1 },

  day: { alignSelf: 'center', backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 4 },
  dayText: { fontSize: 13, color: Colors.muted },

  bubbleRow: { flexDirection: 'row' },
  rowLeft: { justifyContent: 'flex-start', paddingRight: 48 },
  rowRight: { justifyContent: 'flex-end', paddingLeft: 48 },
  bubble: { borderRadius: 18, paddingHorizontal: 12, paddingTop: 9, paddingBottom: 6, maxWidth: '100%' },
  bubbleSent: { backgroundColor: Colors.bubbleSent, borderTopRightRadius: 6 },
  bubbleReceived: { backgroundColor: Colors.bubbleReceived, borderTopLeftRadius: 6 },
  author: { fontSize: 12, color: Colors.green, marginBottom: 2 },
  bubbleText: { fontSize: 16, lineHeight: 22 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 2 },
  time: { fontSize: 12, color: Colors.muted },

  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typing: {
    flexDirection: 'row',
    gap: 5,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#9A9CA3' },

  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: Colors.primarySoft,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  noticeText: { fontSize: 13, color: Colors.link, flexShrink: 1 },

  suggestionsBar: { flexGrow: 0, flexShrink: 0 },
  suggestions: { paddingHorizontal: 12, gap: 8, paddingVertical: 10 },
  suggestion: {
    borderWidth: 1.5,
    borderColor: Colors.primaryLine,
    backgroundColor: Colors.surface,
    borderRadius: Radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  suggestionText: { color: Colors.link, fontSize: 14 },

  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: '#F5F2EE',
  },
  input: {
    flex: 1,
    minHeight: 46,
    borderRadius: 23,
    paddingHorizontal: 18,
    paddingVertical: 11,
    fontSize: 16,
    fontFamily: Font.medium,
    color: Colors.ink,
    backgroundColor: Colors.surface,
    outlineWidth: 0,
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
