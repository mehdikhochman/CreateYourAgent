import pg from 'pg';

import { migrate } from '../db/migrate';
import { testDatabaseUrl } from './db-url';

/** Recreates the test database from scratch and applies all migrations, once per `vitest run`. */
export default async function setup() {
  const url = new URL(testDatabaseUrl());
  const dbName = url.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(dbName)) throw new Error(`Unsafe test database name: ${dbName}`);

  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${dbName}`);
  } finally {
    await admin.end();
  }

  const pool = new pg.Pool({ connectionString: url.toString() });
  try {
    await migrate(pool);
  } finally {
    await pool.end();
  }
}
