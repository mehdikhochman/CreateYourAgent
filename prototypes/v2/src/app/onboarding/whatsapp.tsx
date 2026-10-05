import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { BrandMark } from '@/components/brand/logos';
import { FakeQr } from '@/components/fake-qr';
import { useToast } from '@/components/feedback';
import { Copy, Info } from '@/components/icons';
import { PHONE_DIGITS, PhoneField, formatPhone, localDigits, phoneHint } from '@/components/phone-field';
import { Text } from '@/components/text';
import { Button, Chip, Group, LinkButton, Screen, Subtitle, Title, TopBar } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAppState } from '@/state/app-state';

type Method = 'code' | 'qr';

// The code works on the phone that runs this app; the QR code needs a second screen.
const METHODS: { id: Method; label: string; help: string }[] = [
  { id: 'code', label: 'Avec un code', help: 'Le plus simple si WhatsApp est sur ce téléphone.' },
  { id: 'qr', label: 'Avec un QR code', help: 'Si WhatsApp est sur un autre téléphone.' },
];

// WhatsApp's own labels: check them on a phone set to French before testing with shops.
const CODE_STEPS = [
  'Touchez « Copier le code »',
  'Ouvrez WhatsApp (ou WhatsApp Business), puis ⋮ ou Réglages › « Appareils connectés »',
  'Touchez « Connecter un appareil », puis « Connecter avec le numéro de téléphone »',
  'Collez le code dans WhatsApp, puis revenez ici',
];

const QR_STEPS = [
  'Ouvrez WhatsApp (ou WhatsApp Business) sur le téléphone de votre commerce',
  'Touchez ⋮ ou Réglages, puis « Appareils connectés »',
  'Touchez « Connecter un appareil » et scannez ce code',
];

