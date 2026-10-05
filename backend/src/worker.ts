import { hostname } from 'node:os';

import { loadConfig } from './config';
import { conversationJobHandlers } from './conversations/jobs';
import { runWorker } from './jobs/worker';
import { createDeps } from './wiring';

const config = loadConfig();
const deps = createDeps(config);
const controller = new AbortController();

process.on('SIGINT', () => controller.abort());
process.on('SIGTERM', () => controller.abort());

const workerId = `${hostname()}:${process.pid}`;
deps.log.info('worker started', { workerId });
await runWorker(deps, conversationJobHandlers(deps), { workerId, signal: controller.signal });
await deps.db.end();
deps.log.info('worker stopped', { workerId });
