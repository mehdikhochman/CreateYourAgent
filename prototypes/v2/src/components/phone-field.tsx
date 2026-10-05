import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Field } from '@/components/ui';
import { Colors } from '@/constants/theme';

// Ivorian numbers have 10 digits since 2021 (e.g. 07 48 12 33 90). Before,
// they had 8; mobiles got 01 (Moov), 05 (MTN) or 07 (Orange) in front.
export const PHONE_DIGITS = 10;
export const OLD_PHONE_DIGITS = 8;
const MOBILE_PREFIXES = ['01', '05', '07'];

/** "0748123390" → "07 48 12 33 90". */
export function formatPhone(digits: string): string {
  return digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}

/** "+225 07 48 12 33 90" → "0748123390". */
export function localDigits(phone: string): string {
  return phone.replace(/^\+225/, '').replace(/\D/g, '').slice(0, PHONE_DIGITS);
}

export type PhoneHint = { text: string; error: boolean };

/**
 * Help under a number field: the expected format, or why the button stays
 * grey. `mobileOnly` for numbers that must receive an SMS (WhatsApp Business
 * also works on a landline).
 */
export function phoneHint(digits: string, { triedShort = false, mobileOnly = true } = {}): PhoneHint {
  const prefix = digits.slice(0, 2);
  if (mobileOnly && digits.length === PHONE_DIGITS && !MOBILE_PREFIXES.includes(prefix)) {
    return { text: 'Ce numéro ne reçoit pas les SMS. Un numéro mobile commence par 01, 05 ou 07.', error: true };
  }
  // 8 digits can still be a 10-digit number being typed, unless it can't start like one.
  if (digits.length === OLD_PHONE_DIGITS && (triedShort || !MOBILE_PREFIXES.includes(prefix))) {
    return { text: 'Depuis 2021, les numéros ont 10 chiffres : ajoutez 01, 05 ou 07 devant.', error: true };
  }
  return { text: '10 chiffres. Ex : 07 48 12 33 90', error: false };
}

/** Côte d’Ivoire flag drawn with views (orange, white, green). */
function CountryPrefix() {
  return (
    <View style={styles.prefix} accessibilityLabel="Côte d’Ivoire, plus 225">
      <View style={styles.flag}>
        <View style={[styles.stripe, { backgroundColor: Colors.primary }]} />
        <View style={[styles.stripe, { backgroundColor: '#FFFFFF' }]} />
        <View style={[styles.stripe, { backgroundColor: '#009E60' }]} />
      </View>
      <Text weight="bold" style={styles.prefixText}>
        +225
      </Text>
      <View style={styles.prefixDivider} />
    </View>
  );
}

/** +225 number field, typed as digits and shown in pairs, with its hint underneath. */
export function PhoneField({
  digits,
  onChange,
  hint,
  onSubmit,
  label,
  accessibilityLabel = 'Numéro de téléphone',
  autoFocus,
}: {
  digits: string;
  onChange: (digits: string) => void;
  hint: PhoneHint;
  onSubmit?: () => void;
  label?: string;
  accessibilityLabel?: string;
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <Field
        label={label}
        prefix={<CountryPrefix />}
        value={formatPhone(digits)}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, PHONE_DIGITS))}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        placeholder="07 00 00 00 00"
        autoFocus={autoFocus}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={hint.text}
        onSubmitEditing={onSubmit}
        style={styles.input}
      />
      <Text weight={hint.error ? 'semibold' : 'medium'} style={hint.error ? styles.error : styles.hint} accessibilityLiveRegion="polite">
        {hint.text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  prefix: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flag: { flexDirection: 'row', width: 26, height: 18, borderRadius: 3, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  stripe: { flex: 1 },
  prefixText: { fontSize: 17 },
  prefixDivider: { width: 1, height: 26, backgroundColor: Colors.border, marginLeft: 4 },
  input: { fontSize: 19, letterSpacing: 0.5 },
  hint: { fontSize: 14, color: Colors.muted },
  error: { fontSize: 14, lineHeight: 20, color: Colors.danger },
});
