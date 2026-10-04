import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Button, Field, Screen, Subtitle, Title } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { useAppState } from '@/state/app-state';

// Ivorian mobile numbers have 10 digits since 2021 (e.g. 07 48 12 33 90).
const PHONE_DIGITS = 10;
const CODE_DIGITS = 6;

function formatPhone(digits: string): string {
  return digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}

export default function PhoneScreen() {
  const { updateProfile } = useAppState();
  const [phone, setPhone] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const phoneValid = phone.length === PHONE_DIGITS;

  // Prototype: no SMS is sent and any 6-digit code is accepted.
  const sendCode = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setCodeSent(true);
    }, 700);
  };

  const verify = () => {
    updateProfile({ ownerPhone: `+225 ${formatPhone(phone)}` });
    router.push('/onboarding/category');
  };

  return (
    <Screen
      footer={
        codeSent ? (
          <>
            <Button label="Valider" onPress={verify} disabled={code.length !== CODE_DIGITS} />
            <Button label="Changer de numéro" variant="ghost" onPress={() => { setCodeSent(false); setCode(''); }} />
          </>
        ) : (
          <Button label="Recevoir mon code" onPress={sendCode} disabled={!phoneValid} loading={loading} />
        )
      }>
      {codeSent ? (
        <>
          <Title>Entrez le code reçu</Title>
          <Subtitle>Nous avons envoyé un code à 6 chiffres au +225 {formatPhone(phone)}.</Subtitle>
          <Field
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, CODE_DIGITS))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            placeholder="123456"
            autoFocus
            style={styles.code}
          />
          <Text style={styles.hint}>Version de démonstration : n’importe quel code à 6 chiffres fonctionne.</Text>
        </>
      ) : (
        <>
          <Title>Quel est votre numéro ?</Title>
          <Subtitle>Pas de mot de passe : on vous envoie un code pour vous connecter.</Subtitle>
          <Field
            prefix="🇨🇮 +225"
            value={formatPhone(phone)}
            onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, PHONE_DIGITS))}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            placeholder="07 00 00 00 00"
            autoFocus
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  code: { fontSize: 28, letterSpacing: 8, textAlign: 'center' },
  hint: { color: Colors.textMuted, fontSize: 13 },
});
