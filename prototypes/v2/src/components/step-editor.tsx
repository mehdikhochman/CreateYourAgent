import { Pressable, StyleSheet, View } from 'react-native';

import { ChannelLogo, PaymentLogo } from '@/components/brand/logos';
import { CatalogEditor } from '@/components/catalog-editor';
import { Text } from '@/components/text';
import { CheckBox, Chip, Field, Group, SelectCard } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { SOCIAL_ACCOUNTS, type Category, type Option, type Step } from '@/data/categories';
import { toneSample } from '@/lib/mock-assistant';
import type { BusinessProfile, ChoiceField } from '@/state/types';

type Props = {
  step: Step;
  category: Category;
  profile: BusinessProfile;
  onChange: (patch: Partial<BusinessProfile>) => void;
  onSubmit?: () => void;
};

/**
 * The input for one question (text, choices or catalogue). Used by the setup
 * questionnaire and by « Mon assistant » to edit an answer later.
 */
export function StepEditor({ step, category, profile, onChange, onSubmit }: Props) {
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
          accessibilityLabel={step.title}
        />
      );
    case 'catalog':
      return <CatalogEditor category={category} items={profile.catalog} onChange={(catalog) => onChange({ catalog })} />;
    case 'choice':
      return <ChoiceEditor step={step} profile={profile} onChange={onChange} />;
  }
}

function ChoiceEditor({
  step,
  profile,
  onChange,
}: {
  step: Extract<Step, { kind: 'choice' }>;
  profile: BusinessProfile;
  onChange: (patch: Partial<BusinessProfile>) => void;
}) {
  const values = profile[step.field];
  const toggle = (value: string) => {
    if (!step.multiple) return onChange({ [step.field]: [value] } as Partial<Record<ChoiceField, string[]>>);
    onChange({ [step.field]: values.includes(value) ? values.filter((v) => v !== value) : [...values, value] });
  };

  switch (step.field) {
    case 'salesChannels':
      return <ChannelsEditor options={step.options} profile={profile} values={values} toggle={toggle} onChange={onChange} />;
    case 'payments':
      return (
        <Group style={styles.bordered}>
          {step.options.map((o, i) => {
            const on = values.includes(o.value);
            return (
              <Pressable
                key={o.value}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={o.label}
                onPress={() => toggle(o.value)}
                style={({ pressed }) => [styles.payRow, i < step.options.length - 1 && styles.divider, pressed && styles.pressedRow]}>
                <PaymentLogo value={o.value} size={48} />
                <Text weight="bold" style={styles.payLabel}>
                  {o.label}
                </Text>
                <CheckBox checked={on} />
              </Pressable>
            );
          })}
        </Group>
      );
    case 'tone':
    case 'serviceModes':
      return (
        <View style={styles.cards}>
          {step.options.map((o) => {
            const on = values.includes(o.value);
            const Icon = o.icon;
            return (
              <SelectCard
                key={o.value}
                role={step.multiple ? 'checkbox' : 'radio'}
                title={o.label}
                description={step.field === 'tone' ? `« ${toneSample(o.value, profile.name)} »` : o.description}
                selected={on}
                onPress={() => toggle(o.value)}
                icon={
                  Icon ? (
                    <View style={[styles.iconTile, on && styles.iconTileOn]}>
                      <Icon size={24} color={on ? Colors.onPrimary : Colors.ink} strokeWidth={2.2} />
                    </View>
                  ) : undefined
                }
              />
            );
          })}
        </View>
      );
    default:
      return (
        <View style={styles.chips}>
          {step.options.map((o) => (
            <Chip key={o.value} label={o.label} selected={values.includes(o.value)} onPress={() => toggle(o.value)} />
          ))}
        </View>
      );
  }
}

/** « Où vendez-vous ? »: logo tiles, then the account name for each social network picked. */
function ChannelsEditor({
  options,
  profile,
  values,
  toggle,
  onChange,
}: {
  options: Option[];
  profile: BusinessProfile;
  values: string[];
  toggle: (v: string) => void;
  onChange: (patch: Partial<BusinessProfile>) => void;
}) {
  const tiles = options.filter((o) => o.value !== 'whatsapp');
  const wide = options.find((o) => o.value === 'whatsapp');
  const accounts = SOCIAL_ACCOUNTS.filter((a) => values.includes(a.channel));

  return (
    <View style={styles.channels}>
      <View style={styles.grid}>
        {tiles.map((o) => {
          const on = values.includes(o.value);
          return (
            <SelectCard
              key={o.value}
              tile
              title={o.label}
              selected={on}
              onPress={() => toggle(o.value)}
              style={styles.gridItem}
              icon={<ChannelLogo value={o.value} background={on ? Colors.surface : Colors.surfaceMuted} />}
            />
          );
        })}
      </View>
      {wide ? (
        <SelectCard
          title={wide.label}
          description={wide.description}
          selected={values.includes(wide.value)}
          onPress={() => toggle(wide.value)}
          icon={<ChannelLogo value="whatsapp" background={values.includes(wide.value) ? Colors.surface : Colors.surfaceMuted} />}
        />
      ) : null}
      {accounts.length ? (
        <View style={styles.accounts}>
          {accounts.map((a) => (
            <Field
              key={a.field}
              label={a.label}
              value={profile[a.field]}
              onChangeText={(t) => onChange({ [a.field]: t })}
              placeholder={a.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
            />
          ))}
          <Text style={styles.optional}>Facultatif : vous pourrez les ajouter plus tard.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  cards: { gap: 12 },
  iconTile: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTileOn: { backgroundColor: Colors.primary },
  bordered: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.xl },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#EDEDF0' },
  pressedRow: { backgroundColor: Colors.surfaceMuted },
  payLabel: { flex: 1, fontSize: 17 },
  channels: { gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridItem: { width: '47.5%', flexGrow: 1 },
  accounts: { gap: 12, padding: 16, borderRadius: Radius.lg, backgroundColor: Colors.surfaceMuted, marginTop: 4 },
  optional: { fontSize: 13, color: Colors.muted },
});
