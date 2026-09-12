/** Records what would have been sent. Used in Mock Mode and in tests. */
import type { Logger } from '../logger';
import type { PushMessage, PushProvider, PushSendResult } from './push-provider';

export class MockPushProvider implements PushProvider {
  readonly id = 'mock';
  readonly sent: PushMessage[] = [];

  constructor(private readonly logger: Logger) {}

  isAvailable(): boolean {
    return true;
  }

  async send(messages: readonly PushMessage[]): Promise<PushSendResult[]> {
    for (const message of messages) {
      this.sent.push(message);
      this.logger.info('mock push', { to: message.to, title: message.title, incidentId: message.data.incidentId });
    }
    return messages.map((message) => ({ token: message.to, ok: true, error: null }));
  }
}
