import { describe, expect, it } from 'vitest';

import type { ShopProfile } from '../domain/types';
import { AWA_FASHION, MAQUIS_TANTIE } from './eval/profiles';
import { buildReply, deliveryReply, locationReply, paymentReply } from './replies';
import type { DecisionAction, EngineDecision } from './types';

const NB = ' ';

const decide = (action: DecisionAction, extra: Partial<EngineDecision> = {}): EngineDecision => ({
  action,
  productIds: [],
  zone: null,
  learnedAnswerId: null,
  lead: null,
  confident: true,
  alertSummary: null,
  ...extra,
});

const awa = (overrides: Partial<ShopProfile> = {}): ShopProfile => ({ ...AWA_FASHION, ...overrides });

describe('buildReply', () => {
  it('greets in the shop’s tone', () => {
    expect(buildReply(awa(), decide('greet'), 'bonsoir').text).toBe(
      'Bonne arrivée chez Awa Fashion ! Comment puis-je vous aider ?',
    );
    expect(buildReply(awa({ tone: 'formel' }), decide('greet'), 'bonjour').text).toBe(
      'Bonjour et bienvenue chez Awa Fashion. Comment puis-je vous aider ?',
    );
    expect(buildReply(awa({ tone: 'amical' }), decide('greet'), 'bonjour').text).toBe(
      'Coucou ! Bienvenue chez Awa Fashion. Comment puis-je vous aider ?',
    );
  });

  it('lists the catalogue with prices from the profile, never unavailable items', () => {
    const reply = buildReply(awa(), decide('catalog'), 'ya quoi');
    expect(reply.confident).toBe(true);
    expect(reply.text).toContain('Voici nos produits :');
    expect(reply.text).toContain(`• Robe pagne wax (taille S à XL) : **12${NB}000${NB}F**`);
    expect(reply.text).toContain('• Sandales dames : prix sur demande');
    expect(reply.text).not.toContain('Perruque');
    expect(reply.text).toContain('On est ensemble ! Autre chose ?');
    expect(buildReply(MAQUIS_TANTIE, decide('catalog'), 'menu').text).toContain('Voici notre menu :');
  });

  it('alerts the owner when the catalogue is empty', () => {
    const reply = buildReply(awa({ catalog: [] }), decide('catalog'), 'ya quoi');
    expect(reply).toMatchObject({ confident: false, alert: { kind: 'question', summary: 'Demande le catalogue' } });
  });

  it('quotes the chosen products, or the ones the message names, or else the catalogue', () => {
    expect(buildReply(awa(), decide('price', { productIds: ['awa-sac'] }), 'combien').text).toContain(
      `Sac à main simili cuir : **8${NB}500${NB}F**`,
    );
    const fromMessage = buildReply(awa(), decide('price'), 'c combien la robe');
    expect(fromMessage.text).toContain('Robe pagne wax');
    expect(fromMessage.text).not.toContain('Sac');
    expect(buildReply(awa(), decide('price'), 'c combien').text).toContain('Voici nos produits');
  });

  it('takes an order without confirming it, and alerts the owner', () => {
    const reply = buildReply(awa(), decide('order', { productIds: ['awa-sac'] }), 'je veux payer sac oh');
    expect(reply.text).toBe(
      `Très bon choix ! Sac à main simili cuir : **8${NB}500${NB}F**. Le responsable vous confirme la commande et la livraison dans quelques minutes.`,
    );
    expect(reply).toMatchObject({ confident: false, alert: { kind: 'order', summary: 'Veut commander : Sac à main simili cuir' } });

    const several = buildReply(awa(), decide('order', { productIds: ['awa-sac', 'awa-robe'] }), 'je prends');
    expect(several.text).toContain('• Robe pagne wax');
    expect(several.text).toContain('• Sac à main');
    expect(several.alert?.summary).toBe('Veut commander : Robe pagne wax (taille S à XL), Sac à main simili cuir');

    const none = buildReply(awa(), decide('order'), 'je veux commander');
    expect(none.text).toContain('Qu’est-ce qui vous ferait plaisir ?');
    expect(none.alert).toEqual({ kind: 'order', summary: 'Veut commander' });
  });

  it('answers hours, or alerts when they are missing', () => {
    expect(buildReply(awa(), decide('hours'), 'dimanche ?')).toEqual({ text: 'Nos horaires : Lun–Sam · 9h–20h.', confident: true });
    expect(buildReply(awa({ hours: '' }), decide('hours'), 'dimanche ?')).toMatchObject({
      confident: false,
      alert: { kind: 'question', summary: 'Demande vos horaires' },
    });
  });

  it('gives the social pages, or alerts when there are none', () => {
    expect(buildReply(awa(), decide('socials'), 'tiktok ?').text).toBe('TikTok : @awafashion225\nInstagram : @awa.fashion');
    expect(buildReply(awa({ tiktok: '', instagram: '' }), decide('socials'), 'tiktok ?')).toMatchObject({
      confident: false,
      alert: { summary: 'Demande le lien de votre page' },
    });
  });

  it('hands over with an alert', () => {
    expect(buildReply(awa(), decide('handoff'), 'patron')).toEqual({
      text: 'Je préviens tout de suite le responsable, il vous répond ici très vite.',
      confident: false,
      alert: { kind: 'question', summary: 'Veut parler au responsable' },
    });
  });

  it('sends the owner’s learned words for custom, or hands over when they are missing', () => {
    expect(buildReply(awa(), decide('custom', { learnedAnswerId: 'awa-xxl' }), 'xxl ?')).toEqual({
      text: AWA_FASHION.answers[0]!.answer,
      confident: true,
    });
    expect(buildReply(awa(), decide('custom', { learnedAnswerId: 'nope' }), 'xxl ?').alert?.kind).toBe('question');
  });

  it('thanks', () => {
    expect(buildReply(awa(), decide('thanks'), 'merci deh')).toEqual({ text: 'Avec plaisir !', confident: true });
  });
});

