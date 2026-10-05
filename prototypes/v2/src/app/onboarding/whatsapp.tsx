import { router } from 'expo-router';
import { Info } from '@/components/icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BrandMark } from '@/components/brand/logos';
import { FakeQr } from '@/components/fake-qr';
import { useToast } from '@/components/feedback';
import { Text } from '@/components/text';
import { Button, Group, Screen, Subtitle, Title, TopBar } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAppState } from '@/state/app-state';

const STEPS = [
  'Ouvrez WhatsApp Business sur le téléphone du commerce',
  'Touchez ⋮ ou Réglages, puis « Appareils connectés »',
  'Touchez « Connecter un appareil » et scannez ce code',
];

// Prototype: the QR code and the connection are simulated. The real version
// shows the QR code returned by our WhatsApp gateway (Evolution API), then
// later uses Meta's official signup flow.
export default function ConnectWhatsApp() {
  const { profile, goLive } = useAppState();
  const toast = useToast();
  const [connecting, setConnecting] = useState(false);

  const connect = () => {
    setConnecting(true);
    setTimeout(() => {
      goLive();
      router.dismissAll();
      router.replace('/home');
      toast('Tiko répond maintenant sur WhatsApp');
    }, 1500);
  };

  return (
    <Screen
      header={<TopBar />}
      footer={
        <>
          <Button
            label="J’ai scanné le code"
            variant="whatsapp"
            icon={<BrandMark brand="whatsapp" size={22} color="#FFFFFF" />}
            onPress={connect}
            loading={connecting}
          />
          <Text style={styles.demo}>Version de test : la connexion est simulée.</Text>
        </>
      }>
      <Title>Dernière étape : connectez WhatsApp</Title>
      <Subtitle>Tiko répondra aux clients de {profile.name || 'votre commerce'} sur ce numéro.</Subtitle>

      <View style={styles.qrCard}>
        <View style={styles.qr}>
          <FakeQr size={176} />
          <View style={styles.qrLogo}>
            <BrandMark brand="whatsapp" size={30} />
          </View>
        </View>
        <Text weight="semibold" style={styles.qrCaption}>
          Code de connexion
        </Text>
      </View>

      <Group style={styles.steps}>
        {STEPS.map((s, i) => (
          <View key={s} style={[styles.step, i < STEPS.length - 1 && styles.divider]}>
            <View style={styles.stepNumber}>
              <Text weight="extrabold" style={styles.stepNumberText}>
                {i + 1}
              </Text>
            </View>
            <Text weight="semibold" style={styles.stepText}>
              {s}
            </Text>
          </View>
        ))}
      </Group>

      <View style={styles.tip}>
        <Info size={18} color={Colors.link} strokeWidth={2.4} />
        <Text style={styles.tipText}>Pendant le test, utilisez de préférence un second numéro WhatsApp.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  qrCaption: { fontSize: 13, color: Colors.muted },
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
