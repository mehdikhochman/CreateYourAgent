import { describe, expect, it } from 'vitest';

import { toWhatsAppText } from './format';

describe('toWhatsAppText', () => {
  it('turns **bold** into WhatsApp *bold*', () => {
    expect(toWhatsAppText('Sac : **8 500 F**.')).toBe('Sac : *8 500 F*.');
    expect(toWhatsAppText('• Robe : **12 000 F**\n• Sac : **8 500 F**')).toBe('• Robe : *12 000 F*\n• Sac : *8 500 F*');
  });

  it('leaves other text alone', () => {
    expect(toWhatsAppText('Bonjour ! * pas de gras')).toBe('Bonjour ! * pas de gras');
    expect(toWhatsAppText('**pas\nfermé**')).toBe('**pas\nfermé**');
    expect(toWhatsAppText('')).toBe('');
  });
});
