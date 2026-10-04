import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FakeQr } from '@/components/fake-qr';
import { Button, Card, Screen, Subtitle, Title } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAppState } from '@/state/app-state';

const STEPS = [
  'Ouvrez WhatsApp Business sur le téléphone de la boutique',
  'Touchez ⋮ ou Réglages → Appareils connectés',
  'Touchez « Connecter un appareil » et scannez le code',
];

// Prototype: the QR code and the connection are simulated. The real version
// shows the QR code returned by our WhatsApp gateway (Evolution API), then
// later uses Meta's official signup flow.
export default function ConnectWhatsApp() {
  const { profile, goLive } = useAppState();
  const [connecting, setConnecting] = useState(false);

  const connect = () => {
    setConnecting(true);
    setTimeout(() => {
      goLive();
      router.dismissAll();
      router.replace('/home');
    }, 1500);
  };

  return (
    <Screen
      footer={
        <>
          <Button label="J’ai scanné le code" variant="whatsapp" onPress={connect} loading={connecting} />
          <Text style={styles.demo}>Démo : la connexion est simulée.</Text>
        </>
      }>
      <Title>Dernière étape 🎉</Title>
      <Subtitle>
        Connectez le WhatsApp de {profile.name || 'votre business'} pour que votre assistant réponde à vos clients.
      </Subtitle>

      <View style={styles.qr}>
        <FakeQr size={170} />
        <Text style={styles.qrCaption}>Code QR de connexion</Text>
      </View>

      <Card>
        {STEPS.map((s, i) => (
          <View key={s} style={styles.step}>
            <Text style={styles.stepNumber}>{i + 1}</Text>
            <Text style={styles.stepText}>{s}</Text>
          </View>
        ))}
      </Card>

      <Text style={styles.tip}>
        💡 Conseil : pendant le test, utilisez de préférence un second numéro WhatsApp.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  qr: {
    alignSelf: 'center',
    width: 210,
    height: 220,
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  qrCaption: { fontSize: 12, color: Colors.textMuted },
  step: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.whatsapp,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 28,
    fontWeight: '800',
    overflow: 'hidden',
  },
  stepText: { flex: 1, fontSize: 15, color: Colors.text, lineHeight: 21 },
  tip: { fontSize: 14, color: Colors.textMuted, lineHeight: 20 },
  demo: { textAlign: 'center', color: Colors.textMuted, fontSize: 13 },
});
