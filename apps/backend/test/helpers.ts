import { scanConfigSchema, type ScanConfig } from '@ogii/domain';
import { MemoryDatabase } from '../src/db/memory-database';
import { MockAiProvider } from '../src/ai/mock-ai-provider';
import { MockNewsProvider } from '../src/news/mock-news-provider';
import { MockPushProvider } from '../src/notifications/mock-push-provider';
import { NotificationDispatcher } from '../src/scanner/notifications';
import { AccidentNewsScanner } from '../src/scanner/scanner';
import { silentLogger } from '../src/logger';

export const TEST_NOW = new Date('2026-09-12T12:00:00.000Z');

export interface TestRig {
  readonly db: MemoryDatabase;
  readonly push: MockPushProvider;
  readonly scanner: AccidentNewsScanner;
  readonly notifications: NotificationDispatcher;
  readonly config: ScanConfig;
}

export async function createTestRig(
  options: { seedMockData?: boolean; includeBreaking?: boolean; includeNoise?: boolean } = {},
): Promise<TestRig> {
  const db = new MemoryDatabase({ seedMockData: options.seedMockData ?? false, now: () => TEST_NOW });
  await db.init();

  const push = new MockPushProvider(silentLogger);
  const notifications = new NotificationDispatcher({
    db,
    push,
    logger: silentLogger,
    notifyMinConfidence: 0.7,
  });

  const scanner = new AccidentNewsScanner({
    db,
    ai: new MockAiProvider(),
    providers: [
      new MockNewsProvider({
        now: TEST_NOW,
        includeBreaking: options.includeBreaking ?? true,
        includeNoise: options.includeNoise ?? true,
      }),
    ],
    notifications,
    logger: silentLogger,
    now: () => TEST_NOW,
    isMock: true,
    aiConcurrency: 4,
  });

  const config = scanConfigSchema.parse({
    period: 'last_30_days',
    languages: ['en', 'pt', 'es'],
    maxQueries: 40,
    maxResultsPerQuery: 25,
    maxAiExtractions: 120,
  });

  return { db, push, scanner, notifications, config };
}
