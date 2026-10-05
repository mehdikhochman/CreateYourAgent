/**
 * GET/PUT/DELETE /channels/whatsapp. Stage 1 links a Meta test number by its
 * phone_number_id; Embedded Signup (POST /channels/whatsapp) comes later.
 */
import { Hono } from 'hono';
import { z } from 'zod';

import { withTransaction } from '../db/pool';
import type { AppDeps } from '../deps';
import { ApiError } from '../http/errors';
import type { AppEnv } from '../http/env';
import { parseBody } from '../http/validate';
import { lockShop, touchShop } from './sql';

export type ChannelDTO = {
  connected: boolean;
  phoneNumberId: string | null;
  displayPhone: string | null;
};

type ChannelRow = { phone_number_id: string; display_phone: string; status: 'connected' | 'disconnected' };

function toChannelDTO(row: ChannelRow | undefined): ChannelDTO {
  if (!row) return { connected: false, phoneNumberId: null, displayPhone: null };
  return { connected: row.status === 'connected', phoneNumberId: row.phone_number_id, displayPhone: row.display_phone };
}

const ChannelBody = z.object({
  phoneNumberId: z.string().trim().regex(/^\d{5,30}$/),
  displayPhone: z.string().trim().max(30).default(''),
});

const numberTaken = () => new ApiError(409, 'number_taken', 'Ce numéro WhatsApp est déjà relié à une autre boutique.');

function isUniqueViolation(err: unknown, constraint: string): boolean {
  const e = err as { code?: string; constraint?: string };
  return e.code === '23505' && e.constraint === constraint;
}

export function channelRoutes(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get('/channels/whatsapp', async (c) => {
    const res = await deps.db.query<ChannelRow>(
      'SELECT phone_number_id, display_phone, status FROM channels WHERE shop_id = $1',
      [c.var.shopId],
    );
    return c.json(toChannelDTO(res.rows[0]));
  });

  app.put('/channels/whatsapp', async (c) => {
    const body = await parseBody(c, ChannelBody);
    const shopId = c.var.shopId;
    try {
      const row = await withTransaction(deps.db, async (tx) => {
        await lockShop(tx, shopId);
        const holder = await tx.query<{ shop_id: string }>('SELECT shop_id FROM channels WHERE phone_number_id = $1', [
          body.phoneNumberId,
        ]);
        if (holder.rows[0] && holder.rows[0].shop_id !== shopId) throw numberTaken();
        const res = await tx.query<ChannelRow>(
          `INSERT INTO channels (shop_id, phone_number_id, display_phone, status, connected_at)
           VALUES ($1, $2, $3, 'connected', $4)
           ON CONFLICT (shop_id) DO UPDATE SET
             phone_number_id = EXCLUDED.phone_number_id,
             display_phone = EXCLUDED.display_phone,
             status = 'connected',
             connected_at = EXCLUDED.connected_at
           RETURNING phone_number_id, display_phone, status`,
          [shopId, body.phoneNumberId, body.displayPhone, deps.clock.now()],
        );
        // The profile carries whatsapp.connected: make it sync again.
        await touchShop(tx, shopId);
        return res.rows[0];
      });
      return c.json(toChannelDTO(row));
    } catch (err) {
      // Another shop linked the same number between our check and our insert.
      if (isUniqueViolation(err, 'channels_phone_number_id_key')) throw numberTaken();
      throw err;
    }
  });

  app.delete('/channels/whatsapp', async (c) => {
    const shopId = c.var.shopId;
    await withTransaction(deps.db, async (tx) => {
      const res = await tx.query('DELETE FROM channels WHERE shop_id = $1', [shopId]);
      if (res.rowCount) await touchShop(tx, shopId);
    });
    return c.body(null, 204);
  });

  return app;
}
