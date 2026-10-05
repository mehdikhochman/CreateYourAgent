export type CategoryId = 'restaurant' | 'boutique';

export type CatalogItem = {
  id: string;
  name: string;
  price: string; // free text in FCFA, e.g. "2 500"
};

/** What the assistant should do when a learned question comes back. */
export type AssistantAction =
  | 'catalog'
  | 'price'
  | 'delivery'
  | 'payment'
  | 'order'
  | 'handoff'
  | 'custom';

export type Faq = {
  id: string;
  question: string;
  action: AssistantAction;
  /** Product to quote for the 'price' action. */
  productId?: string;
  /** Owner's own words for the 'custom' action. */
  answer: string;
  source: 'manual' | 'correction';
};

export type TextField =
  | 'name'
  | 'location'
  | 'hours'
  | 'deliveryFee'
  | 'tiktok'
  | 'instagram'
  | 'facebook';

export type ChoiceField =
  | 'salesChannels'
  | 'serviceModes'
  | 'deliveryZones'
  | 'payments'
  | 'tone';

export type BusinessProfile = {
  ownerPhone: string;
  /** Owner's first name, for « Bonjour Awa ». */
  ownerName: string;
  /** Photo or logo picked in « Mon assistant » (local URI in the prototype). */
  logoUri: string | null;
  category: CategoryId | null;
  catalog: CatalogItem[];
  faqs: Faq[];
  whatsappConnected: boolean;
} & Record<TextField, string> &
  Record<ChoiceField, string[]>;

export type MessageRole = 'customer' | 'assistant' | 'owner';

export type Message = {
  id: string;
  role: MessageRole;
  /** May contain **bold** parts (prices). */
  text: string;
  time: string;
};

export type ConversationAlert = { kind: 'order' | 'question'; summary: string };

export type Conversation = {
  id: string;
  customerName: string;
  customerPhone: string;
  messages: Message[];
  aiPaused: boolean;
  needsAttention: boolean;
  /** Why it needs the owner (shown in « À traiter »). */
  alert: ConversationAlert | null;
  unread: boolean;
};
