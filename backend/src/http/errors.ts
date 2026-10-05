import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';

import type { Logger } from '../deps';

/**
 * Error with a stable machine code for the app, e.g.
 * `throw new ApiError(409, 'outside_reply_window', 'Le client doit réécrire')`.
 * Responses look like { "error": { "code": "...", "message": "..." } }.
 */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function errorHandler(log: Logger) {
  return (err: Error, c: Context) => {
    if (err instanceof ApiError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    if (err instanceof ZodError) {
      return c.json({ error: { code: 'invalid_request', message: 'Invalid request', issues: err.issues } }, 400);
    }
    if (err instanceof HTTPException) {
      return c.json({ error: { code: 'http_error', message: err.message } }, err.status);
    }
    log.error('unhandled error', { path: c.req.path, error: err.message, stack: err.stack });
    return c.json({ error: { code: 'internal', message: 'Internal error' } }, 500);
  };
}
