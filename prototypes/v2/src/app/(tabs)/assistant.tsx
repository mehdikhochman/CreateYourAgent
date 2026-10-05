import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Camera, MapPin, MessageCircle } from '@/components/icons';
import { Image, Pressable, StyleSheet, Switch, View } from 'react-native';

import { ChannelLogo, PaymentLogo } from '@/components/brand/logos';
import { useToast } from '@/components/feedback';
import { Text } from '@/components/text';
import { TikoAvatar } from '@/components/tiko/tiko';
import { Group, ProgressBar, Row, Screen, SectionLabel } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { STEP_LABELS, getCategory, isStepAnswered, stepSummary, visibleSteps, type Step } from '@/data/categories';
import { useAppState } from '@/state/app-state';
import type { BusinessProfile } from '@/state/types';

/** Logos instead of words for channels and payment methods, like the design. Null: show the text summary. */
function rowValue(step: Step, profile: BusinessProfile) {
  if (step.kind === 'choice' && (step.field === 'salesChannels' || step.field === 'payments') && profile[step.field].length) {
    const values = profile[step.field];
    return (
      <View style={styles.logos}>
        {values.slice(0, 4).map((v) =>
          step.field === 'payments' ? (
            <PaymentLogo key={v} value={v} size={30} />
          ) : (
            <ChannelLogo key={v} value={v} size={30} background={Colors.surface} />
          ),
        )}
        {values.length > 4 ? (
          <Text weight="bold" style={styles.more}>
            +{values.length - 4}
          </Text>
        ) : null}
      </View>
    );
  }
  if (step.id === 'location' && !profile.location.trim()) {
    return (
      <View style={styles.addAddress}>
        <MapPin size={18} color={Colors.link} strokeWidth={2.4} />
        <Text weight="bold" style={styles.addAddressText}>
          Ajouter l’adresse
        </Text>
      </View>
    );
  }
  return null;
}

/**
 * « Mon assistant »: every answer from the setup stays editable, one row per
 * answer with its current value, plus what Tiko has learned.
 */
export default function Assistant() {
  const { profile, updateProfile } = useAppState();
  const toast = useToast();
  const category = getCategory(profile.category);
  if (!category) return null;

  const steps = visibleSteps(category, profile);
  const required = steps.filter((s) => !s.optional);
  const done = required.filter((s) => isStepAnswered(s, profile));
  const missing = required.find((s) => !isStepAnswered(s, profile));

  const pickLogo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [1, 1] });
      if (result.canceled || !result.assets[0]) return;
      updateProfile({ logoUri: result.assets[0].uri });
      toast('Photo du commerce enregistrée');
    } catch {
      toast('Impossible d’ouvrir vos photos. Autorisez l’accès aux photos dans les Réglages du téléphone.', 'error');
    }
  };

  const toggleAnnounce = (announceAssistant: boolean) => {
    updateProfile({ announceAssistant });
    toast(announceAssistant ? 'Tiko se présentera aux nouveaux clients' : 'Tiko ne se présentera plus', 'info');
  };

  return (
    <Screen edges={['top']} background={Colors.background} contentStyle={styles.content}>
      <Text weight="extrabold" style={styles.title} accessibilityRole="header">
        Mon assistant
      </Text>

      <View style={styles.profile}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={profile.logoUri ? 'Changer la photo du commerce' : 'Ajouter la photo du commerce'}
          onPress={pickLogo}
          style={({ pressed }) => [styles.photo, profile.logoUri ? styles.photoFilled : null, pressed && styles.pressed]}>
          {profile.logoUri ? (
            <Image source={{ uri: profile.logoUri }} style={styles.photoImage} />
          ) : (
            <Camera size={28} color={Colors.muted} strokeWidth={2} />
          )}
        </Pressable>
        <View style={styles.flex}>
          <Text weight="extrabold" style={styles.name} numberOfLines={1}>
            {profile.name || 'Mon commerce'}
          </Text>
          <View style={styles.completion}>
            <ProgressBar value={done.length / Math.max(1, required.length)} color={Colors.success} height={8} />
          </View>
          <Text style={styles.completionText}>
            {done.length} sur {required.length} remplies
            {missing ? ` · il manque : ${(STEP_LABELS[missing.id] ?? missing.title).toLowerCase()}` : ' · tout est rempli'}
          </Text>
        </View>
      </View>

      <SectionLabel style={styles.section}>Mon commerce</SectionLabel>
      <Group>
        {steps.map((step, i) => {
          const summary = stepSummary(step, profile);
          return (
            <Row
              key={step.id}
              label={STEP_LABELS[step.id] ?? step.title}
              value={summary || (step.optional ? 'Non renseigné' : 'À compléter')}
              warn={!summary && !step.optional}
              right={rowValue(step, profile) ?? undefined}
              last={i === steps.length - 1}
              onPress={() => router.push({ pathname: '/edit/[step]', params: { step: step.id } })}
            />
          );
        })}
      </Group>

      <SectionLabel style={styles.section}>Avec vos clients</SectionLabel>
      <Group>
        <Row
          label="Tiko se présente"
          description={
            profile.announceAssistant
              ? 'Dans son premier message, Tiko dit qu’il est l’assistant de votre commerce.'
              : 'Tiko ne dit pas à vos clients qu’il est un assistant.'
          }
          right={
            <Switch
              value={profile.announceAssistant}
              onValueChange={toggleAnnounce}
              trackColor={{ true: Colors.green, false: Colors.border }}
              thumbColor="#FFFFFF"
              accessibilityLabel="Tiko se présente aux nouveaux clients"
            />
          }
          last
        />
      </Group>

      <SectionLabel style={styles.section}>Ce que Tiko a appris</SectionLabel>
      <Group>
        <Row
          label="Réponses apprises"
          description={
            profile.faqs.length
              ? `${profile.faqs.length} réponse${profile.faqs.length > 1 ? 's' : ''} · modifier ou supprimer`
              : 'Rien pour l’instant. Apprenez-lui vos réponses.'
          }
          left={<TikoAvatar size={44} />}
          onPress={() => router.push('/learned')}
        />
        <Row
          label="Tester Tiko"
          description="Écrivez-lui comme un client"
          left={
            <View style={styles.testIcon}>
              <MessageCircle size={22} color={Colors.green} strokeWidth={2.2} />
            </View>
          }
          last
          onPress={() => router.push('/test-chat')}
        />
      </Group>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },
  content: { paddingTop: Spacing.md, paddingHorizontal: 20, gap: 14 },
  title: { fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: Radius.lg, backgroundColor: Colors.surface },
  photo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#C4C4CC',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoFilled: { borderStyle: 'solid', borderColor: Colors.border },
  photoImage: { width: '100%', height: '100%' },
  name: { fontSize: 20, letterSpacing: -0.3 },
  completion: { marginTop: 8 },
  completionText: { fontSize: 13, color: Colors.muted, marginTop: 6 },
  section: { marginTop: 6 },
  logos: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  more: { fontSize: 13, color: Colors.muted },
  addAddress: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  addAddressText: { fontSize: 15, color: Colors.link },
  testIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.greenSoft, alignItems: 'center', justifyContent: 'center' },
});
