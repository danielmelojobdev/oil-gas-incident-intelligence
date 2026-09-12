/** Expo Push Service adapter. */
import { fetchJson, type HttpOptions } from '../util/http';
import { toErrorMessage } from '../util/errors';
import type { Logger } from '../logger';
import type { PushMessage, PushProvider, PushSendResult } from './push-provider';

interface ExpoTicket {
  status?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoResponse {
  data?: ExpoTicket[];
}

const EXPO_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const MAX_BATCH = 100;

export class ExpoPushProvider implements PushProvider {
  readonly id = 'expo';

  constructor(
    private readonly http: HttpOptions,
    private readonly accessToken: string | null,
    private readonly logger: Logger,
  ) {}

  isAvailable(): boolean {
    return true; // Expo accepts unauthenticated sends; a token only raises the rate limit.
  }

  async send(messages: readonly PushMessage[]): Promise<PushSendResult[]> {
    const results: PushSendResult[] = [];

    for (let offset = 0; offset < messages.length; offset += MAX_BATCH) {
      const batch = messages.slice(offset, offset + MAX_BATCH);
      const payload = batch.map((message) => ({
        to: message.to,
        title: message.title,
        body: message.body,
        sound: message.sound ? 'default' : null,
        priority: 'high',
        channelId: 'incidents',
        data: message.data,
      }));

      try {
        const { data } = await fetchJson<ExpoResponse>(
          EXPO_ENDPOINT,
          this.http,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'application/json',
              ...(this.accessToken === null ? {} : { authorization: `Bearer ${this.accessToken}` }),
            },
            body: JSON.stringify(payload),
          },
          this.id,
        );

        batch.forEach((message, index) => {
          const ticket = data.data?.[index];
          const ok = ticket?.status === 'ok';
          results.push({
            token: message.to,
            ok,
            error: ok ? null : (ticket?.details?.error ?? ticket?.message ?? 'unknown push error'),
          });
        });
      } catch (error) {
        const message = toErrorMessage(error);
        this.logger.error('expo push batch failed', { error: message, size: batch.length });
        for (const item of batch) results.push({ token: item.to, ok: false, error: message });
      }
    }

    return results;
  }
}
