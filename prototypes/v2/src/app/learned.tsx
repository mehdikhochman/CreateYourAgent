import { router } from 'expo-router';
import { Plus, Trash2 } from '@/components/icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CorrectionSheet, type CorrectionDraft, type CorrectionInitial } from '@/components/correction-sheet';
import { useToast } from '@/components/feedback';
import { Text } from '@/components/text';
import { Button, EmptyState, Group, Screen, Subtitle, TopBar } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { newId } from '@/lib/ids';
import { actionLabel } from '@/lib/mock-assistant';
import { useAppState } from '@/state/app-state';
import type { Faq } from '@/state/types';

/**
 * Everything the owner taught Tiko, editable and removable — the same idea
 * as Dify's "annotation replies" and Chatbase's Q&A list.
 */
export default function Learned() {
  const { profile, updateProfile } = useAppState();
  const toast = useToast();
  const [editing, setEditing] = useState<{ id: string | null; initial: CorrectionInitial } | null>(null);

  const save = (draft: CorrectionDraft) => {
    const id = editing?.id;
    const faqs = id
      ? profile.faqs.map((f) => (f.id === id ? { ...f, ...draft } : f))
      : [...profile.faqs, { id: newId('faq'), ...draft, source: 'manual' as const }];
    updateProfile({ faqs });
    setEditing(null);
    toast(id ? 'Réponse modifiée' : 'Tiko a appris cette réponse');
  };

  const remove = (faq: Faq) => {
    const before = profile.faqs;
    updateProfile({ faqs: before.filter((f) => f.id !== faq.id) });
    // One tap on the bin deletes: offer a way back.
    toast('Réponse supprimée', 'info', { label: 'Annuler', onPress: () => updateProfile({ faqs: before }) });
  };

  const what = (f: Faq) =>
    f.action === 'custom'
      ? f.answer
      : f.action === 'price'
        ? `${actionLabel(f.action, profile.category)} : ${profile.catalog.find((i) => i.id === f.productId)?.name ?? '?'}`
        : actionLabel(f.action, profile.category);

  return (
    <Screen
      background={Colors.background}
      header={<TopBar title="Réponses apprises" background={Colors.background} />}
      footer={
        <Button
          label="Ajouter une réponse"
          variant="secondary"
          icon={<Plus size={20} color={Colors.ink} strokeWidth={2.6} />}
          onPress={() => setEditing({ id: null, initial: { question: '', answer: '' } })}
        />
      }>
      <Subtitle>Quand un client écrit l’une de ces phrases (ou presque), Tiko fait ce que vous avez choisi.</Subtitle>

      {profile.faqs.length === 0 ? (
        <EmptyState
          pose="wink"
          title="Rien pour l’instant"
          text="Testez Tiko et touchez « Corriger » sur une mauvaise réponse pour lui apprendre la bonne."
          action={<Button label="Tester Tiko" size="md" onPress={() => router.push('/test-chat')} style={styles.emptyButton} />}
        />
      ) : (
        <Group style={styles.list}>
          {profile.faqs.map((f, i) => (
            <Pressable
              key={f.id}
              accessibilityRole="button"
              accessibilityLabel={`Modifier : ${f.question}`}
              onPress={() => setEditing({ id: f.id, initial: f })}
              style={({ pressed }) => [styles.item, i < profile.faqs.length - 1 && styles.divider, pressed && styles.pressed]}>
              <View style={styles.flex}>
                <Text weight="bold" style={styles.question}>
                  « {f.question} »
                </Text>
                <Text style={styles.answer} numberOfLines={2}>
                  {what(f)}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Supprimer « ${f.question} »`}
                hitSlop={10}
                onPress={() => remove(f)}
                style={styles.remove}>
                <Trash2 size={20} color={Colors.muted} strokeWidth={2.2} />
              </Pressable>
            </Pressable>
          ))}
        </Group>
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
  list: { marginTop: Spacing.xs },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingLeft: 16, paddingRight: 8 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#EDEDF0' },
  pressed: { backgroundColor: Colors.surfaceMuted },
  question: { fontSize: 15 },
  answer: { fontSize: 14, color: Colors.muted, marginTop: 3 },
  remove: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  emptyButton: { marginTop: Spacing.sm, alignSelf: 'center' },
});
