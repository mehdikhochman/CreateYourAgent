import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Field } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import type { Category } from '@/data/categories';
import { newId } from '@/lib/ids';
import type { CatalogItem } from '@/state/types';

/** "12000" → "12 000"; free text such as "5 000 – 7 000" is kept as typed. */
export function formatPrice(raw: string): string {
  const digits = raw.replace(/\s/g, '');
  if (!/^\d+$/.test(digits)) return raw.trim();
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function CatalogEditor({
  category,
  items,
  onChange,
}: {
  category: Category;
  items: CatalogItem[];
  onChange: (items: CatalogItem[]) => void;
}) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [reading, setReading] = useState(false);

  const add = () => {
    if (!name.trim()) return;
    onChange([...items, { id: newId('p'), name: name.trim(), price: formatPrice(price) || '?' }]);
    setName('');
    setPrice('');
  };

  // Prototype: the photo is not analysed yet; we simulate what the AI
  // extraction will return. The real version sends the image to the backend.
  const fromPhoto = async (source: 'camera' | 'library') => {
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Appareil photo', 'Autorisez l’appareil photo dans les réglages pour utiliser cette option.');
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled) return;
    } catch {
      // Camera is unavailable on the iOS simulator: still show the demo extraction.
    }
    setReading(true);
    setTimeout(() => {
      const existing = new Set(items.map((i) => i.name.toLowerCase()));
      const extracted = category.demoExtraction
        .filter((i) => !existing.has(i.name.toLowerCase()))
        .map((i) => ({ ...i, id: newId('p') }));
      onChange([...items, ...extracted]);
      setReading(false);
    }, 1500);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.photoCard}>
        <Text style={styles.photoTitle}>📸 Le plus rapide</Text>
        <Text style={styles.photoText}>
          Prenez en photo votre {category.id === 'restaurant' ? 'menu' : 'liste de prix ou vos produits'} : on lit les noms et
          les prix pour vous.
        </Text>
        {reading ? (
          <View style={styles.reading}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.readingText}>Lecture de la photo…</Text>
          </View>
        ) : (
          <View style={styles.photoButtons}>
            <Button label="Photo" icon="📷" onPress={() => fromPhoto('camera')} style={styles.flex} />
            <Button label="Galerie" icon="🖼️" variant="secondary" onPress={() => fromPhoto('library')} style={styles.flex} />
          </View>
        )}
      </View>

      {items.length > 0 && (
        <View style={styles.list}>
          <Text style={styles.listTitle}>
            {category.catalogLabel} ({items.length})
          </Text>
          {items.map((item) => (
            <View key={item.id} style={styles.item}>
              <Text style={styles.itemName} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={styles.itemPrice}>{item.price} F</Text>
              <Pressable
                accessibilityLabel={`Supprimer ${item.name}`}
                hitSlop={10}
                onPress={() => onChange(items.filter((i) => i.id !== item.id))}>
                <Text style={styles.remove}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.listTitle}>Ou ajoutez à la main</Text>
      <Field placeholder={category.id === 'restaurant' ? 'Ex : Garba' : 'Ex : Robe wax'} value={name} onChangeText={setName} />
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field placeholder="Prix" value={price} onChangeText={setPrice} keyboardType="number-pad" prefix="F" />
        </View>
        <Button label="Ajouter" variant="secondary" onPress={add} disabled={!name.trim()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.md },
  flex: { flex: 1 },
  photoCard: { backgroundColor: Colors.primarySoft, borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.sm },
  photoTitle: { fontSize: 17, fontWeight: '800', color: Colors.primaryDark },
  photoText: { fontSize: 15, color: Colors.text, lineHeight: 21 },
  photoButtons: { flexDirection: 'row', gap: Spacing.sm },
  reading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 56 },
  readingText: { fontSize: 16, color: Colors.primaryDark, fontWeight: '600' },
  list: { gap: Spacing.xs },
  listTitle: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
  },
  itemName: { flex: 1, fontSize: 16, color: Colors.text },
  itemPrice: { fontSize: 16, fontWeight: '700', color: Colors.text },
  remove: { fontSize: 16, color: Colors.textMuted, paddingLeft: Spacing.sm },
  row: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
});
