import { router } from 'expo-router';
import { useState } from 'react';

import { StepEditor } from '@/components/step-editor';
import { Button, Screen, Subtitle, Title, TopBar } from '@/components/ui';
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
  // The activity screen counts as question 1.
  const total = steps.length + 1;
  const position = current + 2;

  const next = () => {
    if (isLast) router.push('/celebration');
    else setIndex(current + 1);
  };
  const back = () => (current > 0 ? setIndex(current - 1) : router.back());

  return (
    <Screen
      header={<TopBar onBack={back} progress={{ value: position / total, label: `${position}/${total}` }} />}
      footer={
        <>
          <Button label={isLast ? 'Terminer' : 'Continuer'} onPress={next} disabled={!step.optional && !answered} />
          {step.kind === 'catalog' && !answered ? (
            <Button label="Passer pour l’instant" variant="ghost" size="md" onPress={next} />
          ) : null}
        </>
      }>
      <Title key={`t-${step.id}`}>{step.title}</Title>
      {step.subtitle ? <Subtitle>{step.subtitle}</Subtitle> : null}
      <StepEditor
        key={step.id}
        step={step}
        category={category}
        profile={profile}
        onChange={updateProfile}
        onSubmit={() => answered && next()}
      />
    </Screen>
  );
}
