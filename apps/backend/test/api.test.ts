import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../src/env';
import { createContainer, type Container } from '../src/container';
import { buildServer } from '../src/http/server';
import { ScanQueue } from '../src/scanner/scan-queue';
import { ScanScheduler } from '../src/scheduler/cron';
import { silentLogger } from '../src/logger';

const TEST_NOW = new Date('2026-09-12T12:00:00.000Z');
const ADMIN_TOKEN = 'test-admin-token';

describe('HTTP API', () => {
  let app: FastifyInstance;
  let container: Container;

  beforeAll(async () => {
    const env = loadEnv({
      APP_MODE: 'mock',
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
      ADMIN_API_TOKEN: ADMIN_TOKEN,
      SCAN_ENABLED: 'false',
      SCAN_SCHEDULE: 'off',
    } as NodeJS.ProcessEnv);

    container = await createContainer({ env, now: () => TEST_NOW, logger: silentLogger });
    const queue = new ScanQueue(container.scanner, silentLogger);
    const scheduler = new ScanScheduler({
      frequency: 'off',
      enabled: false,
      queue,
      logger: silentLogger,
      config: () => container.defaultScanConfig(),
      now: () => TEST_NOW,
    });
    app = await buildServer({ container, queue, scheduler });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await container.shutdown();
  });

  it('reports health with provider status', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.mode).toBe('mock');
    expect(body.ai.provider).toBe('mock');
    expect(Array.isArray(body.providers)).toBe(true);
  });

  it('exposes the mock banner and the disclaimers', async () => {
    const body = (await app.inject({ method: 'GET', url: '/v1/meta' })).json();
    expect(body.isMock).toBe(true);
    expect(body.mockBanner).toContain('MOCK DATA');
    expect(body.disclaimer).toContain('verified against the original sources');
    expect(body.dataCaveat).toContain('not an official accident rate');
  });

  it('returns the feed, defaulting to the last 30 days', async () => {
    const body = (await app.inject({ method: 'GET', url: '/v1/incidents' })).json();
    expect(body.total).toBe(15);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0]).toHaveProperty('severity');
    expect(body.items[0]).toHaveProperty('sourceCount');
    expect(body.items.every((item: { isMock: boolean }) => item.isMock)).toBe(true);
  });

  it('applies quick filters', async () => {
    const critical = (await app.inject({ method: 'GET', url: '/v1/incidents?filter=critical' })).json();
    expect(critical.items.every((item: { severity: string }) => item.severity === 'critical')).toBe(true);
    expect(critical.total).toBeGreaterThan(0);

    const wellIntegrity = (await app.inject({ method: 'GET', url: '/v1/incidents?filter=well_integrity' })).json();
    expect(wellIntegrity.total).toBeGreaterThan(0);

    const offshore = (await app.inject({ method: 'GET', url: '/v1/incidents?filter=offshore' })).json();
    expect(offshore.items.every((item: { environment: string }) =>
      ['offshore', 'subsea'].includes(item.environment),
    )).toBe(true);
  });

  it('narrows the window to today / 7 days / 30 days', async () => {
    const today = (await app.inject({ method: 'GET', url: '/v1/incidents?period=today' })).json();
    const week = (await app.inject({ method: 'GET', url: '/v1/incidents?period=last_7_days' })).json();
    const month = (await app.inject({ method: 'GET', url: '/v1/incidents?period=last_30_days' })).json();
    expect(today.total).toBeLessThanOrEqual(week.total);
    expect(week.total).toBeLessThanOrEqual(month.total);
    expect(month.total).toBe(15);
  });

  it('paginates', async () => {
    const first = (await app.inject({ method: 'GET', url: '/v1/incidents?limit=5' })).json();
    expect(first.items).toHaveLength(5);
    expect(first.nextCursor).not.toBeNull();
    const second = (
      await app.inject({ method: 'GET', url: `/v1/incidents?limit=5&cursor=${first.nextCursor}` })
    ).json();
    expect(second.items).toHaveLength(5);
    expect(second.items[0].id).not.toBe(first.items[0].id);
  });

  it('searches by keyword, operator and country', async () => {
    const byOperator = (await app.inject({ method: 'GET', url: '/v1/search?q=Caledonia' })).json();
    expect(byOperator.total).toBeGreaterThan(0);
    const byKeyword = (await app.inject({ method: 'GET', url: '/v1/search?q=refinery' })).json();
    expect(byKeyword.total).toBeGreaterThan(0);
    const noMatch = (await app.inject({ method: 'GET', url: '/v1/search?q=zzzznotathing' })).json();
    expect(noMatch.total).toBe(0);
  });

  it('returns an incident with its sources, highlights and classification', async () => {
    const feed = (await app.inject({ method: 'GET', url: '/v1/incidents?limit=50' })).json();
    const target = feed.items.find((item: { sourceCount: number }) => item.sourceCount >= 4);
    expect(target).toBeDefined();

    const response = await app.inject({ method: 'GET', url: `/v1/incidents/${target.id}` });
    expect(response.statusCode).toBe(200);
    const incident = response.json();
    expect(incident.articles.length).toBeGreaterThanOrEqual(4);
    expect(incident.highlights.length).toBeGreaterThanOrEqual(4);
    expect(incident.severity).toBeDefined();
    expect(incident.confidence).toBeDefined();
    expect(incident.articles[0].originalUrl).toMatch(/^https:\/\//);
  });

  it('404s an unknown incident', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/incidents/does-not-exist' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('not_found');
  });

  it('builds the PDF report model', async () => {
    const feed = (await app.inject({ method: 'GET', url: '/v1/incidents?limit=1' })).json();
    const report = (await app.inject({ method: 'GET', url: `/v1/incidents/${feed.items[0].id}/report` })).json();
    expect(report.documentTitle).toBe('OIL & GAS INCIDENT INTELLIGENCE REPORT');
    expect(report.sources.length).toBeGreaterThan(0);
    expect(report.disclaimer).toContain('automatically generated');
    expect(report.assessment.find((row: { label: string }) => row.label === 'Severity').value).toContain(
      'System-assessed',
    );
  });

  it('returns dashboard aggregates', async () => {
    const dashboard = (await app.inject({ method: 'GET', url: '/v1/dashboard' })).json();
    expect(dashboard.incidentsLast30Days).toBe(15);
    expect(dashboard.topOperators.length).toBeGreaterThan(0);
    expect(dashboard.bySeverity).toHaveLength(4);
    expect(dashboard.trend).toHaveLength(30);
  });

  it('lists the monitored sources with their tiers', async () => {
    const body = (await app.inject({ method: 'GET', url: '/v1/sources' })).json();
    expect(body.total).toBeGreaterThan(20);
    expect(body.items.some((item: { tier: number }) => item.tier === 1)).toBe(true);
  });

  it('refuses Scan Now to a caller with no identity at all', async () => {
    const response = await app.inject({ method: 'POST', url: '/v1/scans', payload: {} });
    expect(response.statusCode).toBe(401);
  });

  it('lets an identified user trigger Scan Now, then applies the cooldown', async () => {
    const headers = { 'x-device-id': 'device-scanner1' };
    const first = await app.inject({ method: 'POST', url: '/v1/scans', headers, payload: {} });
    expect([200, 202]).toContain(first.statusCode);

    // Let the run finish so the cooldown, not the in-flight guard, is what refuses.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const second = await app.inject({ method: 'POST', url: '/v1/scans', headers, payload: {} });
    expect(second.statusCode).toBe(429);
    expect(second.json().error.code).toBe('scan_cooldown');
  });

  it('lets the admin token bypass the cooldown and reports progress', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/scans',
      headers: { 'x-admin-token': ADMIN_TOKEN },
      payload: { trigger: 'manual' },
    });
    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body.accepted).toBe(true);
    expect(body.stages).toContain('Removing duplicates...');

    const latest = (await app.inject({ method: 'GET', url: '/v1/scans/latest' })).json();
    expect(latest.run).not.toBeNull();
    expect(latest.sourcesMonitored).toBeGreaterThan(0);
  });

  it('stores per-user incident state', async () => {
    const feed = (await app.inject({ method: 'GET', url: '/v1/incidents?limit=1' })).json();
    const id = feed.items[0].id;

    const saved = await app.inject({
      method: 'POST',
      url: `/v1/incidents/${id}/state`,
      headers: { 'x-device-id': 'device-abcdef12' },
      payload: { state: 'saved' },
    });
    expect(saved.statusCode).toBe(200);

    const savedFeed = (
      await app.inject({
        method: 'GET',
        url: '/v1/incidents?states=saved&period=all_time',
        headers: { 'x-device-id': 'device-abcdef12' },
      })
    ).json();
    expect(savedFeed.items.map((item: { id: string }) => item.id)).toContain(id);

    // Another device must not see that state.
    const otherFeed = (
      await app.inject({
        method: 'GET',
        url: '/v1/incidents?states=saved&period=all_time',
        headers: { 'x-device-id': 'device-99999999' },
      })
    ).json();
    expect(otherFeed.total).toBe(0);
  });

  it('archives an incident out of the default feed', async () => {
    const feed = (await app.inject({ method: 'GET', url: '/v1/incidents?limit=50' })).json();
    const id = feed.items[3].id;
    await app.inject({
      method: 'POST',
      url: `/v1/incidents/${id}/state`,
      headers: { 'x-device-id': 'device-archive1' },
      payload: { state: 'archived' },
    });
    const after = (
      await app.inject({ method: 'GET', url: '/v1/incidents?limit=50', headers: { 'x-device-id': 'device-archive1' } })
    ).json();
    expect(after.items.map((item: { id: string }) => item.id)).not.toContain(id);
  });

  it('registers a push device', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/devices',
      headers: { 'x-device-id': 'device-abcdef12' },
      payload: { expoPushToken: 'ExponentPushToken[api-test-0001]', platform: 'ios', appVersion: '0.1.0' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().registered).toBe(true);
  });

  it('rejects an invalid push token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/devices',
      payload: { expoPushToken: 'short' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('round-trips user preferences', async () => {
    const headers = { 'x-device-id': 'device-prefs123' };
    const initial = (await app.inject({ method: 'GET', url: '/v1/preferences', headers })).json();
    expect(initial.defaultPeriod).toBe('last_30_days');

    const updated = await app.inject({
      method: 'PUT',
      url: '/v1/preferences',
      headers,
      payload: { ...initial, theme: 'dark', notifications: { ...initial.notifications, criticalOnly: true } },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().theme).toBe('dark');

    const reread = (await app.inject({ method: 'GET', url: '/v1/preferences', headers })).json();
    expect(reread.notifications.criticalOnly).toBe(true);
  });

  it('supports GDPR export and deletion', async () => {
    const headers = { 'x-device-id': 'device-gdpr1234' };
    await app.inject({ method: 'PUT', url: '/v1/preferences', headers, payload: { theme: 'light' } });

    const exported = (await app.inject({ method: 'GET', url: '/v1/me/export', headers })).json();
    expect(exported.userId).toBe('device:device-gdpr1234');
    expect(exported.data).toHaveProperty('preferences');

    const deleted = await app.inject({ method: 'DELETE', url: '/v1/me', headers });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().deleted).toBe(true);
  });

  it('rejects an unknown route with a structured error', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('not_found');
  });

  it('validates query parameters', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/incidents?period=next_century' });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('validation_error');
  });
});
