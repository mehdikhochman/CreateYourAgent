import { StyleSheet, View } from 'react-native';

import { CatalogEditor } from '@/components/catalog-editor';
import { Chip, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { Category, Step } from '@/data/categories';
import type { BusinessProfile } from '@/state/types';

const SOCIALS = [
  { channel: 'tiktok', field: 'tiktok', label: 'TikTok', placeholder: '@votrecompte' },
  { channel: 'instagram', field: 'instagram', label: 'Instagram', placeholder: '@votrecompte' },
  { channel: 'facebook', field: 'facebook', label: 'Facebook', placeholder: 'Nom de votre page' },
] as const;

/**
 * The input for one question (text, choices, social accounts or catalogue).
 * Used by the setup questionnaire and by « Mon assistant » to edit later.
 */
export function StepEditor({
  step,
  category,
  profile,
  onChange,
  onSubmit,
}: {
  step: Step;
  category: Category;
  profile: BusinessProfile;
  onChange: (patch: Partial<BusinessProfile>) => void;
  onSubmit?: () => void;
}) {
  switch (step.kind) {
    case 'text':
      return (
        <Field
          key={step.id}
          value={profile[step.field]}
          onChangeText={(t) => onChange({ [step.field]: t })}
          placeholder={step.placeholder}
          multiline={step.multiline}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={onSubmit}
        />
      );
    case 'choice': {
      const values = profile[step.field];
      const toggle = (value: string) => {
        if (!step.multiple) return onChange({ [step.field]: [value] });
        onChange({ [step.field]: values.includes(value) ? values.filter((v) => v !== value) : [...values, value] });
      };
      return (
        <View style={styles.chips}>
          {step.options.map((o) => (
            <Chip key={o.value} label={o.label} emoji={o.emoji} selected={values.includes(o.value)} onPress={() => toggle(o.value)} />
          ))}
        </View>
      );
    }
    case 'socials':
      return (
        <View style={styles.socials}>
          {SOCIALS.filter((s) => profile.salesChannels.includes(s.channel)).map((s) => (
            <Field
              key={s.field}
              label={s.label}
              value={profile[s.field]}
              onChangeText={(t) => onChange({ [s.field]: t })}
              placeholder={s.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
            />
          ))}
        </View>
      );
    case 'catalog':
      return <CatalogEditor category={category} items={profile.catalog} onChange={(catalog) => onChange({ catalog })} />;
  }
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  socials: { gap: Spacing.md },
});
