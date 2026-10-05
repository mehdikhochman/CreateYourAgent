/**
 * JSON shapes sent to the app, and the mappers that build them from database
 * rows. Every endpoint that returns one of these (including GET /v1/sync) must
 * use these mappers, so the app sees the same shape everywhere.
 *
 * Field names are camelCase; timestamps are ISO strings; `rev` lets the app
 * keep the newest copy of a row.
 */
import type { AlertKind, AssistantAction, CategoryId, MessageRole, Tone } from './types';

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

// Shop profile ---------------------------------------------------------------------

export type ProfileDTO = {
  shopId: string;
  ownerName: string;
  ownerPhone: string;
  category: CategoryId | null;
  name: string;
  location: string;
  hours: string;
  deliveryFee: string;
  tiktok: string;
  instagram: string;
  facebook: string;
  salesChannels: string[];
  serviceModes: string[];
  deliveryZones: string[];
  payments: string[];
  tone: Tone;
  takeoverMinutes: number;
  whatsapp: { connected: boolean; displayPhone: string | null };
  rev: number;
};

/** Columns: shops.* plus owner_name, owner_phone (from owners) and channel_display_phone (null if no channel). */
export type ProfileRow = {
  id: string;
  name: string;
  category: CategoryId | null;
  location: string;
  hours: string;
  delivery_fee: string;
  tiktok: string;
  instagram: string;
  facebook: string;
  sales_channels: string[];
  service_modes: string[];
  delivery_zones: string[];
  payments: string[];
  tone: Tone;
  takeover_minutes: number;
  rev: number;
  owner_name: string;
  owner_phone: string;
  channel_display_phone: string | null;
};

export function toProfileDTO(r: ProfileRow): ProfileDTO {
  return {
    shopId: r.id,
    ownerName: r.owner_name,
    ownerPhone: r.owner_phone,
    category: r.category,
    name: r.name,
    location: r.location,
    hours: r.hours,
    deliveryFee: r.delivery_fee,
    tiktok: r.tiktok,
    instagram: r.instagram,
    facebook: r.facebook,
    salesChannels: r.sales_channels,
    serviceModes: r.service_modes,
    deliveryZones: r.delivery_zones,
    payments: r.payments,
    tone: r.tone,
    takeoverMinutes: r.takeover_minutes,
    whatsapp: { connected: r.channel_display_phone !== null, displayPhone: r.channel_display_phone },
    rev: r.rev,
  };
}

/** SQL that returns ProfileRow for shop $1. */
export const PROFILE_SQL = `
  SELECT s.*, o.first_name AS owner_name, o.phone AS owner_phone,
         ch.display_phone AS channel_display_phone
    FROM shops s
    JOIN owners o ON o.id = s.owner_id
    LEFT JOIN channels ch ON ch.shop_id = s.id AND ch.status = 'connected'
   WHERE s.id = $1`;

// Catalogue and learned answers ------------------------------------------------------

export type CatalogItemDTO = {
  id: string;
  name: string;
  priceFcfa: number | null;
  available: boolean;
  position: number;
  deleted: boolean;
  rev: number;
};

export type CatalogItemRow = {
  id: string;
  name: string;
  price_fcfa: number | null;
  available: boolean;
  position: number;
  deleted_at: Date | null;
  rev: number;
};

export function toCatalogItemDTO(r: CatalogItemRow): CatalogItemDTO {
  return {
    id: r.id,
    name: r.name,
    priceFcfa: r.price_fcfa,
    available: r.available,
    position: r.position,
    deleted: r.deleted_at !== null,
    rev: r.rev,
  };
}

export type AnswerDTO = {
  id: string;
  question: string;
  action: AssistantAction;
  productId: string | null;
  answer: string;
  source: 'manual' | 'correction';
  deleted: boolean;
  rev: number;
};

export type AnswerRow = {
  id: string;
  question: string;
  action: AssistantAction;
  product_id: string | null;
  answer: string;
  source: 'manual' | 'correction';
  deleted_at: Date | null;
  rev: number;
};

