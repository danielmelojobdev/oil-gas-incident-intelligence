/** Scan Now, scan progress and the latest run summary. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { scanConfigSchema } from '@ogii/domain';
import type { ServerDeps } from '../server';
import { requireUser, resolveAuth } from '../auth';
import { AppError, NotFoundError } from '../../util/errors';
import { SCAN_STAGES } from '../../scanner/types';

const scanRequestSchema = z.object({
  trigger: z.enum(['manual', 'scheduled', 'backfill']).default('manual'),
  config: scanConfigSchema.partial().optional(),
});

export async function registerScanRoutes(app: FastifyInstance, deps: ServerDeps): Promise<void> {
  const { container, queue, scheduler } = deps;

  /**
   * Scan Now (brief section 55).
   *
   * Any authenticated user (or device identity) may trigger a scan, because the product
   * requires it — but a scan is global and costs real money, so user-triggered runs are
   * behind a cooldown. The admin token bypasses the cooldown, which is what automation
   * and the optional Edge Function proxy use.
   *
   * Returns immediately; the app polls `/v1/scans/:id` for progress.
   */
  app.post('/v1/scans', async (request, reply) => {
    const auth = resolveAuth(request, container.env);
    if (!auth.isAdmin) requireUser(auth);

    if (!auth.isAdmin && !queue.isRunning) {
      const remaining = queue.cooldownRemaining(container.env.SCAN_MANUAL_COOLDOWN_SECONDS);
      if (remaining > 0) {
        throw new AppError(
          `A scan ran recently. Another manual scan can be started in ${remaining}s.`,
          429,
          'scan_cooldown',
          { retryAfterSeconds: remaining },
        );
      }
    }

    const body = scanRequestSchema.parse(request.body ?? {});
    const config = scanConfigSchema.parse({ ...container.defaultScanConfig(), ...(body.config ?? {}) });
    const result = await queue.enqueue(body.trigger, config);

    void reply.status(result.accepted ? 202 : 200);
    return {
      scanId: result.scanId,
      accepted: result.accepted,
      message: result.reason,
      stages: SCAN_STAGES,
    };
  });

  app.get('/v1/scans/:id', async (request) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const run = await container.db.getScanRun(id);
    if (run === null) throw new NotFoundError('Scan run');
    return {
      ...run,
      summary: {
        sourcesSearched: run.providerCount,
        articlesAnalysed: run.articlesProcessed,
        potentialIncidents: run.newIncidents + run.updatedIncidents,
        rejected: run.resultsRejected,
        duplicates: run.duplicatesFound,
        newIncidents: run.newIncidents,
        updatedIncidents: run.updatedIncidents,
      },
    };
  });

  app.get('/v1/scans/latest', async () => {
    const run = await container.db.getLatestScanRun();
    return {
      run,
      running: queue.isRunning,
      currentScanId: queue.currentScanId,
      frequency: scheduler.frequency,
      nextScheduledRun: scheduler.nextScheduledRun,
      sourcesMonitored: (await container.db.listSources()).length,
    };
  });
}
