import { afterAll, beforeAll, beforeEach } from 'vitest';

import { createPool, type Db } from '../db/pool';
import { testDatabaseUrl } from './db-url';

const TABLES = [
  'jobs',
  'webhook_events',
  'alerts',
  'messages',
  'conversations',
  'customers',
  'channels',
  'learned_answers',
  'catalog_items',
  'shops',
  'sessions',
  'otp_codes',
  'owners',
];

/**
 * Call at the top of a test file. Opens a pool to the test database and
 * empties every table before each test.
 *
 *   const testDb = useTestDb();
 *   it('…', async () => { await testDb.db.query(…) });
 */
export function useTestDb(): { readonly db: Db } {
  let db: Db | undefined;
  beforeAll(() => {
    db = createPool(testDatabaseUrl());
  });
  beforeEach(async () => {
    await db!.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
  });
  afterAll(async () => {
    await db?.end();
  });
  return {
    get db() {
      if (!db) throw new Error('useTestDb: database not ready (use it inside tests or hooks)');
      return db;
    },
  };
}