export function toAnswerDTO(r: AnswerRow): AnswerDTO {
  return {
    id: r.id,
    question: r.question,
    action: r.action,
    productId: r.product_id,
    answer: r.answer,
    source: r.source,
    deleted: r.deleted_at !== null,
    rev: r.rev,
  };
}

// Conversations, messages, alerts -----------------------------------------------------------

export type ConversationDTO = {
  id: string;
  customer: { name: string; phone: string };
  lastMessageAt: string;
  /** Text of the last message (any role), cut to 120 characters. */
  lastMessagePreview: string;
  /** null when the assistant answers; otherwise when it takes over again. */
  aiPausedUntil: string | null;
  needsAttention: boolean;
  unreadCount: number;
  /** false when the customer's last message is more than 24 h old: free-form replies are refused by WhatsApp. */
  canReply: boolean;
  rev: number;
};

/**
 * Columns: conversations.* plus customer_name, customer_wa_id (from customers)
 * and last_message_text (text of the newest message, or '').
 */
export type ConversationRow = {
  id: string;
  last_message_at: Date;
  last_customer_message_at: Date | null;
  ai_paused_until: Date | null;
  needs_attention: boolean;
  unread_count: number;
  rev: number;
  customer_name: string;
  customer_wa_id: string;
  last_message_text: string;
};

export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** `now` decides whether the takeover pause is still running and whether the 24 h window is open. */
export function toConversationDTO(r: ConversationRow, now: Date): ConversationDTO {
  const paused = r.ai_paused_until !== null && r.ai_paused_until.getTime() > now.getTime();
  return {
    id: r.id,
    customer: { name: r.customer_name, phone: `+${r.customer_wa_id}` },
    lastMessageAt: r.last_message_at.toISOString(),
    lastMessagePreview: r.last_message_text.slice(0, 120),
    aiPausedUntil: paused ? iso(r.ai_paused_until) : null,
    needsAttention: r.needs_attention,
    unreadCount: r.unread_count,
    canReply:
      r.last_customer_message_at !== null && now.getTime() - r.last_customer_message_at.getTime() < REPLY_WINDOW_MS,
    rev: r.rev,
  };
}

/** SQL fragment returning ConversationRow; append WHERE/ORDER BY (alias c = conversations). */
export const CONVERSATION_SELECT = `
  SELECT c.*, cu.display_name AS customer_name, cu.wa_id AS customer_wa_id,
         COALESCE((SELECT m.text FROM messages m
                    WHERE m.conversation_id = c.id
                    ORDER BY m.created_at DESC LIMIT 1), '') AS last_message_text
    FROM conversations c
    JOIN customers cu ON cu.id = c.customer_id`;

export type MessageStatus = 'received' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export type MessageDTO = {
  id: string;
  conversationId: string;
  role: MessageRole;
  kind: string;
  text: string;
  status: MessageStatus;
  /** Set for messages the owner sent from the app. */
  clientId: string | null;
  createdAt: string;
  rev: number;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  role: MessageRole;
  kind: string;
  text: string;
  status: MessageStatus;
  client_id: string | null;
  created_at: Date;
  rev: number;
};

export function toMessageDTO(r: MessageRow): MessageDTO {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role,
    kind: r.kind,
    text: r.text,
    status: r.status,
    clientId: r.client_id,
    createdAt: r.created_at.toISOString(),
    rev: r.rev,
  };
}

export type AlertDTO = {
  id: string;
  conversationId: string;
  kind: AlertKind;
  summary: string;
  status: 'open' | 'done';
  createdAt: string;
  rev: number;
};

export type AlertRow = {
  id: string;
  conversation_id: string;
  kind: AlertKind;
  summary: string;
  status: 'open' | 'done';
  created_at: Date;
  rev: number;
};

export function toAlertDTO(r: AlertRow): AlertDTO {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    kind: r.kind,
    summary: r.summary,
    status: r.status,
    createdAt: r.created_at.toISOString(),
    rev: r.rev,
  };
}
