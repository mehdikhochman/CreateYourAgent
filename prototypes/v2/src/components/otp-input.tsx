import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Text } from '@/components/text';
import { Colors, Font } from '@/constants/theme';

/**
 * One box per digit. A single hidden input receives the keyboard and the
 * SMS autofill (iOS « From Messages », Android one-time code).
 */
export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  error,
}: {
  length?: number;
  value: string;
  onChange: (code: string) => void;
  onComplete?: (code: string) => void;
  error?: boolean;
}) {
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(true);

  const change = (text: string) => {
    const code = text.replace(/\D/g, '').slice(0, length);
    onChange(code);
    if (code.length === length) onComplete?.(code);
  };

  return (
    <Pressable onPress={() => input.current?.focus()} accessibilityLabel={`Code à ${length} chiffres`} style={styles.wrap}>
      <View style={styles.row}>
        {Array.from({ length }, (_, i) => {
          const digit = value[i] ?? '';
          const active = focused && (i === value.length || (i === length - 1 && value.length === length));
          return (
            <View
              key={i}
              style={[styles.box, digit ? styles.boxFilled : null, active && styles.boxActive, error && styles.boxError]}>
              <Text weight="extrabold" style={styles.digit}>
                {digit}
              </Text>
              {active && !digit ? <View style={styles.caret} /> : null}
            </View>
          );
        })}
      </View>
      <TextInput
        ref={input}
        value={value}
        onChangeText={change}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus
        caretHidden
        style={styles.hidden}
        accessibilityLabel="Code reçu par SMS"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  row: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  box: {
    flex: 1,
    maxWidth: 52,
    height: 60,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxFilled: { borderColor: Colors.ink },
  boxActive: { borderColor: Colors.primary, borderWidth: 2 },
  boxError: { borderColor: Colors.danger },
  digit: { fontSize: 26 },
  caret: { position: 'absolute', width: 2, height: 26, borderRadius: 1, backgroundColor: Colors.primary },
  // Kept on screen (not display:none) so focus and SMS autofill keep working.
  hidden: { position: 'absolute', width: '100%', height: '100%', opacity: 0.01, color: 'transparent', fontFamily: Font.medium, outlineWidth: 0 },
});
