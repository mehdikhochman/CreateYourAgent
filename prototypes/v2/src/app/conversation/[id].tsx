import { useLocalSearchParams } from 'expo-router';
import { Bell, Hand } from '@/components/icons';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Bubble, ChatHeader, Composer, DayChip, chatStyles } from '@/components/chat';
import { useToast } from '@/components/feedback';
import { Text } from '@/components/text';
import { TikoAvatar } from '@/components/tiko/tiko';
import { Button, Initial, LinkButton } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { newId, nowTime } from '@/lib/ids';
import { useAppState } from '@/state/app-state';
import type { Message } from '@/state/types';

/** One customer's WhatsApp conversation, seen from the owner's phone. */
export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { conversations, updateConversation } = useAppState();
  const toast = useToast();
  const conversation = conversations.find((c) => c.id === id);
  const [input, setInput] = useState('');
  const list = useRef<FlatList<Message>>(null);

  // Opening the conversation marks it as read.
  useEffect(() => {
    if (conversation?.unread) updateConversation(conversation.id, (c) => ({ ...c, unread: false }));
  }, [conversation, updateConversation]);

  const count = conversation?.messages.length ?? 0;
  useEffect(() => {
    const t = setTimeout(() => list.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [count]);

  if (!conversation) return null;

  const setPaused = (aiPaused: boolean) => {
    updateConversation(conversation.id, (c) => ({ ...c, aiPaused }));
    toast(aiPaused ? 'Vous avez la main : Tiko est en pause pour ce client' : 'Tiko reprend la conversation', 'info');
  };

  // Prototype: the message stays in the app. The real version sends it to the
  // customer on WhatsApp through the backend.
  const send = () => {
    const text = input.trim();
    if (!text) return;
    updateConversation(conversation.id, (c) => ({
      ...c,
      needsAttention: false,
      alert: null,
      messages: [...c.messages, { id: newId('m'), role: 'owner', text, time: nowTime() }],
    }));
    setInput('');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ChatHeader
          title={conversation.customerName}
          subtitle={conversation.aiPaused ? 'Vous avez la main' : `Tiko répond · ${conversation.customerPhone}`}
          subtitleColor={conversation.aiPaused ? Colors.green : Colors.muted}
          avatar={<Initial name={conversation.customerName} size={44} />}
        />

        <View style={[styles.mode, conversation.aiPaused && styles.modePaused]}>
          <TikoAvatar pose={conversation.aiPaused ? 'sleep' : 'hello'} size={40} background={Colors.surface} />
          <View style={styles.flex}>
            <Text weight="bold" style={styles.modeTitle}>
              {conversation.aiPaused ? 'Tiko est en pause pour ce client' : 'Tiko répond à ce client'}
            </Text>
            <Text style={styles.modeText}>
              {conversation.aiPaused ? 'Vos messages partent depuis votre WhatsApp.' : 'Prenez la main pour répondre vous-même.'}
            </Text>
          </View>
          {conversation.aiPaused ? <LinkButton label="Rendre la main à Tiko" onPress={() => setPaused(false)} color={Colors.green} /> : null}
        </View>

        {conversation.needsAttention && conversation.alert ? (
          <View style={styles.alert}>
            <Bell size={18} color={Colors.link} strokeWidth={2.4} />
            <Text weight="bold" style={styles.alertText}>
              {conversation.alert.summary}
            </Text>
          </View>
        ) : null}

        <View style={chatStyles.background}>
          <FlatList
            ref={list}
            data={conversation.messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={chatStyles.list}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
            ListHeaderComponent={<DayChip />}
            renderItem={({ item }) =>
              item.role === 'customer' ? (
                <Bubble side="left" text={item.text} time={item.time} />
              ) : (
                <Bubble side="right" text={item.text} time={item.time} ticks="read" author={item.role === 'owner' ? 'Vous' : 'Tiko'} />
              )
            }
          />

          {conversation.aiPaused ? (
            <Composer
              value={input}
              onChange={setInput}
              onSend={send}
              onMic={() => toast('Les messages vocaux arrivent bientôt. Pour l’instant, écrivez.', 'info')}
              placeholder="Votre réponse…"
            />
          ) : (
            <View style={styles.takeover}>
              <Button
                label="Je prends la main"
                icon={<Hand size={20} color={Colors.onPrimary} strokeWidth={2.4} />}
                onPress={() => setPaused(true)}
              />
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: Colors.surface },
  mode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    backgroundColor: Colors.primarySoft,
  },
  modePaused: { backgroundColor: Colors.greenSoft },
  modeTitle: { fontSize: 14 },
  modeText: { fontSize: 13, color: Colors.muted, marginTop: 1 },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    backgroundColor: '#FFF9F0',
    borderBottomWidth: 1,
    borderBottomColor: Colors.primaryLine,
  },
  alertText: { flex: 1, fontSize: 13, color: Colors.link },
  takeover: { paddingHorizontal: Spacing.md, paddingVertical: 10, backgroundColor: '#F5F2EE' },
});
