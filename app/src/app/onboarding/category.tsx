import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen, Subtitle, Title } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { CATEGORIES } from '@/data/categories';
import { EMPTY_PROFILE, useAppState } from '@/state/app-state';
import type { CategoryId } from '@/state/types';

const COMING_SOON = [
  { emoji: '💇🏾‍♀️', label: 'Salon de coiffure / beauté' },
  { emoji: '💊', label: 'Pharmacie' },
  { emoji: '🏠', label: 'Immobilier' },
];

export default function CategoryScreen() {
  const { profile, updateProfile } = useAppState();

  const choose = (id: CategoryId) => {
    if (profile.category !== id) {
      // Changing category restarts the questionnaire, keeping the login.
      updateProfile({ ...EMPTY_PROFILE, ownerPhone: profile.ownerPhone, category: id });
    }
    router.push('/onboarding/questions');
  };

  return (
    <Screen>
      <Title>Quelle est votre activité ?</Title>
      <Subtitle>Votre assistant sera préparé pour votre métier.</Subtitle>

      <View style={styles.list}>
        {CATEGORIES.map((c) => (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            onPress={() => choose(c.id)}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
            <Text style={styles.emoji}>{c.emoji}</Text>
            <View style={styles.cardText}>
              <Text style={styles.label}>{c.label}</Text>
              <Text style={styles.description}>{c.description}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}

        <Text style={styles.soonTitle}>Bientôt disponible</Text>
        {COMING_SOON.map((c) => (
          <View key={c.label} style={[styles.card, styles.cardDisabled]}>
            <Text style={styles.emoji}>{c.emoji}</Text>
            <Text style={[styles.label, styles.labelDisabled]}>{c.label}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.sm, marginTop: Spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  cardPressed: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  cardDisabled: { opacity: 0.45, borderStyle: 'dashed' },
  emoji: { fontSize: 36 },
  cardText: { flex: 1, gap: 2 },
  label: { fontSize: 18, fontWeight: '700', color: Colors.text },
  labelDisabled: { fontSize: 16, fontWeight: '600' },
  description: { fontSize: 14, color: Colors.textMuted },
  chevron: { fontSize: 30, color: Colors.textMuted },
  soonTitle: { marginTop: Spacing.md, fontSize: 14, fontWeight: '700', color: Colors.textMuted },
});
