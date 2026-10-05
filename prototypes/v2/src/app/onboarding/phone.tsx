import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useToast } from '@/components/feedback';
import { OtpInput } from '@/components/otp-input';
import { Text } from '@/components/text';
import { Button, Field, LinkButton, Screen, Subtitle, Title, TopBar } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAppState } from '@/state/app-state';

// Ivorian mobile numbers have 10 digits since 2021 (e.g. 07 48 12 33 90).
const PHONE_DIGITS = 10;
const CODE_DIGITS = 6;
const RESEND_SECONDS = 30;

function formatPhone(digits: string): string {
  return digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
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

export default function PhoneScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const login = mode === 'login';
  const { updateProfile, loadDemo } = useAppState();
  const toast = useToast();
  const [phone, setPhone] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const fullPhone = `+225 ${formatPhone(phone)}`;

  // Prototype: no SMS is sent and any 6-digit code is accepted.
  const sendCode = () => {
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setCodeSent(true);
      setWait(RESEND_SECONDS);
    }, 700);
  };

  const verify = (value = code) => {
    if (value.length !== CODE_DIGITS || verifying) return;
    setVerifying(true);
    setTimeout(() => {
      setVerifying(false);
      if (login) {
        loadDemo(fullPhone);
        router.dismissAll();
        router.replace('/home');
        toast('Bon retour sur CréeTonAgent !');
      } else {
        updateProfile({ ownerPhone: fullPhone });
        router.push('/onboarding/category');
      }
    }, 600);
  };

  const changeNumber = () => {
    setCodeSent(false);
    setCode('');
  };

  const resend = () => {
    setCode('');
    setWait(RESEND_SECONDS);
    toast('Nouveau code envoyé par SMS', 'info');
  };

  return (
    <Screen
      header={<TopBar onBack={codeSent ? changeNumber : undefined} />}
      footer={
        codeSent ? (
          <Button label="Valider" onPress={() => verify()} disabled={code.length !== CODE_DIGITS} loading={verifying} />
        ) : (
          <Button label="Recevoir mon code" onPress={sendCode} disabled={phone.length !== PHONE_DIGITS} loading={sending} />
        )
      }>
      {codeSent ? (
        <>
          <Title>Entrez le code reçu</Title>
          <Subtitle>Nous l’avons envoyé par SMS au {fullPhone}.</Subtitle>
          <View style={styles.otp}>
            <OtpInput value={code} onChange={setCode} onComplete={verify} />
          </View>
          <View style={styles.resend}>
            {wait > 0 ? (
              <Text style={styles.muted}>Renvoyer le code dans 0:{wait.toString().padStart(2, '0')}</Text>
            ) : (
              <LinkButton label="Renvoyer le code" onPress={resend} />
            )}
          </View>
          <Text style={styles.demo}>Version de test : n’importe quel code à 6 chiffres fonctionne.</Text>
        </>
      ) : (
        <>
          <Title>{login ? 'Content de vous revoir' : 'Quel est votre numéro ?'}</Title>
          <Subtitle>
            {login
              ? 'Entrez le numéro de votre compte, on vous envoie un code.'
              : 'Pas de mot de passe : on vous envoie un code par SMS pour vous connecter.'}
          </Subtitle>
          <Field
            prefix={<CountryPrefix />}
            value={formatPhone(phone)}
            onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, PHONE_DIGITS))}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            placeholder="07 00 00 00 00"
            autoFocus
            accessibilityLabel="Numéro de téléphone"
            onSubmitEditing={() => phone.length === PHONE_DIGITS && sendCode()}
            style={styles.phoneInput}
          />
          {login ? <Text style={styles.demo}>Version de test : vous retrouverez la boutique de démonstration « Awa Fashion ».</Text> : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  prefix: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flag: { flexDirection: 'row', width: 26, height: 18, borderRadius: 3, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  stripe: { flex: 1 },
  prefixText: { fontSize: 17 },
  prefixDivider: { width: 1, height: 26, backgroundColor: Colors.border, marginLeft: 4 },
  phoneInput: { fontSize: 19, letterSpacing: 0.5 },
  otp: { marginTop: Spacing.sm },
  resend: { alignItems: 'flex-start' },
  muted: { fontSize: 15, color: Colors.muted },
  demo: { fontSize: 13, lineHeight: 19, color: Colors.muted },
});
