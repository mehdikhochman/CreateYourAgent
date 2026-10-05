import { router } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { STEP_LABELS, getCategory, isStepAnswered, stepSummary, visibleSteps } from '@/data/categories';
import { useAppState } from '@/state/app-state';

/**
 * « Mon assistant »: every answer from the setup stays editable, grouped like
 * a phone's settings (one row per answer, its current value, a chevron).
 */
export default function Settings() {
  const { profile, flash, setFlash, reset } = useAppState();
  const category = getCategory(profile.category);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [flash, setFlash]);

  if (!category) return null;
  const steps = visibleSteps(category, profile);
  const missing = steps.filter((s) => !s.optional && !isStepAnswered(s, profile)).length;

  const restart = () => {
    reset();
    router.dismissAll();
    router.replace('/');
  };

  return (
    <Screen>
      {flash ? (
        <View style={styles.flash} accessibilityLiveRegion="polite">
          <Text style={styles.flashText}>✓ {flash}</Text>
        </View>
      ) : null}

      <View style={styles.header}>
        <Text style={styles.headerEmoji}>{category.emoji}</Text>
        <View style={styles.flex}>
          <Text style={styles.headerName} numberOfLines={1}>
            {profile.name || 'Mon business'}
          </Text>
          <Text style={styles.headerSub}>{category.label}</Text>
        </View>
      </View>

      {missing > 0 ? (
        <Text style={styles.missing}>
          {missing} info{missing > 1 ? 's' : ''} à compléter pour que l’assistant réponde à tout.
        </Text>
      ) : null}

      <Section title="Mon commerce">
        {steps.map((step) => {
          const summary = stepSummary(step, profile);
          return (
            <Row
              key={step.id}
              label={STEP_LABELS[step.id] ?? step.title}
              value={summary || (step.optional ? 'Non renseigné' : 'À compléter')}
              warn={!summary && !step.optional}
              onPress={() => router.push({ pathname: '/edit/[step]', params: { step: step.id } })}
            />
          );
        })}
      </Section>

      <Section title="Ce que l’assistant a appris">
        <Row
          label="Réponses apprises"
          value={profile.faqs.length ? `${profile.faqs.length}` : 'Aucune pour l’instant'}
          onPress={() => router.push('/learned')}
        />
        <Row label="Tester mon assistant" value="" onPress={() => router.push('/test-chat')} />
      </Section>

      <Section title="Compte">
        <Row label="Téléphone" value={profile.ownerPhone || '—'} />
        <Row label="WhatsApp" value={profile.whatsappConnected ? 'Connecté ✅' : 'Non connecté'} />
      </Section>

      <Button label="Recommencer la démo" variant="ghost" onPress={restart} />
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({ label, value, warn, onPress }: { label: string; value: string; warn?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${label}, ${value}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, warn && styles.rowWarn]} numberOfLines={1}>
        {value}
      </Text>
      {onPress ? <Text style={styles.chevron}>›</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flash: { backgroundColor: Colors.greenSoft, borderRadius: Radius.md, padding: Spacing.md },
  flashText: { color: Colors.green, fontWeight: '700', fontSize: 15 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  headerEmoji: { fontSize: 44 },
  headerName: { fontSize: 24, fontWeight: '800', color: Colors.text },
  headerSub: { fontSize: 14, color: Colors.textMuted },
  missing: { fontSize: 14, color: Colors.primaryDark, fontWeight: '600' },
  section: { gap: Spacing.sm },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionBody: { backgroundColor: Colors.surface, borderRadius: Radius.lg, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 15,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rowPressed: { backgroundColor: Colors.border },
  rowLabel: { fontSize: 16, color: Colors.text, fontWeight: '600' },
  rowValue: { flex: 1, textAlign: 'right', fontSize: 15, color: Colors.textMuted },
  rowWarn: { color: Colors.primary, fontWeight: '700' },
  chevron: { fontSize: 22, color: Colors.textMuted },
});
