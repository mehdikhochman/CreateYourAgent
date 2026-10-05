import { newId } from '@/lib/ids';
import { replyTo } from '@/lib/mock-assistant';
import type { BusinessProfile, Conversation, ConversationAlert, Message } from '@/state/types';

type Script = { name: string; phone: string; time: string; questions: string[] };

const SCRIPTS: Script[] = [
  { name: 'Mariam K.', phone: '+225 07 48 12 33 90', time: '10:42', questions: ['Bonjour', 'C’est combien ?', 'Vous livrez à Cocody ?'] },
  { name: 'Yao Serge', phone: '+225 05 66 01 29 74', time: '10:15', questions: ['Je peux payer par Wave ?', 'Je veux commander'] },
  { name: 'Aïcha', phone: '+225 01 02 77 45 18', time: '09:58', questions: ['Vous êtes ouverts dimanche ?', 'Merci'] },
  { name: 'Koffi', phone: '+225 07 89 34 56 11', time: 'Hier', questions: ['Vous faites des prix pour les grossistes ?'] },
  { name: 'Fatou B.', phone: '+225 05 12 90 44 07', time: 'Hier', questions: ['Bonsoir', 'Je peux payer par Orange Money ?'] },
];

/** Builds fake but realistic conversations from the owner's own profile, for the demo inbox. */
export function buildMockConversations(p: BusinessProfile): Conversation[] {
  return SCRIPTS.map((s) => {
    const messages: Message[] = [];
    let alert: ConversationAlert | null = null;
    for (const q of s.questions) {
      messages.push({ id: newId('m'), role: 'customer', text: q, time: s.time });
      const r = replyTo(p, q);
      if (!r.confident && r.alert) alert = r.alert;
      messages.push({ id: newId('m'), role: 'assistant', text: r.text, time: s.time });
    }
    return {
      id: newId('c'),
      customerName: s.name,
      customerPhone: s.phone,
      messages,
      aiPaused: false,
      needsAttention: !!alert,
      alert,
      unread: !!alert,
    };
  });
}

const DAY_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']; // Date.getDay(): Sunday first
const HISTORY = [19, 14, 22, 12, 26, 24, 38]; // plausible replies per weekday, Sunday first

/**
 * Replies over the last 7 days for the home chart, today last: a plausible
 * history plus the replies actually sent today in the demo.
 */
export function weeklyReplies(conversations: Conversation[], today = new Date()) {
  const sentToday = conversations.reduce(
    (n, c) => n + c.messages.filter((m) => m.role === 'assistant' && m.time.includes(':')).length,
    0,
  );
  const days = Array.from({ length: 7 }, (_, i) => {
    const weekday = (today.getDay() + i + 1) % 7;
    const isToday = i === 6;
    return { label: DAY_LETTERS[weekday], value: isToday ? sentToday : HISTORY[weekday], isToday };
  });
  return { days, total: days.reduce((n, d) => n + d.value, 0) };
}
