import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Button, Screen, SectionLabel, SelectCard, Subtitle, Title, TopBar } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { CATEGORIES, COMING_SOON, getCategory, visibleSteps } from '@/data/categories';
import { EMPTY_PROFILE, useAppState } from '@/state/app-state';
import type { CategoryId } from '@/state/types';

export default function CategoryScreen() {
  const { profile, updateProfile } = useAppState();
  const [selected, setSelected] = useState<CategoryId | null>(profile.category);

  const preview = getCategory(selected) ?? CATEGORIES[1];
  const total = 1 + visibleSteps(preview, profile).length;

  const next = () => {
    if (!selected) return;
    if (profile.category !== selected) {
      // Changing activity restarts the questionnaire, keeping the login.
      updateProfile({ ...EMPTY_PROFILE, ownerPhone: profile.ownerPhone, category: selected });
    }
    router.push('/onboarding/questions');
  };

  return (
    <Screen
      header={<TopBar progress={{ value: 1 / total, label: `1/${total}` }} />}
      footer={<Button label="Continuer" onPress={next} disabled={!selected} />}>
      <Title>Quelle est votre activité ?</Title>
      <Subtitle>Votre assistant sera préparé pour votre métier.</Subtitle>

      <View style={styles.list}>
        {CATEGORIES.map((c) => {
          const on = selected === c.id;
          const Icon = c.icon;
          return (
            <SelectCard
              key={c.id}
              role="radio"
              title={c.label}
              description={c.description}
              selected={on}
              onPress={() => setSelected(c.id)}
              icon={
                <View style={[styles.iconTile, on && styles.iconTileOn]}>
                  <Icon size={26} color={on ? Colors.onPrimary : Colors.ink} strokeWidth={2.2} />
                </View>
              }
            />
          );
        })}
      </View>

      <SectionLabel style={styles.soonLabel}>Bientôt disponible</SectionLabel>
      <View style={styles.soon}>
        {COMING_SOON.map(({ label, icon: Icon }) => (
          <View key={label} style={styles.soonTile} accessibilityLabel={`${label}, bientôt disponible`}>
            <Icon size={24} color={Colors.muted} strokeWidth={2} />
            <Text weight="semibold" style={styles.soonText}>
              {label}
            </Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12, marginTop: Spacing.xs },
  iconTile: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTileOn: { backgroundColor: Colors.primary },
  soonLabel: { marginTop: Spacing.sm },
  soon: { flexDirection: 'row', gap: 12 },
  soonTile: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 18,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceMuted,
  },
  soonText: { fontSize: 14, color: Colors.muted },
});
