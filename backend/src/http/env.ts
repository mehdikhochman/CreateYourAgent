/** Hono context variables set by requireAuth. */
export type AuthVars = {
  ownerId: string;
  shopId: string;
  sessionId: string;
};

export type AppEnv = { Variables: AuthVars };
