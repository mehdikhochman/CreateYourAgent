import { router } from 'expo-router';
import { CircleHelp, Gift, Phone, RotateCcw, Share2, UserRound } from '@/components/icons';
import { useState } from 'react';
import { Alert, Platform, Share, StyleSheet, View } from 'react-native';

import { BrandMark, PaymentLogo } from '@/components/brand/logos';
import { BottomSheet } from '@/components/bottom-sheet';
import { useToast } from '@/components/feedback';
import { Text } from '@/components/text';
import { Badge, Button, Field, Group, Row, Screen, SectionLabel } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAppState } from '@/state/app-state';

function IconCircle({ children, background = Colors.surfaceMuted }: { children: React.ReactNode; background?: string }) {
  return <View style={[styles.iconCircle, { backgroundColor: background }]}>{children}</View>;
}

/**
 * Link sent with « Partager l’app »: the web version's own address, or
 * EXPO_PUBLIC_SHARE_URL in the APK (set it to the deployed `….expo.app` site).
 */
function shareLink(): string | undefined {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return process.env.EXPO_PUBLIC_SHARE_URL || undefined;
}

export default function Account() {
  const { profile, updateProfile, reset } = useAppState();
  const toast = useToast();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(profile.ownerName);

  const share = async () => {
    const link = shareLink();
    const message = 'J’utilise CréeTonAgent : Tiko répond à mes clients sur WhatsApp, même la nuit.';
    try {
      await Share.share({ message: link ? `${message} Pour essayer : ${link}` : message });
    } catch {
      toast('Partage impossible sur cet appareil', 'error');
    }
  };

  const restart = () => {
    const go = () => {
      reset();
      router.dismissAll();
      router.replace('/');
    };
    if (Platform.OS === 'web') return go();
    Alert.alert('Recommencer la démo ?', 'Tout ce que vous avez rempli sera effacé.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Recommencer', style: 'destructive', onPress: go },
    ]);
  };

  const saveName = () => {
    updateProfile({ ownerName: name.trim() });
    setEditingName(false);
    toast('Prénom enregistré');
  };

  return (
    <Screen edges={['top']} background={Colors.background} contentStyle={styles.content}>
      <Text weight="extrabold" style={styles.title} accessibilityRole="header">
        Compte
      </Text>

      <Group>
        <Row
          label="Votre prénom"
          value={profile.ownerName || 'Ajouter'}
          warn={!profile.ownerName}
          left={
            <IconCircle>
              <UserRound size={20} color={Colors.ink} strokeWidth={2.2} />
            </IconCircle>
          }
          onPress={() => {
            setName(profile.ownerName);
            setEditingName(true);
          }}
        />
        <Row
          label="Téléphone"
          value={profile.ownerPhone || '—'}
          left={
            <IconCircle>
              <Phone size={20} color={Colors.ink} strokeWidth={2.2} />
            </IconCircle>
          }
        />
        <Row
          label="WhatsApp"
          description={profile.whatsappPhone || undefined}
          right={<Badge label={profile.whatsappConnected ? 'Connecté' : 'Non connecté'} tone={profile.whatsappConnected ? 'green' : 'neutral'} />}
          left={
            <IconCircle background={Colors.greenSoft}>
              <BrandMark brand="whatsapp" size={22} />
            </IconCircle>
          }
          last
        />
      </Group>

      <SectionLabel style={styles.section}>Abonnement</SectionLabel>
      <View style={styles.plan}>
        <View style={styles.planHeader}>
          <IconCircle background={Colors.surface}>
            <Gift size={20} color={Colors.primary} strokeWidth={2.2} />
          </IconCircle>
          <View style={styles.flex}>
            <Text weight="extrabold" style={styles.planTitle}>
              Essai gratuit
            </Text>
            <Text style={styles.planText}>Rien à payer pendant le test</Text>
          </View>
        </View>
        <Text style={styles.planText}>
          Ensuite <Text weight="extrabold" style={styles.planPrice}>7 500 F par mois</Text>. Vous arrêtez quand vous voulez. Paiement par :
        </Text>
        <View style={styles.planLogos}>
          <PaymentLogo value="Wave" size={36} />
          <PaymentLogo value="Orange Money" size={36} />
          <PaymentLogo value="MTN MoMo" size={36} />
        </View>
      </View>

      <SectionLabel style={styles.section}>Aide</SectionLabel>
      <Group>
        <Row
          label="Aide et contact"
          left={
            <IconCircle>
              <CircleHelp size={20} color={Colors.ink} strokeWidth={2.2} />
            </IconCircle>
          }
          onPress={() => toast('Bientôt, vous pourrez écrire à notre équipe sur WhatsApp.', 'info')}
        />
        <Row
          label="Partager l’app"
          left={
            <IconCircle>
              <Share2 size={20} color={Colors.ink} strokeWidth={2.2} />
            </IconCircle>
          }
          onPress={share}
        />
        <Row
          label="Recommencer la démo"
          left={
            <IconCircle background={Colors.dangerSoft}>
              <RotateCcw size={20} color={Colors.danger} strokeWidth={2.2} />
            </IconCircle>
          }
          onPress={restart}
          last
        />
      </Group>

      <Text style={styles.version}>CréeTonAgent · prototype v2</Text>

      <BottomSheet visible={editingName} onClose={() => setEditingName(false)} heightRatio={0.42}>
        <View style={styles.sheet}>
          <Text weight="extrabold" style={styles.sheetTitle}>
            Votre prénom
          </Text>
          <Field value={name} onChangeText={setName} placeholder="Ex : Awa" autoFocus onSubmitEditing={saveName} returnKeyType="done" />
          <Button label="Enregistrer" onPress={saveName} />
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: Spacing.md, paddingHorizontal: 20, gap: 14 },
  title: { fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  section: { marginTop: 6 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  plan: { gap: 12, padding: 16, borderRadius: Radius.lg, backgroundColor: Colors.primarySoft },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planTitle: { fontSize: 18 },
  planText: { fontSize: 14, lineHeight: 20, color: Colors.muted },
  planPrice: { fontSize: 14, color: Colors.ink },
  planLogos: { flexDirection: 'row', gap: 8 },
  version: { textAlign: 'center', fontSize: 12, color: Colors.faint, marginTop: Spacing.sm },
  sheet: { paddingHorizontal: 20, gap: 14 },
  sheetTitle: { fontSize: 22 },
});
