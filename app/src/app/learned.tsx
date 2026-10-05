import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CorrectionSheet, type CorrectionDraft, type CorrectionInitial } from '@/components/correction-sheet';
import { Button, Screen, Subtitle } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { newId } from '@/lib/ids';
import { actionLabel } from '@/lib/mock-assistant';
import { useAppState } from '@/state/app-state';

/**
 * Everything the owner taught the assistant, editable and removable — the
 * same idea as Dify's "annotation replies" and Chatbase's Q&A list.
 */
export default function Learned() {
  const { profile, updateProfile } = useAppState();
  const [editing, setEditing] = useState<{ id: string | null; initial: CorrectionInitial } | null>(null);

  const save = (draft: CorrectionDraft) => {
    const id = editing?.id;
    const faqs = id
      ? profile.faqs.map((f) => (f.id === id ? { ...f, ...draft } : f))
      : [...profile.faqs, { id: newId('faq'), ...draft, source: 'manual' as const }];
    updateProfile({ faqs });
    setEditing(null);
  };

  const remove = (id: string) => updateProfile({ faqs: profile.faqs.filter((f) => f.id !== id) });

  return (
    <Screen
      footer={<Button label="Ajouter une réponse" icon="＋" variant="secondary" onPress={() => setEditing({ id: null, initial: { question: '', answer: '' } })} />}>
      <Subtitle>
        Quand un client écrit l’une de ces phrases (ou presque), l’assistant fait ce que vous avez choisi.
      </Subtitle>

      {profile.faqs.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🎓</Text>
          <Text style={styles.emptyText}>
            Rien pour l’instant. Dans « Tester mon assistant », touchez 👎🏾 sur une mauvaise réponse pour lui apprendre la bonne.
          </Text>
        </View>
      ) : (
        profile.faqs.map((f) => (
          <Pressable key={f.id} onPress={() => setEditing({ id: f.id, initial: f })} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
            <View style={styles.flex}>
              <Text style={styles.question}>« {f.question} »</Text>
              <Text style={styles.answer} numberOfLines={2}>
                → {f.action === 'custom' ? f.answer : actionLabel(f.action)}
                {f.action === 'price' ? ` : ${profile.catalog.find((i) => i.id === f.productId)?.name ?? '?'}` : ''}
              </Text>
            </View>
            <Pressable accessibilityLabel={`Supprimer « ${f.question} »`} hitSlop={10} onPress={() => remove(f.id)}>
              <Text style={styles.remove}>✕</Text>
            </Pressable>
          </Pressable>
        ))
      )}

      <CorrectionSheet
        visible={!!editing}
        profile={profile}
        initial={editing?.initial ?? null}
        onCancel={() => setEditing(null)}
        onSave={save}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  empty: { alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xl, paddingHorizontal: Spacing.md },
  emptyEmoji: { fontSize: 44 },
  emptyText: { fontSize: 15, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
  },
  cardPressed: { backgroundColor: Colors.border },
  question: { fontSize: 16, fontWeight: '700', color: Colors.text },
  answer: { fontSize: 14, color: Colors.textMuted, marginTop: 4 },
  remove: { fontSize: 16, color: Colors.textMuted },
});
