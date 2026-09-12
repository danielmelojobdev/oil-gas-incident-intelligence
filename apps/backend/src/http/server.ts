/** Fastify server: validation at the boundary, typed errors, structured logs. */
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import type { Container } from '../container';
import type { ScanQueue } from '../scanner/scan-queue';
import type { ScanScheduler } from '../scheduler/cron';
import { AppError } from '../util/errors';
import { registerIncidentRoutes } from './routes/incidents';
import { registerScanRoutes } from './routes/scans';
import { registerUserRoutes } from './routes/users';
import { registerMetaRoutes } from './routes/meta';

export interface ServerDeps {
  readonly container: Container;
  readonly queue: ScanQueue;
  readonly scheduler: ScanScheduler;
}

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const { container } = deps;
  const app = Fastify({
    logger: false, // we emit our own structured logs
    bodyLimit: 256 * 1024,
    trustProxy: true,
  });

  await app.register(cors, {
    origin: container.env.CORS_ORIGINS.includes('*') ? true : container.env.CORS_ORIGINS,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization', 'x-admin-token', 'x-device-id'],
  });

  await app.register(rateLimit, {
    max: container.env.RATE_LIMIT_PER_MINUTE,
    timeWindow: '1 minute',
    // Privileged calls carry the admin token and are exempt from the per-IP budget.
    allowList: (request) => request.headers['x-admin-token'] === container.env.ADMIN_API_TOKEN,
  });

  app.addHook('onRequest', async (request) => {
    request.startTime = Date.now();
  });

  app.addHook('onResponse', async (request, reply) => {
    container.logger.debug('request', {
      method: request.method,
      path: request.url.split('?')[0],
      status: reply.statusCode,
      durationMs: Date.now() - (request.startTime ?? Date.now()),
    });
  });

  app.setErrorHandler((rawError: unknown, request, reply) => {
    const error = rawError as Error & { statusCode?: number };
    if (error instanceof AppError) {
      void reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details ?? null },
      });
      return;
    }
    if (error instanceof ZodError) {
      void reply.status(400).send({
        error: {
          code: 'validation_error',
          message: 'Request validation failed',
          details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        },
      });
      return;
    }
    const statusCode = typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (statusCode >= 500) {
      container.logger.error('unhandled request error', {
        method: request.method,
        path: request.url.split('?')[0],
        error: error.message,
        stack: error.stack,
      });
    }
    void reply.status(statusCode).send({
      error: {
        code: statusCode === 429 ? 'rate_limited' : 'internal_error',
        // Never leak internals to the client.
        message: statusCode >= 500 ? 'Internal server error' : error.message,
        details: null,
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).send({
      error: { code: 'not_found', message: `No route for ${request.method} ${request.url}`, details: null },
    });
  });

  await registerMetaRoutes(app, deps);
  await registerIncidentRoutes(app, deps);
  await registerScanRoutes(app, deps);
  await registerUserRoutes(app, deps);

  return app;
}

declare module 'fastify' {
  interface FastifyRequest {
    startTime?: number;
  }
}
