import { loadConfig } from '../config';
import { migrate } from './migrate';
import { createPool } from './pool';

const config = loadConfig();
const db = createPool(config.databaseUrl);
try {
  const applied = await migrate(db, (m) => console.log(m));
  console.log(applied.length ? `Applied ${applied.length} migration(s).` : 'Database is up to date.');
} finally {
  await db.end();
}
