import type { Env } from '../env';
import type { Logger } from '../logger';
import type { Database } from './database';
import { MemoryDatabase } from './memory-database';
import { PostgresDatabase } from './postgres-database';

export function createDatabase(env: Env, logger: Logger, now: () => Date): Database {
  if (env.DATABASE_DRIVER === 'postgres' && env.DATABASE_URL !== null) {
    return new PostgresDatabase({ connectionString: env.DATABASE_URL, logger });
  }
  logger.info('database: in-memory', { seedMockData: env.APP_MODE === 'mock' });
  return new MemoryDatabase({ seedMockData: env.APP_MODE === 'mock', now });
}

export type { Database } from './database';
export { MemoryDatabase } from './memory-database';
export { PostgresDatabase } from './postgres-database';
