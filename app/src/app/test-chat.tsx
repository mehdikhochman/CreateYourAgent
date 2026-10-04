import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ChatBubble, Field, Subtitle, Title } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { newId, nowTime } from '@/lib/ids';
import { replyTo, suggestedQuestions } from '@/lib/mock-assistant';
import { useAppState } from '@/state/app-state';
import type { Message } from '@/state/types';

type ChatMessage = Message & { question?: string; rated?: 'up' | 'down' };

export default function TestChat() {
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const { profile, updateProfile } = useAppState();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [correcting, setCorrecting] = useState<ChatMessage | null>(null);
  const [correction, setCorrection] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const send = (text: string) => {
    const question = text.trim();
    if (!question) return;
    // The profile passed here includes FAQs taught earlier in this session.
    const reply = replyTo(profile, question);
    setMessages((m) => [
      ...m,
      { id: newId('m'), role: 'customer', text: question, time: nowTime() },
      {
        id: newId('m'),
        role: 'assistant',
        text: reply.confident ? reply.text : `${reply.text}\n\n🔔 Vous recevrez une notification.`,
        time: nowTime(),
        question,
      },
    ]);
    setInput('');
  };

  const rate = (msg: ChatMessage, rating: 'up' | 'down') => {
    setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, rated: rating } : x)));
    if (rating === 'down') {
      setCorrection('');
      setCorrecting(msg);
    }
  };

  const saveCorrection = () => {
    if (!correcting?.question || !correction.trim()) return;
    updateProfile({
      faqs: [
        ...profile.faqs,
        { id: newId('faq'), question: correcting.question, answer: correction.trim(), source: 'correction' },
      ],
    });
    setMessages((m) => [
      ...m,
      {
        id: newId('m'),
        role: 'owner',
        text: `✅ Compris ! La prochaine fois je répondrai :\n« ${correction.trim()} »`,
        time: nowTime(),
      },
    ]);
    setCorrecting(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListHeaderComponent={
            <View style={styles.intro}>
              <Text style={styles.introTitle}>Mettez-vous à la place d’un client 👇🏾</Text>
              <Text style={styles.introText}>
                Posez une question comme sur WhatsApp. Si une réponse ne vous plaît pas, touchez 👎🏾 et apprenez-lui la bonne.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <ChatBubble
              text={item.text}
              role={item.role}
              time={item.time}
              footer={
                item.role === 'assistant' && item.question ? (
                  <View style={styles.rating}>
                    {item.rated ? (
                      <Text style={styles.rated}>{item.rated === 'up' ? '👍🏾 Bonne réponse' : '👎🏾 Corrigée'}</Text>
                    ) : (
                      <>
                        <Pressable accessibilityLabel="Bonne réponse" hitSlop={8} onPress={() => rate(item, 'up')}>
                          <Text style={styles.ratingIcon}>👍🏾</Text>
                        </Pressable>
                        <Pressable accessibilityLabel="Mauvaise réponse" hitSlop={8} onPress={() => rate(item, 'down')}>
                          <Text style={styles.ratingIcon}>👎🏾</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                ) : null
              }
            />
          )}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestionsBar} contentContainerStyle={styles.suggestions} keyboardShouldPersistTaps="handled">
          {suggestedQuestions(profile).map((q) => (
            <Pressable key={q} onPress={() => send(q)} style={styles.suggestion}>
              <Text style={styles.suggestionText}>{q}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Écrivez comme un client…"
            placeholderTextColor={Colors.textMuted}
            style={styles.input}
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
          />
          <Pressable
            accessibilityLabel="Envoyer"
            onPress={() => send(input)}
            style={[styles.sendButton, !input.trim() && styles.sendDisabled]}
            disabled={!input.trim()}>
            <Text style={styles.sendIcon}>➤</Text>
          </Pressable>
        </View>

        {onboarding ? (
          <View style={styles.footer}>
            <Button label="C’est bon, connecter WhatsApp" variant="whatsapp" onPress={() => router.push('/onboarding/whatsapp')} />
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <Modal visible={!!correcting} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCorrecting(null)}>
        <SafeAreaView style={styles.modal}>
          <Title>Quelle est la bonne réponse ?</Title>
          <Subtitle>Question du client : « {correcting?.question} »</Subtitle>
          <Field
            value={correction}
            onChangeText={setCorrection}
            placeholder="Ex : Oui, on livre à Yopougon pour 1 500 F."
            multiline
            autoFocus
          />
          <Button label="Enregistrer" onPress={saveCorrection} disabled={!correction.trim()} />
          <Button label="Annuler" variant="ghost" onPress={() => setCorrecting(null)} />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: Colors.background },
  list: { padding: Spacing.md, flexGrow: 1 },
  intro: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, gap: 4, marginBottom: Spacing.md },
  introTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  introText: { fontSize: 14, color: Colors.textMuted, lineHeight: 20 },
  rating: { flexDirection: 'row', gap: Spacing.md, marginTop: 4 },
  ratingIcon: { fontSize: 20 },
  rated: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  suggestionsBar: { flexGrow: 0, flexShrink: 0 },
  suggestions: { paddingHorizontal: Spacing.md, gap: Spacing.sm, paddingVertical: Spacing.sm },
  suggestion: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: Radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  suggestionText: { color: Colors.primaryDark, fontWeight: '600', fontSize: 14 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
  sendIcon: { color: '#fff', fontSize: 20 },
  footer: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  modal: { flex: 1, padding: Spacing.lg, gap: Spacing.md, backgroundColor: Colors.background },
});
