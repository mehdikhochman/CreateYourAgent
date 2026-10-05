import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatBubble } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { newId, nowTime } from '@/lib/ids';
import { useAppState } from '@/state/app-state';

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { conversations, updateConversation } = useAppState();
  const conversation = conversations.find((c) => c.id === id);
  const [input, setInput] = useState('');

  // Opening the conversation marks it as read.
  useEffect(() => {
    if (conversation?.unread) updateConversation(conversation.id, (c) => ({ ...c, unread: false }));
  }, [conversation, updateConversation]);

  if (!conversation) return null;

  const setPaused = (aiPaused: boolean) =>
    updateConversation(conversation.id, (c) => ({ ...c, aiPaused, needsAttention: aiPaused ? false : c.needsAttention }));

  // Prototype: the message stays in the app. The real version sends it to the
  // customer on WhatsApp through the backend.
  const send = () => {
    const text = input.trim();
    if (!text) return;
    updateConversation(conversation.id, (c) => ({
      ...c,
      needsAttention: false,
      messages: [...c.messages, { id: newId('m'), role: 'owner', text, time: nowTime() }],
    }));
    setInput('');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: conversation.customerName }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
        <View style={[styles.takeover, conversation.aiPaused && styles.takeoverOn]}>
          <View style={styles.flex}>
            <Text style={styles.takeoverTitle}>{conversation.aiPaused ? '👤 Vous avez la main' : '🤖 L’assistant répond'}</Text>
            <Text style={styles.takeoverText}>
              {conversation.aiPaused
                ? 'L’assistant est en pause pour ce client.'
                : 'Activez pour répondre vous-même à ce client.'}
            </Text>
          </View>
          <Switch
            accessibilityLabel="Je prends la main"
            value={conversation.aiPaused}
            onValueChange={setPaused}
            trackColor={{ true: Colors.green, false: Colors.border }}
          />
        </View>

        <FlatList
          data={conversation.messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={<Text style={styles.phone}>{conversation.customerPhone}</Text>}
          renderItem={({ item }) => <ChatBubble text={item.text} role={item.role} time={item.time} />}
        />

        {conversation.aiPaused ? (
          <View style={styles.composer}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Votre réponse…"
              placeholderTextColor={Colors.textMuted}
              style={styles.input}
              onSubmitEditing={send}
              returnKeyType="send"
            />
            <Pressable
              accessibilityLabel="Envoyer"
              onPress={send}
              disabled={!input.trim()}
              style={[styles.sendButton, !input.trim() && styles.sendDisabled]}>
              <Text style={styles.sendIcon}>➤</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.takeoverButton} onPress={() => setPaused(true)}>
            <Text style={styles.takeoverButtonText}>Je prends la main</Text>
          </Pressable>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: Colors.background },
  takeover: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    margin: Spacing.md,
    marginBottom: 0,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
  },
  takeoverOn: { backgroundColor: Colors.greenSoft },
  takeoverTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  takeoverText: { fontSize: 13, color: Colors.textMuted },
  list: { padding: Spacing.md },
  phone: { textAlign: 'center', fontSize: 12, color: Colors.textMuted, marginBottom: Spacing.sm },
  composer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
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
    backgroundColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
  sendIcon: { color: '#fff', fontSize: 20 },
  takeoverButton: {
    margin: Spacing.md,
    minHeight: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  takeoverButtonText: { fontSize: 16, fontWeight: '700', color: Colors.green },
});
