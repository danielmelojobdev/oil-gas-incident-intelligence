/**
 * Postgres integration tests.
 *
 * Skipped unless DATABASE_URL points at a database with the migrations applied, so the
 * suite stays runnable with no infrastructure. Run them with:
 *
 *   createdb ogii
 *   psql -d ogii -f supabase/migrations/0001_init.sql
 *   psql -d ogii -f supabase/migrations/0003_seed_sources.sql
 *   DATABASE_URL=postgresql://localhost:5432/ogii npm test
 *
 * These exist because the adapter was written long before it ever met a database, and
 * the first contact found a real defect: `detected_at` was sent as an explicit NULL,
 * and a column DEFAULT does not apply to an explicit NULL.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EMPTY_CONSEQUENCES, incidentFiltersSchema } from '@ogii/domain';
import { PostgresDatabase } from '../src/db/postgres-database';
import { silentLogger } from '../src/logger';
import type { IncidentInput } from '../src/db/database';

const connectionString = process.env.DATABASE_URL ?? '';
const enabled = connectionString.startsWith('postgres');
const suite = enabled ? describe : describe.skip;

const NOW = new Date('2026-09-12T12:00:00.000Z');

function minimalIncident(title: string): IncidentInput {
  return {
    title,
    summary: 'A summary.',
    incidentDate: '2026-09-10',
    incidentTime: null,
    incidentDateIsEstimated: false,
    country: 'United Kingdom',
    countryCode: 'GB',
    region: null,
    city: null,
    basin: null,
    block: null,
    field: null,
    latitude: null,
    longitude: null,
    operator: 'Caledonia Offshore Energy Ltd',
    company: null,
    licenceHolder: null,
    drillingContractor: null,
    serviceCompany: null,
    pipelineOperator: null,
    asset: 'Kestrel Deep Alpha',
    installation: null,
    installationType: 'fixed_platform',
    vessel: null,
    wellName: null,
    wellNumber: null,
    wellType: null,
    wellStatus: null,
    oilGasSector: 'upstream',
    environment: 'offshore',
    waterDepthCategory: null,
    lifecycleStage: 'production',
    incidentType: 'fire',
    secondaryIncidentTypes: [],
    isWellIntegrityRelated: false,
    wellIntegrityCategory: null,
    suspectedFailedComponent: null,
    barrierFunctionImpacted: null,
    isProcessSafetyEvent: true,
    processSafetyCategory: 'fire',
    severity: 'high',
    severityScore: 68,
    confidence: 'medium',
    confidenceScore: 60,
    relevanceScore: 90,
    consequences: { ...EMPTY_CONSEQUENCES, fatalities: 0, injuries: 2 },
    status: 'new',
    isMock: true,
  };
}

suite('PostgresDatabase (integration)', () => {
  let db: PostgresDatabase;

  beforeAll(async () => {
    db = new PostgresDatabase({ connectionString, logger: silentLogger });
    await db.init();
  });

  afterAll(async () => {
    await db.close();
  });

  it('reports healthy', async () => {
    const health = await db.healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.message).toContain('postgres');
  });

  it('creates an incident without an explicit detectedAt', async () => {
    // Regression: an explicit NULL bypasses the column DEFAULT, so this used to fail
    // with 'null value in column "detected_at" violates not-null constraint'.
    const incident = await db.createIncident(minimalIncident('Integration: timestamps default'), null);
    expect(incident.detectedAt).toBeTruthy();
    expect(incident.lastUpdatedAt).toBeTruthy();
    expect(Number.isNaN(Date.parse(incident.detectedAt))).toBe(false);
  });

  it('round-trips every column group through the schema', async () => {
    const created = await db.createIncident(minimalIncident('Integration: round trip'), null);
    const read = await db.getIncident(created.id, null);
    expect(read).not.toBeNull();
    expect(read?.operator).toBe('Caledonia Offshore Energy Ltd');
    expect(read?.installationType).toBe('fixed_platform');
    expect(read?.consequences.injuries).toBe(2);
    // 0 must survive as 0, and unknown must survive as null.
    expect(read?.consequences.fatalities).toBe(0);
    expect(read?.consequences.missingPersons).toBeNull();
  });

  it('attaches an article and recomputes the denormalised counters', async () => {
    const incident = await db.createIncident(minimalIncident('Integration: counters'), null);
    const article = await db.insertArticle({
      provider: 'mock',
      publisher: 'Integration Wire',
      title: 'Integration article',
      originalUrl: `https://example.com/integration/${incident.id}`,
      canonicalUrl: null,
      normalizedUrl: `https://example.com/integration/${incident.id}`,
      publishedAt: NOW.toISOString(),
      author: null,
      language: 'en',
      excerpt: 'An excerpt.',
      sourceTier: 1,
      titleHash: `t-${incident.id}`,
      contentHash: `c-${incident.id}`,
      scanRunId: null,
      relevanceScore: 90,
      rejectedReason: null,
      isMock: true,
    });

    await db.attachArticle(incident.id, article.id, {
      isPrimary: true,
      matchScore: null,
      matchReason: 'integration',
      matchedBy: 'rules',
    });

    const read = await db.getIncident(incident.id, null);
    expect(read?.articles).toHaveLength(1);
    expect(read?.sourceCount).toBe(1);
    expect(read?.highestSourceTier).toBe(1);
    // A tier-1 source must flip the official-source flag.
    expect(read?.hasOfficialSource).toBe(true);
  });

  it('enforces the unique constraint that guarantees no article is ingested twice', async () => {
    const url = `https://example.com/unique/${Date.now()}`;
    const input = {
      provider: 'mock',
      publisher: 'Integration Wire',
      title: 'Duplicate candidate',
      originalUrl: url,
      canonicalUrl: null,
      normalizedUrl: url,
      publishedAt: NOW.toISOString(),
      author: null,
      language: 'en' as const,
      excerpt: null,
      sourceTier: 3 as const,
      titleHash: 'dup-title',
      contentHash: 'dup-content',
      scanRunId: null,
      relevanceScore: 80,
      rejectedReason: null,
      isMock: true,
    };
    const first = await db.insertArticle(input);
    const second = await db.insertArticle(input);
    expect(second.id).toBe(first.id);
  });

  it('finds known articles by every deduplication key', async () => {
    const url = `https://example.com/keys/${Date.now()}`;
    await db.insertArticle({
      provider: 'mock',
      publisher: 'Integration Wire',
      title: 'Key lookup',
      originalUrl: url,
      canonicalUrl: url,
      normalizedUrl: url,
      publishedAt: NOW.toISOString(),
      author: null,
      language: 'en',
      excerpt: null,
      sourceTier: 3,
      titleHash: 'key-title-hash',
      contentHash: 'key-content-hash',
      scanRunId: null,
      relevanceScore: 80,
      rejectedReason: null,
      isMock: true,
    });

    const byUrl = await db.findKnownArticles({
      normalizedUrls: [url], canonicalUrls: [], titleHashes: [], contentHashes: [],
    });
    const byTitle = await db.findKnownArticles({
      normalizedUrls: [], canonicalUrls: [], titleHashes: ['key-title-hash'], contentHashes: [],
    });
    const byContent = await db.findKnownArticles({
      normalizedUrls: [], canonicalUrls: [], titleHashes: [], contentHashes: ['key-content-hash'],
    });
    expect(byUrl.length).toBeGreaterThan(0);
    expect(byTitle.length).toBeGreaterThan(0);
    expect(byContent.length).toBeGreaterThan(0);
  });

  it('filters the feed with SQL and the shared helpers in agreement', async () => {
    const page = await db.listIncidents(
      incidentFiltersSchema.parse({ period: 'all_time', limit: 50 }),
      null,
      NOW,
    );
    expect(page.total).toBeGreaterThan(0);
    const critical = await db.listIncidents(
      incidentFiltersSchema.parse({ period: 'all_time', severities: ['critical'], limit: 50 }),
      null,
      NOW,
    );
    expect(critical.items.every((item) => item.severity === 'critical')).toBe(true);
  });

  it('uses the generated tsvector column for full-text search', async () => {
    await db.createIncident(minimalIncident('Integration: zzsearchtoken refinery event'), null);
    const found = await db.listIncidents(
      incidentFiltersSchema.parse({ period: 'all_time', query: 'zzsearchtoken', limit: 10 }),
      null,
      NOW,
    );
    expect(found.total).toBeGreaterThan(0);
  });

  it('records and reads back a scan run with provider results', async () => {
    const run = await db.createScanRun('manual', { period: 'last_30_days' }, true);
    const updated = await db.updateScanRun(run.id, {
      status: 'completed',
      newIncidents: 3,
      providerResults: [
        { provider: 'mock', queriesExecuted: 5, resultsFound: 20, durationMs: 100, errorCount: 0, retryCount: 0, healthy: true, errorMessage: null },
      ],
    });
    expect(updated.status).toBe('completed');
    expect(updated.newIncidents).toBe(3);
    expect(updated.providerResults).toHaveLength(1);
    expect((await db.getLatestScanRun())?.id).toBeTruthy();
  });

  it('suppresses a repeat notification through the unique constraint', async () => {
    const incident = await db.createIncident(minimalIncident('Integration: notification'), null);
    const input = {
      userId: null,
      incidentId: incident.id,
      materialUpdateId: null,
      kind: 'new_incident' as const,
      title: 'NEW OIL & GAS INCIDENT',
      body: 'body',
      updateFingerprint: 'fp-integration',
    };
    expect(await db.hasNotification(null, incident.id, 'fp-integration')).toBe(false);
    await db.recordNotification(input, 'sent', null);
    expect(await db.hasNotification(null, incident.id, 'fp-integration')).toBe(true);
    // A second write must not throw and must not create a duplicate.
    await db.recordNotification(input, 'sent', null);
  });

  it('lists the seeded source catalogue with tiers', async () => {
    const sources = await db.listSources();
    expect(sources.length).toBeGreaterThan(20);
    expect(sources.some((source) => source.tier === 1 && source.isOfficial)).toBe(true);
  });

  it('builds the dashboard from real rows', async () => {
    const dashboard = await db.getDashboard(null, NOW);
    expect(dashboard.incidentsLast30Days).toBeGreaterThan(0);
    expect(dashboard.trend).toHaveLength(30);
  });
});
