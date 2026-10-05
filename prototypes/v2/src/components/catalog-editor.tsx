import * as ImagePicker from 'expo-image-picker';
import { Camera, Images, Plus, X } from '@/components/icons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Tiko } from '@/components/tiko/tiko';
import { Button, Field, Group, SectionLabel } from '@/components/ui';
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
  const isRestaurant = category.id === 'restaurant';

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
        source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled) return;
    } catch {
      // No camera (simulator, some browsers): still show the demo extraction.
    }
    setReading(true);
    setTimeout(() => {
      const existing = new Set(items.map((i) => i.name.toLowerCase()));
      const extracted = category.demoExtraction
        .filter((i) => !existing.has(i.name.toLowerCase()))
        .map((i) => ({ ...i, id: newId('p') }));
      onChange([...items, ...extracted]);
      setReading(false);
    }, 1600);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.photoCard}>
        {reading ? (
          <View style={styles.reading} accessibilityLiveRegion="polite">
            <Tiko pose="think" size={64} />
            <View style={styles.flex}>
              <Text weight="extrabold" style={styles.photoTitle}>
                Tiko lit votre photo…
              </Text>
              <Text style={styles.photoText}>Il repère les noms et les prix.</Text>
            </View>
          </View>
        ) : (
          <>
            <Text weight="extrabold" style={styles.photoTitle}>
              Le plus rapide : une photo
            </Text>
            <Text style={styles.photoText}>
              Prenez en photo votre {isRestaurant ? 'menu' : 'liste de prix ou vos produits'} : on lit les noms et les prix pour vous.
            </Text>
            <View style={styles.photoButtons}>
              <Button
                label="Photo"
                size="md"
                icon={<Camera size={20} color={Colors.onPrimary} strokeWidth={2.2} />}
                onPress={() => fromPhoto('camera')}
                style={styles.flex}
              />
              <Button
                label="Galerie"
                size="md"
                variant="secondary"
                icon={<Images size={20} color={Colors.ink} strokeWidth={2.2} />}
                onPress={() => fromPhoto('library')}
                style={styles.flex}
              />
            </View>
          </>
        )}
      </View>

      {items.length > 0 && (
        <View style={styles.listWrap}>
          <SectionLabel>
            {category.catalogLabel} ({items.length})
          </SectionLabel>
          <Group style={styles.list}>
            {items.map((item, i) => (
              <View key={item.id} style={[styles.item, i < items.length - 1 && styles.divider]}>
                <Text weight="semibold" style={styles.itemName} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text weight="extrabold" style={styles.itemPrice}>
                  {item.price} F
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Supprimer ${item.name}`}
                  hitSlop={10}
                  onPress={() => onChange(items.filter((x) => x.id !== item.id))}
                  style={styles.remove}>
                  <X size={18} color={Colors.muted} strokeWidth={2.4} />
                </Pressable>
              </View>
            ))}
          </Group>
        </View>
      )}

      <SectionLabel>Ou ajoutez à la main</SectionLabel>
      <Field
        placeholder={isRestaurant ? 'Ex : Garba' : 'Ex : Robe wax'}
        value={name}
        onChangeText={setName}
        accessibilityLabel="Nom du produit"
        returnKeyType="next"
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field
            placeholder="Prix"
            value={price}
            onChangeText={setPrice}
            keyboardType="number-pad"
            accessibilityLabel="Prix en francs CFA"
            prefix={<Text weight="bold" style={styles.currency}>F</Text>}
            onSubmitEditing={add}
          />
        </View>
        <Button
          label="Ajouter"
          size="md"
          variant="secondary"
          icon={<Plus size={18} color={Colors.ink} strokeWidth={2.6} />}
          onPress={add}
          disabled={!name.trim()}
          style={styles.addButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.md },
  flex: { flex: 1 },
  photoCard: { backgroundColor: Colors.primarySoft, borderRadius: Radius.lg, padding: Spacing.md, gap: 10 },
  photoTitle: { fontSize: 17, color: Colors.ink },
  photoText: { fontSize: 15, lineHeight: 21, color: Colors.muted },
  photoButtons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  reading: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 92 },
  listWrap: { gap: 10 },
  list: { borderWidth: 1.5, borderColor: Colors.border },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingLeft: 16, paddingRight: 8 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#EDEDF0' },
  itemName: { flex: 1, fontSize: 15 },
  itemPrice: { fontSize: 15 },
  remove: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  currency: { fontSize: 17, color: Colors.muted },
  addButton: { minHeight: 56 },
});
