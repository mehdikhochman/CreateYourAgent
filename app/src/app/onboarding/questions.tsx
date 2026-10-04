import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CatalogEditor } from '@/components/catalog-editor';
import { Button, Chip, Field, ProgressBar, Screen, Subtitle, Title } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { getCategory, visibleSteps, type Step } from '@/data/categories';
import { useAppState } from '@/state/app-state';
import type { BusinessProfile } from '@/state/types';

const SOCIALS = [
  { channel: 'tiktok', field: 'tiktok', label: 'TikTok', placeholder: '@votrecompte' },
  { channel: 'instagram', field: 'instagram', label: 'Instagram', placeholder: '@votrecompte' },
  { channel: 'facebook', field: 'facebook', label: 'Facebook', placeholder: 'Nom de votre page' },
] as const;

function isAnswered(step: Step, p: BusinessProfile): boolean {
  switch (step.kind) {
    case 'text':
      return p[step.field].trim().length > 0;
    case 'choice':
      return p[step.field].length > 0;
    case 'catalog':
      return p.catalog.length > 0;
    case 'socials':
      return true;
  }
}

export default function QuestionsScreen() {
  const { profile, updateProfile } = useAppState();
  const [index, setIndex] = useState(0);

  const category = getCategory(profile.category);
  if (!category) return null;

  const steps = visibleSteps(category, profile);
  const current = Math.min(index, steps.length - 1);
  const step = steps[current];
  const isLast = current === steps.length - 1;

  const next = () => {
    if (isLast) router.push({ pathname: '/test-chat', params: { onboarding: '1' } });
    else setIndex(current + 1);
  };

  const toggle = (field: Extract<Step, { kind: 'choice' }>['field'], value: string, multiple: boolean) => {
    const values = profile[field];
    if (!multiple) return updateProfile({ [field]: [value] });
    updateProfile({
      [field]: values.includes(value) ? values.filter((v) => v !== value) : [...values, value],
    });
  };

  return (
    <Screen
      footer={
        <>
          <Button label={isLast ? 'Terminer et tester' : 'Continuer'} onPress={next} disabled={!step.optional && !isAnswered(step, profile)} />
          {step.kind === 'catalog' && !isAnswered(step, profile) ? (
            <Button label="Passer pour l’instant" variant="ghost" onPress={next} />
          ) : null}
          {current > 0 ? <Button label="‹ Question précédente" variant="ghost" onPress={() => setIndex(current - 1)} /> : null}
        </>
      }>
      <View style={styles.progress}>
        <ProgressBar value={(current + 1) / steps.length} />
        <Text style={styles.progressText}>
          {category.emoji} Question {current + 1} sur {steps.length}
        </Text>
      </View>

      <Title>{step.title}</Title>
      {step.subtitle ? <Subtitle>{step.subtitle}</Subtitle> : null}

      {step.kind === 'text' && (
        <Field
          key={step.id}
          value={profile[step.field]}
          onChangeText={(t) => updateProfile({ [step.field]: t })}
          placeholder={step.placeholder}
          multiline={step.multiline}
          autoFocus
          returnKeyType="next"
          onSubmitEditing={() => isAnswered(step, profile) && next()}
        />
      )}

      {step.kind === 'choice' && (
        <View style={styles.chips}>
          {step.options.map((o) => (
            <Chip
              key={o.value}
              label={o.label}
              emoji={o.emoji}
              selected={profile[step.field].includes(o.value)}
              onPress={() => toggle(step.field, o.value, step.multiple)}
            />
          ))}
        </View>
      )}

      {step.kind === 'socials' && (
        <View style={styles.socials}>
          {SOCIALS.filter((s) => profile.salesChannels.includes(s.channel)).map((s) => (
            <Field
              key={s.field}
              label={s.label}
              value={profile[s.field]}
              onChangeText={(t) => updateProfile({ [s.field]: t })}
              placeholder={s.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
            />
          ))}
        </View>
      )}

      {step.kind === 'catalog' && (
        <CatalogEditor category={category} items={profile.catalog} onChange={(catalog) => updateProfile({ catalog })} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { gap: Spacing.xs, marginBottom: Spacing.sm },
  progressText: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  socials: { gap: Spacing.md },
});
