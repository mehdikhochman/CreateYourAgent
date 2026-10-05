import { router, useLocalSearchParams } from 'expo-router';
import { Bell, Pencil, ThumbsUp } from '@/components/icons';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/brand/logos';
import { Bubble, ChatHeader, Composer, DayChip, NoticeChip, SuggestionChips, TypingBubble, chatStyles } from '@/components/chat';
import { CorrectionSheet, type CorrectionDraft, type CorrectionInitial } from '@/components/correction-sheet';
import { useToast } from '@/components/feedback';
import { Text } from '@/components/text';
import { TikoAvatar } from '@/components/tiko/tiko';
import { Button } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { newId, nowTime } from '@/lib/ids';
import { actionLabel, replyTo, suggestedQuestions, type AssistantReply } from '@/lib/mock-assistant';
import { useAppState } from '@/state/app-state';

type ChatMessage =
  | { id: string; role: 'customer'; text: string; time: string; status: 'delivered' | 'read' }
  | { id: string; role: 'assistant'; text: string; time: string; question: string; alert?: AssistantReply['alert']; rated?: 'up' | 'down' }
  | { id: string; role: 'system'; text: string };

/** Typing time that feels natural for the reply length. */
const typingDelay = (text: string) => Math.min(1800, 700 + text.length * 8);

export default function TestChat() {
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const { profile, updateProfile } = useAppState();
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [correcting, setCorrecting] = useState<CorrectionInitial | null>(null);
  const list = useRef<FlatList<ChatMessage>>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  // Follow the newest message (content size events can fire before the new bubble is laid out).
  useEffect(() => {
    const t = setTimeout(() => list.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [messages, typing]);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const send = (text: string) => {
    const question = text.trim();
    if (!question || typing) return;
    const id = newId('m');
    setMessages((m) => [...m, { id, role: 'customer', text: question, time: nowTime(), status: 'delivered' }]);
    setInput('');
    // The profile passed here includes answers taught earlier in this session.
    const reply = replyTo(profile, question);
    later(() => {
      setMessages((m) => m.map((x) => (x.id === id && x.role === 'customer' ? { ...x, status: 'read' } : x)));
      setTyping(true);
    }, 450);
    later(() => {
      setTyping(false);
      setMessages((m) => [
        ...m,
        { id: newId('m'), role: 'assistant', text: reply.text, time: nowTime(), question, alert: reply.confident ? undefined : reply.alert },
      ]);
    }, 450 + typingDelay(reply.text));
  };

  const rate = (id: string, rating: 'up' | 'down') =>
    setMessages((m) => m.map((x) => (x.id === id && x.role === 'assistant' ? { ...x, rated: rating } : x)));

  const correct = (id: string, question: string) => {
    rate(id, 'down');
    setCorrecting({ question, answer: '' });
  };

  const saveCorrection = (draft: CorrectionDraft) => {
    updateProfile({ faqs: [...profile.faqs, { id: newId('faq'), ...draft, source: 'correction' }] });
    const what = draft.action === 'custom' ? `je répondrai : « ${draft.answer} »` : `je ferai : ${actionLabel(draft.action).toLowerCase()}.`;
    setMessages((m) => [...m, { id: newId('m'), role: 'system', text: `Compris ! Quand on m’écrira « ${draft.question} », ${what}` }]);
    setCorrecting(null);
    toast('Réponse apprise par Tiko');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ChatHeader
          title={profile.name || 'Mon commerce'}
          subtitle="Mode test · vous jouez le client"
          avatar={<TikoAvatar size={44} />}
        />
        <View style={chatStyles.background}>
          <FlatList
            ref={list}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={chatStyles.list}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
            ListHeaderComponent={
              <View style={styles.intro}>
                <DayChip />
                <View style={styles.system}>
                  <TikoAvatar size={36} />
                  <Text style={styles.systemText}>
                    Écrivez comme un client sur WhatsApp. Si une de mes réponses ne vous plaît pas, touchez{' '}
                    <Text weight="bold" style={styles.systemText}>
                      Corriger
                    </Text>{' '}
                    et apprenez-moi la bonne.
                  </Text>
                </View>
              </View>
            }
            ListFooterComponent={typing ? <TypingBubble avatar={<TikoAvatar pose="think" size={32} />} /> : null}
            renderItem={({ item }) => {
              if (item.role === 'customer') {
                return <Bubble side="right" text={item.text} time={item.time} ticks={item.status} />;
              }
              if (item.role === 'system') {
                return (
                  <View style={styles.system} accessibilityLiveRegion="polite">
                    <TikoAvatar pose="wink" size={36} />
                    <Text weight="semibold" style={styles.systemText}>
                      {item.text}
                    </Text>
                  </View>
                );
              }
              return (
                <View style={styles.replyBlock}>
                  <Bubble side="left" text={item.text} time={item.time}>
                    <View style={styles.rating}>
                      {item.rated ? (
                        <Text weight="semibold" style={styles.rated}>
                          {item.rated === 'up' ? 'Bonne réponse notée' : 'Réponse corrigée'}
                        </Text>
                      ) : (
                        <>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => rate(item.id, 'up')}
                            style={({ pressed }) => [styles.rateButton, pressed && styles.pressed]}>
                            <ThumbsUp size={18} color={Colors.ink} strokeWidth={2.2} />
                            <Text weight="bold" style={styles.rateLabel}>
                              Bonne réponse
                            </Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => correct(item.id, item.question)}
                            style={({ pressed }) => [styles.rateButton, pressed && styles.pressed]}>
                            <Pencil size={18} color={Colors.ink} strokeWidth={2.2} />
                            <Text weight="bold" style={styles.rateLabel}>
                              Corriger
                            </Text>
                          </Pressable>
                        </>
                      )}
                    </View>
                  </Bubble>
                  {item.alert ? (
                    <NoticeChip
                      icon={<Bell size={16} color={Colors.link} strokeWidth={2.4} />}
                      text={
                        item.alert.kind === 'order'
                          ? 'Commande : vous recevrez une notification'
                          : 'Question transmise : vous recevrez une notification'
                      }
                    />
                  ) : null}
                </View>
              );
            }}
          />
          <SuggestionChips items={suggestedQuestions(profile)} onPick={send} />
          <Composer
            value={input}
            onChange={setInput}
            onSend={() => send(input)}
            onMic={() => toast('Messages vocaux : bientôt disponibles', 'info')}
            placeholder="Écrivez comme un client…"
          />
          {onboarding ? (
            <View style={styles.footer}>
              <Button
                label="C’est bon, connecter WhatsApp"
                variant="whatsapp"
                icon={<BrandMark brand="whatsapp" size={22} color="#FFFFFF" />}
                onPress={() => router.push('/onboarding/whatsapp')}
              />
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>

      <CorrectionSheet
        visible={!!correcting}
        profile={profile}
        initial={correcting}
        onCancel={() => setCorrecting(null)}
        onSave={saveCorrection}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: Colors.surface },
  pressed: { opacity: 0.75 },
  intro: { gap: 8, marginBottom: 4 },
  system: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'center',
    maxWidth: '94%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
  },
  systemText: { flex: 1, fontSize: 14, lineHeight: 20, color: Colors.ink },
  replyBlock: { gap: 8 },
  rating: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#ECECEF',
  },
  rateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  rateLabel: { fontSize: 14 },
  rated: { fontSize: 13, color: Colors.muted },
  footer: { paddingHorizontal: Spacing.md, paddingTop: 4, paddingBottom: Spacing.sm, backgroundColor: '#F5F2EE' },
});
