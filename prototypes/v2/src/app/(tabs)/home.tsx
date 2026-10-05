import { router } from 'expo-router';
import { Bell } from '@/components/icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { BrandMark } from '@/components/brand/logos';
import { Text } from '@/components/text';
import { Tiko } from '@/components/tiko/tiko';
import { Badge, Group, IconButton, Initial, LinkButton, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { weeklyReplies } from '@/data/mock-conversations';
import { useAppState } from '@/state/app-state';

const CHART_HEIGHT = 120;

export default function Home() {
  const { profile, conversations } = useAppState();
  const toHandle = conversations.filter((c) => c.needsAttention);
  const { days, total } = weeklyReplies(conversations);
  const max = Math.max(1, ...days.map((d) => d.value));

  const openInbox = () => router.navigate({ pathname: '/conversations', params: { filter: 'todo' } });

  return (
    <Screen edges={['top']} background={Colors.background} contentStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={styles.hello}>{profile.ownerName ? `Bonjour ${profile.ownerName}` : 'Bonjour'}</Text>
          <Text weight="extrabold" style={styles.business} numberOfLines={1} accessibilityRole="header">
            {profile.name || 'Mon commerce'}
          </Text>
        </View>
        <IconButton
          label={toHandle.length ? `${toHandle.length} client${toHandle.length > 1 ? 's' : ''} à traiter` : 'Notifications'}
          onPress={openInbox}
          background={Colors.surface}
          size={48}>
          <Bell size={24} color={Colors.ink} strokeWidth={2.2} />
          {toHandle.length ? <View style={styles.bellDot} /> : null}
        </IconButton>
      </View>

      <View style={styles.status}>
        <BrandMark brand="whatsapp" size={34} />
        <View style={styles.flex}>
          <Text weight="bold" style={styles.statusTitle}>
            Assistant actif sur WhatsApp
          </Text>
          <Text style={styles.statusText}>Il répond à vos clients en ce moment</Text>
        </View>
        <View style={styles.liveDot} accessibilityLabel="Actif" />
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text weight="bold" style={styles.cardTitle}>
            Réponses de la semaine
          </Text>
          <Text style={styles.cardMeta}>{total} au total</Text>
        </View>
        <View style={styles.chart} accessibilityLabel={`${total} réponses envoyées par Tiko ces 7 derniers jours`}>
          {days.map((d, i) => (
            <View key={i} style={styles.barColumn}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    { height: Math.max(8, (d.value / max) * CHART_HEIGHT), backgroundColor: d.isToday ? Colors.primary : '#FFD9AE' },
                  ]}
                />
              </View>
              <Text weight={d.isToday ? 'extrabold' : 'medium'} style={[styles.barLabel, d.isToday && styles.barLabelToday]}>
                {d.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text weight="extrabold" style={styles.sectionTitle}>
          À traiter
        </Text>
        <LinkButton label="Tout voir" onPress={openInbox} />
      </View>

      {toHandle.length ? (
        <Group>
          {toHandle.map((c, i) => (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              accessibilityLabel={`${c.customerName}, ${c.alert?.summary ?? ''}`}
              onPress={() => router.push({ pathname: '/conversation/[id]', params: { id: c.id } })}
              style={({ pressed }) => [styles.todo, i < toHandle.length - 1 && styles.divider, pressed && styles.pressed]}>
              <Initial name={c.customerName} size={48} />
              <View style={styles.flex}>
                <Text weight="bold" style={styles.todoName} numberOfLines={1}>
                  {c.customerName}
                </Text>
                <Text style={styles.todoSummary} numberOfLines={1}>
                  {c.alert?.summary ?? 'À vérifier'}
                </Text>
              </View>
              <Badge label={c.alert?.kind === 'order' ? 'Commande' : 'Question'} tone={c.alert?.kind === 'order' ? 'primary' : 'neutral'} />
            </Pressable>
          ))}
        </Group>
      ) : (
        <View style={styles.allDone}>
          <Tiko pose="happy" size={72} />
          <View style={styles.flex}>
            <Text weight="bold" style={styles.todoName}>
              Rien à traiter
            </Text>
            <Text style={styles.todoSummary}>Tiko s’occupe de vos clients.</Text>
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { backgroundColor: Colors.surfaceMuted },
  content: { paddingTop: Spacing.md, paddingHorizontal: 20, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  hello: { fontSize: 15, color: Colors.muted },
  business: { fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  bellDot: {
    position: 'absolute',
    top: 11,
    right: 12,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E5484D',
    borderWidth: 1.5,
    borderColor: Colors.surface,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  statusTitle: { fontSize: 16 },
  statusText: { fontSize: 13, color: Colors.muted, marginTop: 1 },
  liveDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.success },
  card: { padding: 16, borderRadius: Radius.lg, backgroundColor: Colors.surface, gap: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  cardTitle: { fontSize: 16 },
  cardMeta: { fontSize: 13, color: Colors.muted },
  chart: { flexDirection: 'row', gap: 8 },
  barColumn: { flex: 1, alignItems: 'center', gap: 10 },
  barTrack: { height: CHART_HEIGHT, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 8 },
  barLabel: { fontSize: 13, color: Colors.muted },
  barLabelToday: { color: Colors.ink },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  sectionTitle: { fontSize: 20, letterSpacing: -0.3 },
  todo: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#EDEDF0' },
  todoName: { fontSize: 16 },
  todoSummary: { fontSize: 14, color: Colors.muted, marginTop: 1 },
  allDone: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: Radius.lg, backgroundColor: Colors.surface },
});
