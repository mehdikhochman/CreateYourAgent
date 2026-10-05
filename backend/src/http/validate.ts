import type { Context } from 'hono';
import type { z } from 'zod';

import { ApiError } from './errors';

/** Parses the JSON body with a zod schema; a bad body becomes a 400 'invalid_request'. */
export async function parseBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ApiError(400, 'invalid_json', 'Body must be JSON');
  }
  return schema.parse(raw); // ZodError → 400 in errorHandler
}

/** Parses query parameters with a zod schema. */
export function parseQuery<S extends z.ZodType>(c: Context, schema: S): z.infer<S> {
  return schema.parse(c.req.query());
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates a path parameter that must be a UUID (404 otherwise, so bad ids look like missing rows). */
export function uuidParam(c: Context, name: string): string {
  const v = c.req.param(name);
  if (!v || !UUID_RE.test(v)) throw new ApiError(404, 'not_found', 'Not found');
  return v.toLowerCase();
}
