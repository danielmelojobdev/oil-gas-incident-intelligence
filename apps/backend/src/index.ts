/** Entry point: build the container, start the scheduler, serve the API. */
import { createContainer } from './container';
import { buildServer } from './http/server';
import { ScanQueue } from './scanner/scan-queue';
import { ScanScheduler } from './scheduler/cron';
import { toErrorMessage } from './util/errors';

async function main(): Promise<void> {
  const container = await createContainer();
  const { env, logger } = container;

  const queue = new ScanQueue(container.scanner, logger);
  const scheduler = new ScanScheduler({
    frequency: env.SCAN_SCHEDULE,
    enabled: env.SCAN_ENABLED,
    queue,
    logger,
    config: () => container.defaultScanConfig(),
    now: container.now,
  });

  const app = await buildServer({ container, queue, scheduler });
  await app.listen({ port: env.PORT, host: env.HOST });
  scheduler.start();

  logger.info('backend ready', {
    port: env.PORT,
    mode: env.APP_MODE,
    database: container.db.driver,
    ai: container.ai.id,
    providers: container.providers.map((provider) => provider.id),
    schedule: env.SCAN_SCHEDULE,
  });

  const shutdown = (signal: string): void => {
    logger.info('shutting down', { signal });
    scheduler.stop();
    void app
      .close()
      .then(() => container.shutdown())
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        logger.error('shutdown failed', { error: toErrorMessage(error) });
        process.exit(1);
      });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ level: 'error', message: 'fatal', error: toErrorMessage(error) })}\n`);
  process.exit(1);
});
