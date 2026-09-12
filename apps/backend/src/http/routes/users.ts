/** Device registration, preferences and GDPR endpoints. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { userPreferencesSchema } from '@ogii/domain';
import type { ServerDeps } from '../server';
import { requireUser, resolveAuth } from '../auth';

const deviceSchema = z.object({
  expoPushToken: z.string().min(10).max(256),
  platform: z.enum(['ios', 'android', 'web']).nullable().default(null),
  appVersion: z.string().max(40).nullable().default(null),
});

export async function registerUserRoutes(app: FastifyInstance, deps: ServerDeps): Promise<void> {
  const { container } = deps;

  app.post('/v1/devices', async (request) => {
    const auth = resolveAuth(request, container.env);
    const body = deviceSchema.parse(request.body);
    await container.db.registerDevice({
      userId: auth.userId,
      expoPushToken: body.expoPushToken,
      platform: body.platform,
      appVersion: body.appVersion,
    });
    return { registered: true };
  });

  app.get('/v1/preferences', async (request) => {
    const auth = resolveAuth(request, container.env);
    const userId = requireUser(auth);
    return container.db.getUserPreferences(userId);
  });

  app.put('/v1/preferences', async (request) => {
    const auth = resolveAuth(request, container.env);
    const userId = requireUser(auth);
    const preferences = userPreferencesSchema.parse(request.body);
    return container.db.saveUserPreferences(userId, preferences);
  });

  // --- GDPR (brief section 59) -------------------------------------------

  app.get('/v1/me/export', async (request) => {
    const auth = resolveAuth(request, container.env);
    const userId = requireUser(auth);
    return {
      exportedAt: container.now().toISOString(),
      userId,
      data: await container.db.exportUserData(userId),
    };
  });

  app.delete('/v1/me', async (request) => {
    const auth = resolveAuth(request, container.env);
    const userId = requireUser(auth);
    await container.db.deleteUserData(userId);
    return { deleted: true, userId };
  });
}
