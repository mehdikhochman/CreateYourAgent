import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { getCategory } from '@/data/categories';
import { useAppState } from '@/state/app-state';

export default function Home() {
  const { profile, conversations, reset } = useAppState();
  const category = getCategory(profile.category);

  const answered = conversations.reduce((n, c) => n + c.messages.filter((m) => m.role === 'assistant').length, 0);
  const attention = conversations.filter((c) => c.needsAttention).length;
  const sorted = [...conversations].sort((a, b) => Number(b.needsAttention) - Number(a.needsAttention));

  const restart = () => {
    reset();
    router.replace('/');
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={styles.hello}>Bonjour 👋🏾</Text>
          <Text style={styles.business} numberOfLines={1}>
            {category?.emoji} {profile.name || 'Mon business'}
          </Text>
        </View>
        <View style={styles.status}>
          <View style={styles.dot} />
          <Text style={styles.statusText}>Assistant actif</Text>
        </View>
      </View>

      <View style={styles.stats}>
        <Card style={styles.stat}>
          <Text style={styles.statValue}>{answered}</Text>
          <Text style={styles.statLabel}>réponses envoyées</Text>
        </Card>
        <Card style={styles.stat}>
          <Text style={styles.statValue}>{conversations.length}</Text>
          <Text style={styles.statLabel}>clients servis</Text>
        </Card>
        <Card style={styles.stat}>
          <Text style={styles.statValue}>~{Math.max(1, Math.round(answered * 1.5))} min</Text>
          <Text style={styles.statLabel}>gagnées</Text>
        </Card>
      </View>

      {attention > 0 && (
        <View style={styles.alert}>
          <Text style={styles.alertText}>
            🔔 {attention} client{attention > 1 ? 's ont' : ' a'} besoin de vous
          </Text>
        </View>
      )}

      <Text style={styles.section}>Conversations WhatsApp</Text>
      <View style={styles.list}>
        {sorted.map((c) => {
          const last = c.messages[c.messages.length - 1];
          return (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/conversation/[id]', params: { id: c.id } })}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{c.customerName[0]}</Text>
              </View>
              <View style={styles.flex}>
                <View style={styles.rowTop}>
                  <Text style={styles.name}>{c.customerName}</Text>
                  <Text style={styles.time}>{last?.time}</Text>
                </View>
                <Text style={styles.preview} numberOfLines={1}>
                  {last?.role === 'customer' ? '' : last?.role === 'owner' ? 'Vous : ' : '🤖 '}
                  {last?.text}
                </Text>
                {c.needsAttention ? <Text style={styles.badge}>À traiter</Text> : null}
                {c.aiPaused ? <Text style={styles.badgePaused}>Vous avez la main</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.actions}>
        <Button label="Tester mon assistant" icon="💬" variant="secondary" onPress={() => router.push('/test-chat')} />
        <Button label="Recommencer la démo" variant="ghost" onPress={restart} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  hello: { fontSize: 15, color: Colors.textMuted },
  business: { fontSize: 24, fontWeight: '800', color: Colors.text },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.greenSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.green },
  statusText: { fontSize: 12, fontWeight: '700', color: Colors.green },
  stats: { flexDirection: 'row', gap: Spacing.sm },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: Spacing.md },
  statValue: { fontSize: 20, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },
  alert: { backgroundColor: Colors.primarySoft, borderRadius: Radius.md, padding: Spacing.md },
  alertText: { fontSize: 15, fontWeight: '700', color: Colors.primaryDark },
  section: { fontSize: 17, fontWeight: '800', color: Colors.text, marginTop: Spacing.sm },
  list: { gap: 2 },
  row: { flexDirection: 'row', gap: Spacing.md, paddingVertical: 12, paddingHorizontal: 4, borderRadius: Radius.md },
  rowPressed: { backgroundColor: Colors.surface },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '800', color: Colors.primaryDark },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between' },
  name: { fontSize: 16, fontWeight: '700', color: Colors.text },
  time: { fontSize: 12, color: Colors.textMuted },
  preview: { fontSize: 14, color: Colors.textMuted, marginTop: 2 },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  badgePaused: {
    alignSelf: 'flex-start',
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: Colors.green,
    backgroundColor: Colors.greenSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  actions: { gap: Spacing.sm, marginTop: Spacing.md },
});
