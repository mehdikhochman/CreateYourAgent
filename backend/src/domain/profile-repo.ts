import type { DbClient } from '../db/pool';
import type { AssistantAction, CatalogItem, CategoryId, LearnedAnswer, ShopProfile, Tone } from './types';

type ShopRow = {
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
  owner_name: string;
  owner_phone: string;
};

/** Loads the full profile the assistant answers from. Returns null if the shop doesn't exist. */
export async function loadShopProfile(db: DbClient, shopId: string): Promise<ShopProfile | null> {
  const shop = await db.query<ShopRow>(
    `SELECT s.*, o.first_name AS owner_name, o.phone AS owner_phone
       FROM shops s JOIN owners o ON o.id = s.owner_id
      WHERE s.id = $1`,
    [shopId],
  );
  const s = shop.rows[0];
  if (!s) return null;

  const [catalog, answers] = await Promise.all([
    db.query<{ id: string; name: string; price_fcfa: number | null; available: boolean; position: number }>(
      `SELECT id, name, price_fcfa, available, position
         FROM catalog_items
        WHERE shop_id = $1 AND deleted_at IS NULL
        ORDER BY position, created_at`,
      [shopId],
    ),
    db.query<{
      id: string;
      question: string;
      action: AssistantAction;
      product_id: string | null;
      answer: string;
      source: 'manual' | 'correction';
    }>(
      `SELECT id, question, action, product_id, answer, source
         FROM learned_answers
        WHERE shop_id = $1 AND deleted_at IS NULL
        ORDER BY created_at`,
      [shopId],
    ),
  ]);

  return {
    shopId: s.id,
    ownerName: s.owner_name,
    ownerPhone: s.owner_phone,
    category: s.category,
    name: s.name,
    location: s.location,
    hours: s.hours,
    deliveryFee: s.delivery_fee,
    tiktok: s.tiktok,
    instagram: s.instagram,
    facebook: s.facebook,
    salesChannels: s.sales_channels,
    serviceModes: s.service_modes,
    deliveryZones: s.delivery_zones,
    payments: s.payments,
    tone: s.tone,
    takeoverMinutes: s.takeover_minutes,
    catalog: catalog.rows.map(
      (r): CatalogItem => ({
        id: r.id,
        name: r.name,
        priceFcfa: r.price_fcfa,
        available: r.available,
        position: r.position,
      }),
    ),
    answers: answers.rows.map(
      (r): LearnedAnswer => ({
        id: r.id,
        question: r.question,
        action: r.action,
        productId: r.product_id,
        answer: r.answer,
        source: r.source,
      }),
    ),
  };
}
