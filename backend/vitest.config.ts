import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['src/test/global-setup.ts'],
    // Tests share one Postgres database and truncate it between tests.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
