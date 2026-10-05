import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { StepEditor } from '@/components/step-editor';
import { Button, ProgressBar, Screen, Subtitle, Title } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { getCategory, isStepAnswered, visibleSteps } from '@/data/categories';
import { useAppState } from '@/state/app-state';

export default function QuestionsScreen() {
  const { profile, updateProfile } = useAppState();
  const [index, setIndex] = useState(0);

  const category = getCategory(profile.category);
  if (!category) return null;

  const steps = visibleSteps(category, profile);
  const current = Math.min(index, steps.length - 1);
  const step = steps[current];
  const isLast = current === steps.length - 1;
  const answered = isStepAnswered(step, profile);

  const next = () => {
    if (isLast) router.push('/celebration');
    else setIndex(current + 1);
  };

  return (
    <Screen
      footer={
        <>
          <Button label={isLast ? 'Créer mon assistant' : 'Continuer'} onPress={next} disabled={!step.optional && !answered} />
          {step.kind === 'catalog' && !answered ? <Button label="Passer pour l’instant" variant="ghost" onPress={next} /> : null}
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

      <StepEditor step={step} category={category} profile={profile} onChange={updateProfile} onSubmit={() => answered && next()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { gap: Spacing.xs, marginBottom: Spacing.sm },
  progressText: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
});
