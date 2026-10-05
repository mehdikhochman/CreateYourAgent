import type { Logger, SmsSender } from '../deps';

/**
 * Stage 1 has no SMS provider: the login code is written to the server logs
 * and the developer reads it there. Replace with the Orange SMS API later.
 */
export class ConsoleSmsSender implements SmsSender {
  constructor(private readonly log: Logger) {}

  async send(phone: string, text: string): Promise<void> {
    this.log.info('sms (console, not sent)', { phone, text });
  }
}
