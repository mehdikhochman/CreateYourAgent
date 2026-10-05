import { useNetworkState } from 'expo-network';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useToast } from '@/components/feedback';
import { OtpInput } from '@/components/otp-input';
import { Text } from '@/components/text';
import { OLD_PHONE_DIGITS, PHONE_DIGITS, PhoneField, formatPhone, phoneHint } from '@/components/phone-field';
import { Button, LinkButton, Screen, Subtitle, Title, TopBar } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAppState } from '@/state/app-state';

const CODE_DIGITS = 6;
const RESEND_SECONDS = 30;
const LOCKOUT_SECONDS = 120;
const MAX_TRIES = 3;
const CODE_LIFETIME_MS = 10 * 60 * 1000;
// Prototype: this code is refused, so testers can see the « wrong code » message.
const WRONG_DEMO_CODE = '000000';
const SMS_NOT_SENT = 'Le code n’est pas parti : pas de connexion. Réessayez quand la connexion revient.';

export default function PhoneScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const login = mode === 'login';
  const { updateProfile, loadDemo } = useAppState();
  const toast = useToast();
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const [phone, setPhone] = useState('');
  const [triedShort, setTriedShort] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [sentAt, setSentAt] = useState(0);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const fullPhone = `+225 ${formatPhone(phone)}`;
  const locked = tries >= MAX_TRIES;
  const hint = phoneHint(phone, { triedShort });

  const changePhone = (digits: string) => {
    setPhone(digits);
    setTriedShort(false);
  };

  // Prototype: no SMS is sent. Any 6-digit code is accepted, except WRONG_DEMO_CODE.
  const sendCode = () => {
    if (hint.error) return;
    if (offline) {
      toast(SMS_NOT_SENT, 'error');
      return;
    }
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setCodeSent(true);
      setSentAt(Date.now());
      setWait(RESEND_SECONDS);
    }, 700);
  };

  const submitPhone = () => {
    if (phone.length === PHONE_DIGITS) sendCode();
    else if (phone.length === OLD_PHONE_DIGITS) setTriedShort(true);
  };

  const changeCode = (value: string) => {
    setCode(value);
    if (!locked) setCodeError(null);
  };

  const verify = (value = code) => {
    if (value.length !== CODE_DIGITS || verifying || locked) return;
    setVerifying(true);
    setTimeout(() => {
      setVerifying(false);
      if (Date.now() - sentAt > CODE_LIFETIME_MS) {
        setCodeError('Ce code n’est plus valable. Touchez « Renvoyer le code ».');
        return;
      }
      if (value === WRONG_DEMO_CODE) {
        const n = tries + 1;
        setTries(n);
        if (n >= MAX_TRIES) {
          setCodeError('Trop d’essais. Attendez quelques minutes, puis demandez un nouveau code.');
          setWait(LOCKOUT_SECONDS);
        } else {
          setCodeError('Ce code ne marche pas. Vérifiez le SMS et réessayez.');
        }
        return;
      }
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
    setCodeError(null);
    setTries(0);
  };

  const resend = () => {
    if (offline) {
      toast(SMS_NOT_SENT, 'error');
      return;
    }
    setCode('');
    setCodeError(null);
    setTries(0);
    setSentAt(Date.now());
    setWait(RESEND_SECONDS);
    toast('Nouveau code envoyé. Utilisez le dernier SMS reçu.', 'info');
  };

  return (
    <Screen
      header={<TopBar onBack={codeSent ? changeNumber : undefined} />}
      footer={
        codeSent ? (
          <Button label="Valider" onPress={() => verify()} disabled={code.length !== CODE_DIGITS || locked} loading={verifying} />
        ) : (
          <Button
            label="Recevoir mon code"
            onPress={sendCode}
            disabled={phone.length !== PHONE_DIGITS || hint.error}
            loading={sending}
          />
        )
      }>
      {codeSent ? (
        <>
          <Title>Entrez le code reçu</Title>
          {/* Non-breaking spaces: the number never splits across two lines. */}
          <Subtitle>Code envoyé par SMS au {fullPhone.replace(/ /g, '\u00A0')}.</Subtitle>
          <View style={styles.inline}>
            <Text style={styles.muted}>Ce n’est pas le bon numéro ?</Text>
            <LinkButton label="Modifier" onPress={changeNumber} />
          </View>
          <View style={styles.otp}>
            <OtpInput value={code} onChange={changeCode} onComplete={verify} error={!!codeError} />
          </View>
          {codeError ? (
            <Text weight="semibold" style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {codeError}
            </Text>
          ) : null}
          <View style={styles.resend}>
            {wait > 0 ? (
              <Text style={styles.muted}>
                {locked ? `Nouveau code possible dans ${wait} secondes` : `Pas reçu ? Nouveau code dans ${wait} secondes`}
              </Text>
            ) : (
              <LinkButton label="Pas reçu ? Renvoyer le code" onPress={resend} />
            )}
          </View>
          <Text style={styles.demo}>
            Version de test : n’importe quel code à 6 chiffres fonctionne, sauf 000000 (pour voir le message d’erreur).
          </Text>
        </>
      ) : (
        <>
          <Title>{login ? 'Content de vous revoir' : 'Quel est votre numéro ?'}</Title>
          <Subtitle>
            {login
              ? 'Entrez le numéro de votre compte, on vous envoie un code.'
              : 'Pas de mot de passe à retenir. On vous envoie un code par SMS sur ce numéro.'}
          </Subtitle>
          <PhoneField digits={phone} onChange={changePhone} hint={hint} onSubmit={submitPhone} autoFocus />
          {login ? <Text style={styles.demo}>Version de test : vous retrouverez la boutique de démonstration « Awa Fashion ».</Text> : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  otp: { marginTop: Spacing.sm },
  resend: { alignItems: 'flex-start' },
  inline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: -8 },
  error: { fontSize: 14, lineHeight: 20, color: Colors.danger },
  muted: { fontSize: 15, color: Colors.muted },
  demo: { fontSize: 13, lineHeight: 19, color: Colors.muted },
});
