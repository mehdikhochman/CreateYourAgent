import type { AppDeps } from '../deps';
import type { JobHandler } from '../jobs/worker';
import { ownerSendJobHandler, SEND_OWNER_MESSAGE_JOB } from './owner-send-job';
import { REPLY_JOB, replyJobHandler } from './reply-job';

/** Job kinds the worker runs for conversations (src/worker.ts). */
export function conversationJobHandlers(deps: AppDeps): Record<string, JobHandler> {
  return {
    [REPLY_JOB]: replyJobHandler(deps),
    [SEND_OWNER_MESSAGE_JOB]: ownerSendJobHandler(deps),
  };
}
