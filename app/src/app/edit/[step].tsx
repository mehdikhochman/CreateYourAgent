import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { StepEditor } from '@/components/step-editor';
import { Button, Screen, Subtitle, Title } from '@/components/ui';
import { STEP_LABELS, getCategory, isStepAnswered } from '@/data/categories';
import { useAppState } from '@/state/app-state';
import type { BusinessProfile } from '@/state/types';

/**
 * Edits one answer on a draft copy: nothing changes for customers until the
 * owner taps « Enregistrer »; « Annuler » drops the draft.
 */
export default function EditStep() {
  const { step: stepId } = useLocalSearchParams<{ step: string }>();
  const { profile, updateProfile, setFlash } = useAppState();
  const [draft, setDraft] = useState<BusinessProfile>(profile);

  const category = getCategory(profile.category);
  const step = category?.steps.find((s) => s.id === stepId);
  if (!category || !step) return null;

  const label = STEP_LABELS[step.id] ?? step.title;
  const changed = JSON.stringify(draft) !== JSON.stringify(profile);
  const valid = step.optional || step.kind === 'catalog' || isStepAnswered(step, draft);

  const save = () => {
    updateProfile(draft);
    setFlash(`${label} : modification enregistrée`);
    router.back();
  };

  return (
    <Screen
      footer={
        <>
          <Button label="Enregistrer" onPress={save} disabled={!changed || !valid} />
          <Button label="Annuler" variant="ghost" onPress={() => router.back()} />
        </>
      }>
      <Stack.Screen options={{ title: label }} />
      <Title>{step.title}</Title>
      {step.subtitle ? <Subtitle>{step.subtitle}</Subtitle> : null}
      <StepEditor
        step={step}
        category={category}
        profile={draft}
        onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        onSubmit={() => changed && valid && save()}
      />
    </Screen>
  );
}
