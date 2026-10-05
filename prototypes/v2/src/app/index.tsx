import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Tiko, type TikoPose } from '@/components/tiko/tiko';
import { Button } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';

const SLIDES: { pose: TikoPose; bubble: string; title: string; text: string }[] = [
  {
    pose: 'hello',
    bubble: 'Bonjour, je suis Tiko !',
    title: 'Je réponds à vos clients sur WhatsApp',
    text: 'Prix, livraison, paiement : je réponds 24h/24 pendant que vous travaillez. Je suis prêt en 5 minutes.',
  },
  {
    pose: 'think',
    bubble: 'Apprenez-moi votre commerce',
    title: 'Vous m’expliquez, j’apprends',
    text: 'Prenez votre menu ou vos prix en photo. Si je me trompe, corrigez-moi en un geste.',
  },
  {
    pose: 'happy',
    bubble: 'Vous gardez la main',
    title: 'Je vous préviens à chaque commande',
    text: 'Quand un client veut commander ou négocier, je vous passe la main. Vous répondez quand vous voulez.',
  },
];

export default function Welcome() {
  // Measured rather than read from the window: the web page is pre-rendered
  // without a screen size, and each slide must be exactly one pager wide.
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const pager = useRef<ScrollView>(null);

  const goTo = (i: number) => {
    setIndex(i);
    pager.current?.scrollTo({ x: i * width, animated: true });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Text weight="extrabold" style={styles.brand} accessibilityRole="header">
        CréeTon<Text weight="extrabold" style={[styles.brand, styles.brandAccent]}>Agent</Text>
      </Text>

      <View style={styles.pagerWrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.pager}
          onMomentumScrollEnd={(e) => width && setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          // Web has no momentum event: track the position while scrolling.
          onScroll={(e) => width && setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          scrollEventThrottle={64}>
          {SLIDES.map((s) => (
            <View key={s.pose} style={[styles.slide, { width: width || undefined }]}>
              <View style={styles.hero}>
                <View style={styles.bubble}>
                  <Text weight="bold" style={styles.bubbleText}>
                    {s.bubble}
                  </Text>
                </View>
                <Tiko pose={s.pose} size={210} />
              </View>
              <View style={styles.copy}>
                <Text weight="extrabold" style={styles.title}>
                  {s.title}
                </Text>
                <Text style={styles.text}>{s.text}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.dots} accessibilityLabel={`Écran ${index + 1} sur ${SLIDES.length}`}>
          {SLIDES.map((s, i) => (
            <Pressable key={s.pose} accessibilityLabel={`Voir l’écran ${i + 1}`} hitSlop={8} onPress={() => goTo(i)}>
              <View style={[styles.dot, i === index && styles.dotActive]} />
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.actions}>
        <Button label="Créer mon assistant" onPress={() => router.push('/onboarding/phone')} />
        <Button
          label="J’ai déjà un compte"
          variant="ghost"
          size="md"
          onPress={() => router.push({ pathname: '/onboarding/phone', params: { mode: 'login' } })}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.surface },
  brand: { fontSize: 20, letterSpacing: -0.3, textAlign: 'center', marginTop: Spacing.md },
  brandAccent: { color: '#C25E00' },
  pagerWrap: { flex: 1 },
  pager: { flex: 1 },
  slide: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  hero: {
    height: 280,
    borderRadius: 32,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 12,
  },
  bubble: {
    position: 'absolute',
    top: 18,
    left: 18,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primaryLine,
  },
  bubbleText: { fontSize: 15 },
  copy: { gap: 12, marginTop: 46 },
  title: { fontSize: 30, lineHeight: 36, letterSpacing: -0.6, textAlign: 'center' },
  text: { fontSize: 16, lineHeight: 24, color: Colors.muted, textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, position: 'absolute', top: Spacing.lg + 280 + 16, left: 0, right: 0 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D5D5DB' },
  dotActive: { width: 22, backgroundColor: Colors.ink },
  actions: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: 4 },
});
