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
  text: string;
  time: string;
};

export type Conversation = {
  id: string;
  customerName: string;
  customerPhone: string;
  messages: Message[];
  aiPaused: boolean;
  needsAttention: boolean;
  unread: boolean;
};
