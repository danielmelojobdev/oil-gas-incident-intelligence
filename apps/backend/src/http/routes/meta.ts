/** Health, sources and product metadata. */
import type { FastifyInstance } from 'fastify';
import { PRODUCT, MOCK_BANNER } from '@ogii/domain';
import type { ServerDeps } from '../server';

export async function registerMetaRoutes(app: FastifyInstance, deps: ServerDeps): Promise<void> {
  const { container, queue, scheduler } = deps;

  app.get('/health', async () => {
    const [db, providerHealth] = await Promise.all([
      container.db.healthCheck(),
      Promise.all(container.providers.map((provider) => provider.healthCheck())),
    ]);
    return {
      status: db.healthy ? 'ok' : 'degraded',
      mode: container.env.APP_MODE,
      version: '0.1.0',
      database: db,
      ai: { provider: container.ai.id, available: container.ai.isAvailable() },
      push: { provider: container.push.id },
      providers: providerHealth,
      scanner: {
        running: queue.isRunning,
        frequency: scheduler.frequency,
        nextScheduledRun: scheduler.nextScheduledRun,
      },
    };
  });

  app.get('/v1/meta', async () => ({
    product: PRODUCT.name,
    mode: container.env.APP_MODE,
    isMock: container.env.APP_MODE === 'mock',
    mockBanner: container.env.APP_MODE === 'mock' ? MOCK_BANNER : null,
    disclaimer: PRODUCT.disclaimer,
    dataCaveat: PRODUCT.dataCaveat,
    severityCaveat: PRODUCT.severityCaveat,
  }));

  app.get('/v1/sources', async () => {
    const sources = await container.db.listSources();
    return { items: sources, total: sources.length };
  });
}
