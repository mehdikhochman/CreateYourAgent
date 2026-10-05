/**
 * Database used by tests. It is dropped and recreated on every run, so never
 * point it at a database you care about. Default matches docker-compose.yml.
 */
export function testDatabaseUrl(): string {
  return process.env.TEST_DATABASE_URL ?? 'postgres://cta:cta@localhost:5432/cta_test';
}