// No 0/O or 1/I, which are easy to mix up when typed by hand.
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newPairingCode(): string {
  return Array.from({ length: 8 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join('');
}

/** Numbered list of what to do in WhatsApp. */
function Steps({ steps }: { steps: string[] }) {
  return (
    <Group style={styles.steps}>
      {steps.map((s, i) => (
        <View key={s} style={[styles.step, i < steps.length - 1 && styles.divider]}>
          <View style={styles.stepNumber}>
            <Text weight="extrabold" style={styles.stepNumberText}>
              {i + 1}
            </Text>
          </View>
          <Text weight="semibold" style={styles.stepText}>
            {/* Non-breaking spaces inside « »: a quote mark never ends a line alone. */}
            {s.replace(/« /g, '«\u00A0').replace(/ »/g, '\u00A0»')}
          </Text>
        </View>
      ))}
    </Group>
  );
}

// Prototype: the code, the QR code and the connection are simulated. The real
// version asks our WhatsApp gateway (Evolution API) for a pairing code for this
// number, or for its QR code; later, Meta's official signup replaces both.
export default function ConnectWhatsApp() {
  const { profile, goLive } = useAppState();
  const toast = useToast();
  const [method, setMethod] = useState<Method>('code');
  const [number, setNumber] = useState(() => localDigits(profile.ownerPhone));
  const [editingNumber, setEditingNumber] = useState(number.length !== PHONE_DIGITS);
  const [connecting, setConnecting] = useState(false);

  const hint = phoneHint(number, { mobileOnly: false });
  const numberReady = number.length === PHONE_DIGITS && !hint.error;

  // A pairing code belongs to one number and one request: a code issued for an
  // older number or request no longer shows, and a new one is asked for.
  const [request, setRequest] = useState(0);
  const [issued, setIssued] = useState<{ key: string; code: string } | null>(null);
  const key = `${number}-${request}`;
  const code = numberReady && issued?.key === key ? issued.code : null;
  useEffect(() => {
    if (!numberReady) return;
    const t = setTimeout(() => setIssued({ key, code: newPairingCode() }), 900);
    return () => clearTimeout(t);
  }, [key, numberReady]);

  const copy = async () => {
    if (!code) return;
    try {
      await Clipboard.setStringAsync(code);
      toast('Code copié. Collez-le dans WhatsApp.');
    } catch {
      toast('Impossible de copier. Recopiez le code à la main.', 'error');
    }
  };

  const connect = () => {
    setConnecting(true);
    setTimeout(() => {
      goLive(numberReady ? { whatsappPhone: `+225 ${formatPhone(number)}` } : {});
      router.dismissAll();
      router.replace('/home');
      toast('C’est parti ! Tiko répond maintenant à vos clients.');
    }, 1500);
  };

  const help = METHODS.find((m) => m.id === method)!.help;

  return (
    <Screen
      header={<TopBar />}
      footer={
        <>
          <Button
            label={method === 'code' ? 'J’ai collé le code' : 'J’ai scanné le code'}
            variant="whatsapp"
            icon={<BrandMark brand="whatsapp" size={22} color="#FFFFFF" />}
            onPress={connect}
            disabled={method === 'code' && !code}
            loading={connecting}
          />
          <Text style={styles.demo}>Version de test : la connexion est simulée.</Text>
        </>
      }>
      <Title>Dernière étape : connectez WhatsApp</Title>
      <Subtitle>Tiko répondra à vos clients sur votre WhatsApp.</Subtitle>

      <View style={styles.methods} accessibilityRole="radiogroup">
        {METHODS.map((m) => (
          <Chip key={m.id} label={m.label} selected={method === m.id} onPress={() => setMethod(m.id)} />
        ))}
      </View>
      <Text style={styles.help}>{help}</Text>

      {method === 'code' ? (
        <>
          {editingNumber ? (
            <PhoneField
              label="Numéro WhatsApp du commerce"
              accessibilityLabel="Numéro WhatsApp du commerce"
              digits={number}
              onChange={setNumber}
              hint={hint}
              onSubmit={() => numberReady && setEditingNumber(false)}
            />
          ) : (
            <View style={styles.numberRow}>
              <View style={styles.flex}>
                <Text style={styles.numberLabel}>Numéro WhatsApp du commerce</Text>
                <Text weight="bold" style={styles.number}>
                  +225 {formatPhone(number)}
                </Text>
              </View>
              <LinkButton label="Modifier" onPress={() => setEditingNumber(true)} />
            </View>
          )}

          <View style={styles.codeCard}>
            {code ? (
              <>
                <Text weight="semibold" style={styles.caption}>
                  Votre code
                </Text>
                <Text
                  weight="extrabold"
                  style={styles.code}
                  selectable
                  accessibilityLabel={`Votre code : ${code.split('').join(' ')}`}>
                  {code.slice(0, 4)} {code.slice(4)}
                </Text>
                <Button
                  label="Copier le code"
                  size="md"
                  variant="secondary"
                  icon={<Copy size={20} color={Colors.ink} strokeWidth={2.2} />}
                  onPress={copy}
                />
                <LinkButton label="Le code ne marche pas ? Nouveau code" onPress={() => setRequest((n) => n + 1)} />
              </>
            ) : numberReady ? (
              <View style={styles.preparing} accessibilityLiveRegion="polite">
                <ActivityIndicator color={Colors.green} />
                <Text weight="semibold" style={styles.caption}>
                  Tiko prépare votre code…
                </Text>
              </View>
            ) : (
              <Text weight="semibold" style={styles.caption}>
                Entrez le numéro WhatsApp de votre commerce pour recevoir le code.
              </Text>
            )}
          </View>

          <Steps steps={CODE_STEPS} />
        </>
      ) : (
        <>
          <View style={styles.qrCard}>
            <View style={styles.qr}>
              <FakeQr size={176} />
              <View style={styles.qrLogo}>
                <BrandMark brand="whatsapp" size={30} />
              </View>
            </View>
            <Text weight="semibold" style={styles.caption}>
              Code de connexion
            </Text>
          </View>
          <Steps steps={QR_STEPS} />
        </>
      )}

      <View style={styles.tip}>
        <Info size={18} color={Colors.link} strokeWidth={2.4} />
        <Text style={styles.tipText}>Pour ce test, utilisez plutôt un autre numéro que celui de vos clients.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  help: { fontSize: 14, color: Colors.muted, marginTop: -6 },
  numberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: Radius.lg, backgroundColor: Colors.background },
  numberLabel: { fontSize: 13, color: Colors.muted },
  number: { fontSize: 17, marginTop: 2 },
  codeCard: { alignItems: 'center', gap: 12, padding: Spacing.md, borderRadius: Radius.xl, backgroundColor: Colors.greenSoft },
  code: { fontSize: 34, letterSpacing: 4, color: Colors.ink },
  preparing: { alignItems: 'center', gap: 10, paddingVertical: Spacing.sm },
  qrCard: { alignItems: 'center', gap: 10, paddingVertical: Spacing.md, borderRadius: Radius.xl, backgroundColor: Colors.background },
  qr: { padding: 14, borderRadius: Radius.lg, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  qrLogo: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: { fontSize: 13, color: Colors.muted, textAlign: 'center' },
  steps: { borderWidth: 1.5, borderColor: Colors.border },
  step: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#EDEDF0' },
  stepNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { color: '#FFFFFF', fontSize: 14 },
  stepText: { flex: 1, fontSize: 15, lineHeight: 21 },
  tip: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 14, borderRadius: Radius.md, backgroundColor: Colors.primarySoft },
  tipText: { flex: 1, fontSize: 14, lineHeight: 20, color: Colors.ink },
  demo: { textAlign: 'center', color: Colors.muted, fontSize: 13 },
});
