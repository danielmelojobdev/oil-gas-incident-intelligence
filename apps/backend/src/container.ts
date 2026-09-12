/**
 * Composition root. The only place that wires concrete adapters to ports.
 */
import { DEFAULT_SCAN_LIMITS, scanConfigSchema, type ScanConfig } from '@ogii/domain';
import { createAiProvider } from './ai/registry';
import type { AIProvider } from './ai/ai-provider';
import { createDatabase } from './db';
import type { Database } from './db/database';
import { loadEnv, loadedEnvFile, type Env } from './env';
import { createLogger, type Logger } from './logger';
import { createNewsProviders } from './news/registry';
import type { NewsSourceProvider } from './news/news-source-provider';
import { createPushProvider } from './notifications';
import type { PushProvider } from './notifications/push-provider';
import { AccidentNewsScanner } from './scanner/scanner';
import { NotificationDispatcher } from './scanner/notifications';
import type { HttpOptions } from './util/http';

export interface Container {
  readonly env: Env;
  readonly logger: Logger;
  readonly db: Database;
  readonly ai: AIProvider;
  readonly providers: readonly NewsSourceProvider[];
  readonly push: PushProvider;
  readonly notifications: NotificationDispatcher;
  readonly scanner: AccidentNewsScanner;
  readonly http: HttpOptions;
  readonly now: () => Date;
  defaultScanConfig(): ScanConfig;
  shutdown(): Promise<void>;
}

export interface ContainerOptions {
  readonly env?: Env;
  readonly now?: () => Date;
  readonly logger?: Logger;
}

export async function createContainer(options: ContainerOptions = {}): Promise<Container> {
  const env = options.env ?? loadEnv();
  const now = options.now ?? (() => new Date());
  const logger = options.logger ?? createLogger(env.LOG_LEVEL, { app: 'ogii-backend', mode: env.APP_MODE });

  const http: HttpOptions = {
    timeoutMs: env.HTTP_TIMEOUT_MS,
    maxRetries: env.HTTP_MAX_RETRIES,
    userAgent: env.HTTP_USER_AGENT,
    logger,
  };

  if (loadedEnvFile !== null) logger.info('configuration loaded', { envFile: loadedEnvFile });

  const db = createDatabase(env, logger, now);
  await db.init();

  const ai = createAiProvider(env, logger, http);
  const providers = createNewsProviders(env, logger, http, { now });
  const push = createPushProvider(env, logger, http);

  const defaultScanConfig = (): ScanConfig =>
    scanConfigSchema.parse({
      period: env.SCAN_DEFAULT_PERIOD,
      dateAxis: 'incident_date',
      regions: ['worldwide'],
      customCountries: [],
      languages: env.SCAN_LANGUAGES,
      includeKeywords: [],
      excludeKeywords: [],
      maxQueries: env.SCAN_MAX_QUERIES,
      maxResultsPerQuery: env.SCAN_MAX_ARTICLES_PER_QUERY,
      maxAiExtractions: Math.min(env.SCAN_MAX_AI_EXTRACTIONS, DEFAULT_SCAN_LIMITS.maxArticlesPerRun),
    });

  const notifications = new NotificationDispatcher({
    db,
    push,
    logger,
    notifyMinConfidence: defaultScanConfig().notifyMinConfidence,
  });

  const scanner = new AccidentNewsScanner({
    db,
    ai,
    providers,
    notifications,
    logger,
    now,
    isMock: env.APP_MODE === 'mock',
    aiConcurrency: env.AI_MAX_CONCURRENCY,
  });

  return {
    env,
    logger,
    db,
    ai,
    providers,
    push,
    notifications,
    scanner,
    http,
    now,
    defaultScanConfig,
    shutdown: async () => {
      await db.close();
    },
  };
}
