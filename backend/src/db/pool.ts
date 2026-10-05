import pg from 'pg';

export type Db = pg.Pool;
export type DbClient = pg.Pool | pg.PoolClient;

// Postgres returns bigint (int8) as a string by default. Our bigints (rev,
// job ids) stay far below 2^53, so read them as numbers.
pg.types.setTypeParser(20, (v) => Number.parseInt(v, 10));

export function createPool(databaseUrl: string): Db {
  return new pg.Pool({ connectionString: databaseUrl, max: 10 });
}

/** Runs `fn` inside a transaction; rolls back if it throws. */
export async function withTransaction<T>(db: Db, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
