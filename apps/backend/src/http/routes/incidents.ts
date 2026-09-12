/** Feed, search, incident detail, report model and per-user state. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  buildIncidentReport,
  incidentFiltersSchema,
  userIncidentStateSchema,
} from '@ogii/domain';
import type { ServerDeps } from '../server';
import { requireUser, resolveAuth } from '../auth';
import { NotFoundError } from '../../util/errors';

/** Query strings arrive as strings; coerce before the domain schema sees them. */
const csvArray = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => {
    if (value === undefined) return [];
    const parts = Array.isArray(value) ? value : value.split(',');
    return parts.map((part) => part.trim()).filter((part) => part.length > 0);
  });

const booleanish = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => value === true || value === 'true' || value === '1');

const queryToFilters = z
  .object({
    period: z.string().optional(),
    dateAxis: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    q: z.string().optional(),
    query: z.string().optional(),
    filter: z.string().optional(),
    sectors: csvArray,
    severities: csvArray,
    confidences: csvArray,
    countries: csvArray,
    operators: csvArray,
    environments: csvArray,
    lifecycleStages: csvArray,
    incidentTypes: csvArray,
    states: csvArray,
    wellIntegrityOnly: booleanish,
    processSafetyOnly: booleanish,
    includeArchived: booleanish,
    minRelevance: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
    cursor: z.string().optional(),
    sort: z.string().optional(),
  })
  .transform((value) =>
    incidentFiltersSchema.parse({
      period: value.period ?? 'last_30_days',
      dateAxis: value.dateAxis ?? 'incident_date',
      from: value.from ?? null,
      to: value.to ?? null,
      query: value.q ?? value.query ?? null,
      feedFilter: value.filter ?? 'all',
      sectors: value.sectors,
      severities: value.severities,
      confidences: value.confidences,
      countries: value.countries,
      operators: value.operators,
      environments: value.environments,
      lifecycleStages: value.lifecycleStages,
      incidentTypes: value.incidentTypes,
      states: value.states,
      wellIntegrityOnly: value.wellIntegrityOnly,
      processSafetyOnly: value.processSafetyOnly,
      includeArchived: value.includeArchived,
      minRelevance: value.minRelevance ?? 0,
      limit: value.limit ?? 25,
      cursor: value.cursor ?? null,
      sort: value.sort ?? 'incident_date_desc',
    }),
  );

const idParams = z.object({ id: z.string().min(1).max(200) });

export async function registerIncidentRoutes(app: FastifyInstance, deps: ServerDeps): Promise<void> {
  const { container } = deps;

  app.get('/v1/incidents', async (request) => {
    const auth = resolveAuth(request, container.env);
    const filters = queryToFilters.parse(request.query);
    return container.db.listIncidents(filters, auth.userId, container.now());
  });

  // Search is the same query surface with a required term; kept as its own route so the
  // app can evolve them independently (ranking, suggestions) without breaking the feed.
  app.get('/v1/search', async (request) => {
    const auth = resolveAuth(request, container.env);
    const filters = queryToFilters.parse(request.query);
    return container.db.listIncidents(
      { ...filters, period: filters.query === null ? filters.period : 'all_time' },
      auth.userId,
      container.now(),
    );
  });

  app.get('/v1/dashboard', async (request) => {
    const auth = resolveAuth(request, container.env);
    return container.db.getDashboard(auth.userId, container.now());
  });

  app.get('/v1/incidents/:id', async (request) => {
    const auth = resolveAuth(request, container.env);
    const { id } = idParams.parse(request.params);
    const incident = await container.db.getIncident(id, auth.userId);
    if (incident === null) throw new NotFoundError('Incident');
    return incident;
  });

  /** The PDF report model. Built in the domain so the app and a future server-side
   *  renderer produce byte-identical content. */
  app.get('/v1/incidents/:id/report', async (request) => {
    const auth = resolveAuth(request, container.env);
    const { id } = idParams.parse(request.params);
    const incident = await container.db.getIncident(id, auth.userId);
    if (incident === null) throw new NotFoundError('Incident');
    const report = buildIncidentReport(incident, container.now());
    if (auth.userId !== null) await container.db.recordExport(auth.userId, id, 'pdf', null);
    return report;
  });

  app.post('/v1/incidents/:id/state', async (request) => {
    const auth = resolveAuth(request, container.env);
    const userId = requireUser(auth);
    const { id } = idParams.parse(request.params);
    const { state } = z.object({ state: userIncidentStateSchema }).parse(request.body);

    const incident = await container.db.getIncident(id, userId);
    if (incident === null) throw new NotFoundError('Incident');

    await container.db.setUserIncidentState(userId, id, state);
    return { id, state };
  });
}
