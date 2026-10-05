import { serve } from '@hono/node-server';

import { createApp } from './app';
import { loadConfig } from './config';
import { createDeps } from './wiring';

const config = loadConfig();
const deps = createDeps(config);
const app = createApp(deps);

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  deps.log.info(`API listening on http://localhost:${info.port}`);
});

function shutdown() {
  server.close(() => {
    void deps.db.end().then(() => process.exit(0));
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
