import type { Env } from '../env';
import type { Logger } from '../logger';
import type { HttpOptions } from '../util/http';
import { ExpoPushProvider } from './expo-push-provider';
import { MockPushProvider } from './mock-push-provider';
import type { PushProvider } from './push-provider';

export function createPushProvider(env: Env, logger: Logger, http: HttpOptions): PushProvider {
  if (env.APP_MODE === 'mock' || env.PUSH_PROVIDER === 'mock') return new MockPushProvider(logger);
  return new ExpoPushProvider(http, env.EXPO_ACCESS_TOKEN, logger);
}

export { MockPushProvider } from './mock-push-provider';
export { ExpoPushProvider } from './expo-push-provider';
export type { PushMessage, PushProvider, PushSendResult } from './push-provider';