describe('deliveryReply', () => {
  const fee = ' Frais de livraison : 1 500 F à Cocody, 2 000 F ailleurs.';

  it('answers about the zone the customer named (decision first, else the message)', () => {
    expect(deliveryReply(awa(), 'vous livrez à Yopougon ?')).toEqual({ text: `Oui, nous livrons à Yopougon !${fee}`, confident: true });
    expect(deliveryReply(awa(), 'vous livrez à yop ?').text).toContain('à Yopougon');
    expect(deliveryReply(awa(), 'vous livrez là-bas ?', 'Cocody').text).toContain('à Cocody');
  });

  it('lists the zones when no place is named', () => {
    expect(deliveryReply(awa(), 'vous livrez ?')).toEqual({ text: `Oui, nous livrons : Cocody, Yopougon.${fee}`, confident: true });
  });

  it('is not confident and alerts for a zone not covered', () => {
    const reply = deliveryReply(awa(), 'vous livrez à Abobo ?');
    expect(reply.text).toBe(
      'Désolé, nous ne livrons pas encore à Abobo. Nous livrons : Cocody, Yopougon. Je demande au responsable s’il peut s’arranger.',
    );
    expect(reply).toMatchObject({ confident: false, alert: { kind: 'question', summary: 'Demande une livraison à Abobo' } });
  });

  it('treats « Tout Abidjan » as every zone except the rest of the country', () => {
    const everywhere = awa({ deliveryZones: ['Tout Abidjan'] });
    expect(deliveryReply(everywhere, 'vous livrez à Abobo ?').confident).toBe(true);
    expect(deliveryReply(everywhere, 'au Plateau ?').text).toContain('Oui, nous livrons au Plateau !');
    const inland = deliveryReply(everywhere, 'vous livrez à Bouaké ?');
    expect(inland.confident).toBe(false);
    expect(inland.alert?.summary).toBe('Demande une livraison à l’intérieur du pays');
    expect(deliveryReply(awa({ deliveryZones: ['Tout Abidjan', 'Intérieur du pays'] }), 'Bouaké ?').confident).toBe(true);
  });

  it('says so when the shop does not deliver', () => {
    expect(deliveryReply(awa({ deliveryZones: [] }), 'vous livrez à Cocody ?')).toEqual({
      text: 'Désolé, nous ne faisons pas de livraison pour le moment.',
      confident: true,
    });
  });
});

describe('paymentReply', () => {
  it('lists the payment methods', () => {
    expect(paymentReply(awa(), 'comment on paie ?')).toEqual({ text: 'Vous pouvez payer par : Wave, Orange Money.', confident: true });
  });

  it('answers yes or no about the method named (« om » = Orange Money, « momo » = MTN)', () => {
    expect(paymentReply(awa(), 'om ça passe ?').text).toBe('Oui, vous pouvez payer par Orange Money. Nous acceptons : Wave, Orange Money.');
    expect(paymentReply(awa(), 'momo ça passe ?').text).toBe(
      'Désolé, nous n’acceptons pas MTN MoMo pour le moment. Vous pouvez payer par : Wave, Orange Money.',
    );
    expect(paymentReply(MAQUIS_TANTIE, 'je peux payer cash ?').text).toContain('Oui, vous pouvez payer en espèces.');
    expect(paymentReply(awa(), 'combien ?').text).toBe('Vous pouvez payer par : Wave, Orange Money.');
  });

  it('alerts when no method is set', () => {
    expect(paymentReply(awa({ payments: [] }))).toMatchObject({ confident: false, alert: { summary: 'Demande comment payer' } });
  });
});

describe('locationReply', () => {
  it('gives the address of a restaurant or a shop with a counter', () => {
    expect(locationReply(MAQUIS_TANTIE)).toEqual({ text: 'Nous sommes à : Yopougon Selmer, derrière la pharmacie.', confident: true });
    const shop = awa({ salesChannels: ['shop', 'tiktok'], location: 'Cocody Angré, 8e tranche' });
    expect(locationReply(shop).text).toBe('Nous sommes à : Cocody Angré, 8e tranche.');
  });

  it('alerts when the address is missing', () => {
    expect(locationReply({ ...MAQUIS_TANTIE, location: '' })).toMatchObject({
      confident: false,
      alert: { kind: 'question', summary: 'Demande votre adresse' },
    });
  });

  it('points online-only sellers to their pages', () => {
    expect(locationReply(awa())).toEqual({
      text: 'Nous vendons uniquement en ligne (TikTok @awafashion225, Instagram @awa.fashion) et nous livrons : Cocody, Yopougon.',
      confident: true,
    });
    expect(locationReply(awa({ tiktok: '', instagram: '', deliveryZones: [] })).text).toBe('Nous vendons uniquement en ligne.');
  });
});
