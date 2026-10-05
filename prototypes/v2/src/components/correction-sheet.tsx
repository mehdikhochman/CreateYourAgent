import { Check, List, PencilLine, ShoppingBag, Tag, Truck, UserCheck, Wallet, type LucideIcon } from '@/components/icons';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { RichText, Text } from '@/components/text';
import { Button, Chip, Field } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { ACTIONS, runAction } from '@/lib/mock-assistant';
import type { AssistantAction, BusinessProfile, Faq } from '@/state/types';

export type CorrectionDraft = Pick<Faq, 'question' | 'action' | 'productId' | 'answer'>;
/** A new correction starts with no action chosen; an existing one keeps its own. */
export type CorrectionInitial = Omit<CorrectionDraft, 'action'> & { action?: AssistantAction };

const ACTION_ICONS: Record<AssistantAction, LucideIcon> = {
  catalog: List,
  price: Tag,
  delivery: Truck,
  payment: Wallet,
  order: ShoppingBag,
  handoff: UserCheck,
  custom: PencilLine,
};

/**
 * « Qu’aurait dû faire l’assistant ? » — the owner picks an action (show the
 * catalogue, give a price…) or writes their own answer, and sees the reply
 * the assistant will send next time.
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
  // Keep the last content while the sheet slides away.
  const [shown, setShown] = useState<CorrectionInitial | null>(initial);
  if (initial && initial !== shown) setShown(initial);

  return (
    <BottomSheet visible={visible} onClose={onCancel}>
      {shown ? (
        <SheetBody key={`${shown.question}-${shown.action ?? ''}`} profile={profile} initial={shown} onSave={onSave} />
      ) : null}
    </BottomSheet>
  );
}

function SheetBody({
  profile,
  initial,
  onSave,
}: {
  profile: BusinessProfile;
  initial: CorrectionInitial;
  onSave: (draft: CorrectionDraft) => void;
}) {
  const [question, setQuestion] = useState(initial.question);
  const [action, setAction] = useState<AssistantAction | null>(initial.action ?? null);
  const [productId, setProductId] = useState(initial.productId);
  const [answer, setAnswer] = useState(initial.answer);
  const scroll = useRef<ScrollView>(null);
  // A question written by the owner (new learned answer) is editable; one from the chat is shown as sent.
  const askQuestion = !initial.question;

  const choose = (a: AssistantAction) => {
    setAction(a);
    // Bring the reply preview into view.
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 120);
  };

  const draft: CorrectionDraft | null = action ? { question, action, productId, answer } : null;
  const ready =
    !!draft &&
    question.trim().length > 0 &&
    (action !== 'custom' || answer.trim().length > 0) &&
    (action !== 'price' || !!productId);
  const preview = ready && draft ? runAction(profile, draft, question) : null;

  return (
    <View style={styles.flex}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Text weight="extrabold" style={styles.title} accessibilityRole="header">
          Qu’aurait dû faire l’assistant ?
        </Text>
        {askQuestion ? (
          <Field label="Quand un client écrit" value={question} onChangeText={setQuestion} placeholder="Ex : Vous livrez à Bingerville ?" autoFocus />
        ) : (
          <View style={styles.quote}>
            <Text weight="semibold" style={styles.quoteText}>
              « {question} »
            </Text>
          </View>
        )}

        <View style={styles.actions} accessibilityRole="radiogroup">
          {ACTIONS.map((a) => {
            const on = action === a.id;
            const Icon = ACTION_ICONS[a.id];
            return (
              <Pressable
                key={a.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={a.label}
                onPress={() => choose(a.id)}
                style={({ pressed }) => [styles.action, on && styles.actionOn, pressed && styles.pressed]}>
                <Icon size={22} color={Colors.ink} strokeWidth={2} />
                <Text weight={on ? 'bold' : 'semibold'} style={styles.actionLabel}>
                  {a.label}
                </Text>
                {on ? <Check size={20} color={Colors.ink} strokeWidth={3} /> : null}
              </Pressable>
            );
          })}
        </View>

        {action === 'price' ? (
          <View style={styles.block}>
            <Text weight="bold" style={styles.blockTitle}>
              Quel produit ?
            </Text>
            {profile.catalog.length ? (
              <View style={styles.chips}>
                {profile.catalog.map((item) => (
                  <Chip key={item.id} label={item.name} selected={productId === item.id} onPress={() => setProductId(item.id)} />
                ))}
              </View>
            ) : (
              <Text style={styles.hint}>Ajoutez d’abord vos produits dans l’onglet Assistant.</Text>
            )}
          </View>
        ) : null}

        {action === 'custom' ? (
          <Field
            value={answer}
            onChangeText={setAnswer}
            placeholder="Ex : Oui, on livre à Yopougon pour 1 500 F."
            multiline
            autoFocus
            accessibilityLabel="Votre réponse"
          />
        ) : null}

        {preview ? (
          <View style={styles.preview} accessibilityLiveRegion="polite">
            <Text weight="bold" style={styles.previewLabel}>
              Aperçu de la réponse
            </Text>
            <View style={styles.previewBubble}>
              <RichText style={styles.previewText}>{preview.text}</RichText>
            </View>
            {!preview.confident ? <Text style={styles.hint}>Et vous recevrez une notification.</Text> : null}
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        <Button
          label="Enregistrer"
          onPress={() => draft && onSave({ ...draft, question: question.trim(), answer: answer.trim() })}
          disabled={!ready}
          size="xl"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: Spacing.md, gap: 14 },
  title: { fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  quote: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: Colors.bubbleSent, marginTop: -6 },
  quoteText: { fontSize: 14 },
  actions: { gap: 8 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  actionOn: { borderWidth: 2, borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  actionLabel: { flex: 1, fontSize: 15 },
  block: { gap: 8 },
  blockTitle: { fontSize: 14, color: Colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { fontSize: 13, color: Colors.muted },
  preview: { gap: 8, padding: 12, borderRadius: 16, backgroundColor: Colors.chatBackground },
  previewLabel: { fontSize: 12, color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  previewBubble: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderBottomLeftRadius: 4,
    backgroundColor: Colors.surface,
  },
  previewText: { fontSize: 14, lineHeight: 20 },
  footer: { paddingHorizontal: 20, paddingTop: 8 },
});
