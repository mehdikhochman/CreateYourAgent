import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';

const BENEFITS = [
  { emoji: '💬', text: 'Répond à vos clients WhatsApp 24h/24' },
  { emoji: '⚡', text: 'Prêt en 5 minutes, sans connaissances techniques' },
  { emoji: '🙋🏾', text: 'Vous reprenez la main quand vous voulez' },
];

export default function Welcome() {
  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <>
          <Button label="Créer mon assistant" onPress={() => router.push('/onboarding/phone')} />
          <Text style={styles.legal}>Gratuit pendant la phase de test</Text>
        </>
      }>
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Text style={styles.logoEmoji}>🤖</Text>
        </View>
        <Text style={styles.brand}>
          CréeTon<Text style={{ color: Colors.primary }}>Agent</Text>
        </Text>
        <Text style={styles.tagline}>
          Votre assistant WhatsApp qui répond à vos clients pendant que vous travaillez.
        </Text>
      </View>

      <View style={styles.benefits}>
        {BENEFITS.map((b) => (
          <View key={b.text} style={styles.benefit}>
            <Text style={styles.benefitEmoji}>{b.emoji}</Text>
            <Text style={styles.benefitText}>{b.text}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: Spacing.md, marginTop: Spacing.xl },
  logo: {
    width: 96,
    height: 96,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoEmoji: { fontSize: 52 },
  brand: { fontSize: 34, fontWeight: '900', color: Colors.text },
  tagline: { fontSize: 18, color: Colors.textMuted, textAlign: 'center', lineHeight: 26 },
  benefits: { gap: Spacing.md, marginTop: Spacing.xl },
  benefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  benefitEmoji: { fontSize: 26 },
  benefitText: { flex: 1, fontSize: 16, color: Colors.text, fontWeight: '600' },
  legal: { textAlign: 'center', color: Colors.textMuted, fontSize: 13 },
});
