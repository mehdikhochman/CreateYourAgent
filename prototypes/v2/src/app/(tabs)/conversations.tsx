import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { plain, Text } from '@/components/text';
import { Badge, Chip, EmptyState, Group, Initial, Screen } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAppState } from '@/state/app-state';
import type { Conversation } from '@/state/types';

type Filter = 'all' | 'todo' | 'mine';

const FILTERS: { id: Filter; label: string; test: (c: Conversation) => boolean }[] = [
  { id: 'all', label: 'Toutes', test: () => true },
  { id: 'todo', label: 'À traiter', test: (c) => c.needsAttention },
  { id: 'mine', label: 'Vous avez la main', test: (c) => c.aiPaused },
];

const EMPTY: Record<Filter, { title: string; text: string }> = {
  all: { title: 'Pas encore de messages', text: 'Quand un client écrit sur WhatsApp, la conversation s’affiche ici.' },
  todo: { title: 'Rien à traiter', text: 'Tiko a répondu à tout le monde.' },
  mine: {
    title: 'Vous ne répondez à aucun client',
    text: 'Ouvrez une conversation et touchez « Je prends la main » pour répondre vous-même.',
  },
};

/** Every WhatsApp conversation, newest first; the owner can open one and take over. */
export default function Conversations() {
  const params = useLocalSearchParams<{ filter?: Filter }>();
  const { conversations } = useAppState();
  const [filter, setFilter] = useState<Filter>(params.filter ?? 'all');
  // « Tout voir » on the home tab opens this tab on « À traiter ».
  const [lastParam, setLastParam] = useState(params.filter);
  if (params.filter !== lastParam) {
    setLastParam(params.filter);
    if (params.filter) setFilter(params.filter);
  }

  const shown = conversations.filter(FILTERS.find((f) => f.id === filter)!.test);

  return (
    <Screen edges={['top']} background={Colors.background} contentStyle={styles.content}>
      <Text weight="extrabold" style={styles.title} accessibilityRole="header">
        Conversations
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersBar} contentContainerStyle={styles.filters}>
        {FILTERS.map((f) => {
          const count = conversations.filter(f.test).length;
          return (
            <Chip
              key={f.id}
              label={f.id === 'all' ? f.label : `${f.label} (${count})`}
              selected={filter === f.id}
              onPress={() => setFilter(f.id)}
            />
          );
        })}
      </ScrollView>

      {shown.length ? (
        <Group>
          {shown.map((c, i) => {
            const last = c.messages[c.messages.length - 1];
            const who = last?.role === 'assistant' ? 'Tiko : ' : last?.role === 'owner' ? 'Vous : ' : '';
            return (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityLabel={`${c.customerName}${c.unread ? ', non lu' : ''}`}
                onPress={() => router.push({ pathname: '/conversation/[id]', params: { id: c.id } })}
                style={({ pressed }) => [styles.row, i < shown.length - 1 && styles.divider, pressed && styles.pressed]}>
                <Initial name={c.customerName} size={50} />
                <View style={styles.flex}>
                  <View style={styles.rowTop}>
                    <Text weight="bold" style={styles.name} numberOfLines={1}>
                      {c.customerName}
                    </Text>
                    <Text weight={c.unread ? 'bold' : 'medium'} style={[styles.time, c.unread && styles.timeUnread]}>
                      {last?.time}
                    </Text>
                  </View>
                  <View style={styles.rowBottom}>
                    <Text style={styles.preview} numberOfLines={1}>
                      {who}
                      {last ? plain(last.text).replace(/\n+/g, ' ') : ''}
                    </Text>
                    {c.unread ? <View style={styles.unread} accessibilityLabel="Non lu" /> : null}
                  </View>
                  {c.needsAttention || c.aiPaused ? (
                    <View style={styles.badges}>
                      {c.needsAttention ? (
                        <Badge label={c.alert?.kind === 'order' ? 'Commande' : 'Question'} tone={c.alert?.kind === 'order' ? 'primary' : 'neutral'} />
                      ) : null}
                      {c.aiPaused ? <Badge label="Vous avez la main" tone="green" /> : null}
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </Group>
      ) : (
        <EmptyState pose={filter === 'todo' ? 'happy' : 'sleep'} title={EMPTY[filter].title} text={EMPTY[filter].text} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: Spacing.md, paddingHorizontal: 20, gap: 14 },
  title: { fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  filtersBar: { flexGrow: 0, flexShrink: 0 },
  filters: { gap: 8, alignItems: 'center' },
  row: { flexDirection: 'row', gap: 14, paddingVertical: 14, paddingHorizontal: 16 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#EDEDF0' },
  pressed: { backgroundColor: Colors.surfaceMuted },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 16 },
  time: { fontSize: 12, color: Colors.muted },
  timeUnread: { color: Colors.green },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  preview: { flex: 1, fontSize: 14, color: Colors.muted },
  unread: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.success },
  badges: { flexDirection: 'row', gap: 6, marginTop: 8 },
});
