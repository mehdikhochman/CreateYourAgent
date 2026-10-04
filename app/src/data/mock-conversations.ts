import { replyTo } from '@/lib/mock-assistant';
import { newId } from '@/lib/ids';
import type { BusinessProfile, Conversation, Message } from '@/state/types';

type Script = { name: string; phone: string; time: string; questions: string[] };

const SCRIPTS: Script[] = [
  { name: 'Mariam K.', phone: '+225 07 48 12 33 90', time: '10:42', questions: ['Bonjour', 'C’est combien ?', 'Vous livrez à Cocody ?'] },
  { name: 'Yao Serge', phone: '+225 05 66 01 29 74', time: '10:15', questions: ['Je peux payer par Wave ?', 'Je veux commander'] },
  { name: 'Aïcha', phone: '+225 01 02 77 45 18', time: '09:58', questions: ['Vous êtes ouverts dimanche ?', 'Merci'] },
  { name: 'Koffi', phone: '+225 07 89 34 56 11', time: 'Hier', questions: ['Vous faites des prix pour les grossistes ?'] },
];

/** Builds fake but realistic conversations from the owner's own profile, for the demo inbox. */
export function buildMockConversations(p: BusinessProfile): Conversation[] {
  return SCRIPTS.map((s) => {
    const messages: Message[] = [];
    let needsAttention = false;
    for (const q of s.questions) {
      messages.push({ id: newId('m'), role: 'customer', text: q, time: s.time });
      const r = replyTo(p, q);
      if (!r.confident) needsAttention = true;
      messages.push({ id: newId('m'), role: 'assistant', text: r.text, time: s.time });
    }
    return {
      id: newId('c'),
      customerName: s.name,
      customerPhone: s.phone,
      messages,
      aiPaused: false,
      needsAttention,
      unread: needsAttention,
    };
  });
}
