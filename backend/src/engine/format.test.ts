import { describe, expect, it } from 'vitest';

import type { CatalogItem } from '../domain/types';
import { AWA_FASHION, MAQUIS_TANTIE } from './eval/profiles';
import { excerpt, fcfa, listItems, quoted } from './format';
import { findProducts } from './products';

const NB = ' ';

const item = (name: string, priceFcfa: number | null, available = true): CatalogItem => ({
  id: name,
  name,
  priceFcfa,
  available,
  position: 0,
});

describe('fcfa', () => {
  it('groups thousands with non-breaking spaces, before F too', () => {
    expect(fcfa(12000)).toBe(`12${NB}000${NB}F`);
    expect(fcfa(500)).toBe(`500${NB}F`);
    expect(fcfa(1250000)).toBe(`1${NB}250${NB}000${NB}F`);
    expect(fcfa(0)).toBe(`0${NB}F`);
    expect(fcfa(12000)).not.toContain(' ');
  });
});

describe('listItems', () => {
  it('lists available items with bold prices, like the prototype', () => {
    const text = listItems([item('Robe', 12000), item('Sac', 8500)]);
    expect(text).toBe(`• Robe : **12${NB}000${NB}F**\n• Sac : **8${NB}500${NB}F**`);
  });

  it('shows « prix sur demande » when there is no price', () => {
    expect(listItems([item('Sandales', null)])).toBe('• Sandales : prix sur demande');
  });

  it('never lists unavailable items, and stops at max', () => {
    const items = [item('A', 1), item('B', 2, false), item('C', 3), item('D', 4)];
    const text = listItems(items, 2);
    expect(text).toContain('• A');
    expect(text).toContain('• C');
    expect(text).not.toContain('B');
    expect(text).not.toContain('D');
  });
});

describe('excerpt / quoted', () => {
  it('keeps one line and cuts long text', () => {
    expect(excerpt('  a\n b  ', 80)).toBe('a b');
    expect(excerpt('x'.repeat(100), 80)).toHaveLength(80);
    expect(quoted('Bonjour\nje veux le sac')).toBe('« Bonjour je veux le sac »');
    expect(quoted('y'.repeat(100))).toBe(`« ${'y'.repeat(60)} »`);
  });
});

describe('findProducts', () => {
  const names = (catalog: CatalogItem[], message: string) => findProducts(catalog, message).map((i) => i.name);

  it('finds products by a meaningful word of their name', () => {
    expect(names(AWA_FASHION.catalog, 'je veux payer sac oh')).toEqual(['Sac à main simili cuir']);
    expect(names(AWA_FASHION.catalog, 'c combien la robe')).toEqual(['Robe pagne wax (taille S à XL)']);
    expect(names(AWA_FASHION.catalog, 'vous avez des sacs ?')).toEqual(['Sac à main simili cuir']);
    expect(names(AWA_FASHION.catalog, 'robe et sac')).toEqual(['Robe pagne wax (taille S à XL)', 'Sac à main simili cuir']);
  });

  it('ignores stop words, fillers and unrelated words', () => {
    expect(names(AWA_FASHION.catalog, 'bonjour oh, vous livrez à yop ?')).toEqual([]);
    expect(names(AWA_FASHION.catalog, 'je passe maintenant')).toEqual([]);
  });

  it('never finds unavailable items', () => {
    expect(names(AWA_FASHION.catalog, 'la perruque c combien')).toEqual([]);
  });

  it('keeps the best match when one item matches more words', () => {
    expect(names(MAQUIS_TANTIE.catalog, 'poulet braisé c combien')).toEqual(['Poulet braisé + alloco']);
    expect(names(MAQUIS_TANTIE.catalog, 'garba et poulet braisé')).toEqual(['Garba', 'Poulet braisé + alloco']);
    expect(names(MAQUIS_TANTIE.catalog, 'alloco')).toEqual(['Alloco', 'Poulet braisé + alloco']);
  });
});
