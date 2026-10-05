import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ChatBubble, Chip, Field, Subtitle, Title } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { ACTIONS, runAction } from '@/lib/mock-assistant';
import type { AssistantAction, BusinessProfile, Faq } from '@/state/types';

export type CorrectionDraft = Pick<Faq, 'question' | 'action' | 'productId' | 'answer'>;
/** A new correction starts with no action chosen; an existing one keeps its own. */
export type CorrectionInitial = Omit<CorrectionDraft, 'action'> & { action?: AssistantAction };

/**
 * "What should the assistant have done?" — the owner picks an action (show
 * the catalogue, give a price…) or writes their own answer, and sees the
 * reply the assistant will send next time.
 */
export function CorrectionSheet({
  visible,
  profile,
  initial,
  onCancel,
  onSave,
}: {
  visible: boolean;
  profile: BusinessProfile;
  initial: CorrectionInitial | null;
  onCancel: () => void;
  onSave: (draft: CorrectionDraft) => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      {initial ? <SheetBody key={initial.question} profile={profile} initial={initial} onCancel={onCancel} onSave={onSave} /> : null}
    </Modal>
  );
}

function SheetBody({
  profile,
  initial,
  onCancel,
  onSave,
}: {
  profile: BusinessProfile;
  initial: CorrectionInitial;
  onCancel: () => void;
  onSave: (draft: CorrectionDraft) => void;
}) {
  const [question, setQuestion] = useState(initial.question);
  const [action, setAction] = useState<AssistantAction | null>(initial.action ?? null);
  const [productId, setProductId] = useState(initial.productId);
  const [answer, setAnswer] = useState(initial.answer);
  const scroll = useRef<ScrollView>(null);

  // Bring the reply preview into view once an action is picked.
  const choose = (a: AssistantAction) => {
    setAction(a);
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80);
  };

  const draft: CorrectionDraft | null = action ? { question, action, productId, answer } : null;
  const ready =
    !!draft &&
    question.trim().length > 0 &&
    (action !== 'custom' || answer.trim().length > 0) &&
    (action !== 'price' || !!productId);
  const preview = ready && draft ? runAction(profile, draft, question) : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Title>Qu’aurait dû faire l’assistant ?</Title>
        <Subtitle>Quand un client écrit :</Subtitle>
        <Field value={question} onChangeText={setQuestion} placeholder="Message du client" />

        <View style={styles.actions}>
          {ACTIONS.map((a) => (
            <Pressable
              key={a.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: action === a.id }}
              onPress={() => choose(a.id)}
              style={[styles.action, action === a.id && styles.actionSelected]}>
              <Text style={styles.actionEmoji}>{a.emoji}</Text>
              <Text style={[styles.actionLabel, action === a.id && styles.actionLabelSelected]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>

        {action === 'price' && (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Quel produit ?</Text>
            {profile.catalog.length ? (
              <View style={styles.chips}>
                {profile.catalog.map((item) => (
                  <Chip key={item.id} label={item.name} selected={productId === item.id} onPress={() => setProductId(item.id)} />
                ))}
              </View>
            ) : (
              <Text style={styles.hint}>Ajoutez d’abord vos produits dans « Mon assistant ».</Text>
            )}
          </View>
        )}

        {action === 'custom' && (
          <Field value={answer} onChangeText={setAnswer} placeholder="Ex : Oui, on livre à Yopougon pour 1 500 F." multiline autoFocus />
        )}

        {preview && (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>La prochaine fois, l’assistant répondra :</Text>
            <ChatBubble role="assistant" text={preview.text} />
            {!preview.confident ? <Text style={styles.hint}>🔔 Et vous recevrez une notification.</Text> : null}
          </View>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <Button label="Enregistrer" onPress={() => draft && onSave({ ...draft, question: question.trim(), answer: answer.trim() })} disabled={!ready} />
        <Button label="Annuler" variant="ghost" onPress={onCancel} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, gap: Spacing.md },
  actions: { gap: Spacing.sm },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: 14,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  actionSelected: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  actionEmoji: { fontSize: 22 },
  actionLabel: { flex: 1, fontSize: 16, color: Colors.text },
  actionLabelSelected: { fontWeight: '700', color: Colors.primaryDark },
  block: { gap: Spacing.sm },
  blockTitle: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  hint: { fontSize: 14, color: Colors.textMuted },
  footer: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.sm },
});
