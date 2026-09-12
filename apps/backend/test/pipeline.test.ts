import { beforeAll, describe, expect, it } from 'vitest';
import { createTestRig, TEST_NOW, type TestRig } from './helpers';
import type { ScanSummary } from '../src/scanner/types';
import { incidentFiltersSchema } from '@ogii/domain';

describe('AccidentNewsScanner — full pipeline against an empty store', () => {
  let rig: TestRig;
  let summary: ScanSummary;

  beforeAll(async () => {
    rig = await createTestRig({ seedMockData: false });
    await rig.db.registerDevice({
      userId: 'user-1',
      expoPushToken: 'ExponentPushToken[test-device-0001]',
      platform: 'ios',
      appVersion: '0.1.0',
    });
    summary = await rig.scanner.runToCompletionSafe();
  });

  it('completes successfully', () => {
    expect(summary.run.status).toBe('completed');
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('finds and analyses articles from the providers', () => {
    expect(summary.articlesAnalysed).toBeGreaterThan(20);
  });

  it('creates incidents', () => {
    expect(summary.newIncidents).toBeGreaterThanOrEqual(10);
  });

  it('rejects out-of-scope noise (restaurant fire, coal mine, wind farm, train, oil prices)', async () => {
    expect(summary.rejected).toBeGreaterThanOrEqual(4);
    const page = await rig.db.listIncidents(
      incidentFiltersSchema.parse({ period: 'all_time', limit: 100 }),
      null,
      TEST_NOW,
    );
    const titles = page.items.map((item) => item.title.toLowerCase()).join(' | ');
    expect(titles).not.toContain('restaurant');
    expect(titles).not.toContain('coal mine');
    expect(titles).not.toContain('wind farm');
    expect(titles).not.toContain('derailment');
    expect(titles).not.toContain('oil prices rise');
  });

  it('detects duplicates rather than re-ingesting the same article', () => {
    expect(summary.duplicates).toBeGreaterThan(10);
  });

  it('groups several publishers into one incident', async () => {
    const page = await rig.db.listIncidents(
      incidentFiltersSchema.parse({ period: 'all_time', limit: 100 }),
      null,
      TEST_NOW,
    );
    const multiSource = page.items.filter((item) => item.sourceCount > 1);
    expect(multiSource.length).toBeGreaterThanOrEqual(1);

    const grouped = await rig.db.getIncident(multiSource[0]!.id, null);
    expect(grouped).not.toBeNull();
    expect(new Set(grouped!.articles.map((article) => article.publisher)).size).toBeGreaterThan(1);
  });

  it('never stores an article body, only metadata and a link', async () => {
    const page = await rig.db.listIncidents(
      incidentFiltersSchema.parse({ period: 'all_time', limit: 5 }),
      null,
      TEST_NOW,
    );
    const incident = await rig.db.getIncident(page.items[0]!.id, null);
    for (const article of incident!.articles) {
      expect(article.originalUrl).toMatch(/^https:\/\//);
      expect(article.publisher.length).toBeGreaterThan(0);
      expect((article.excerpt ?? '').length).toBeLessThanOrEqual(600);
    }
  });

  it('flags everything as mock data', async () => {
    const page = await rig.db.listIncidents(
      incidentFiltersSchema.parse({ period: 'all_time', limit: 100 }),
      null,
      TEST_NOW,
    );
    expect(page.items.every((item) => item.isMock)).toBe(true);
  });

  it('is idempotent: a second identical scan creates no new incidents', async () => {
    const before = (
      await rig.db.listIncidents(incidentFiltersSchema.parse({ period: 'all_time', limit: 100 }), null, TEST_NOW)
    ).total;

    const second = await rig.scanner.runToCompletionSafe();

    const after = (
      await rig.db.listIncidents(incidentFiltersSchema.parse({ period: 'all_time', limit: 100 }), null, TEST_NOW)
    ).total;

    expect(second.newIncidents).toBe(0);
    expect(after).toBe(before);
  });
});

describe('material updates and notification suppression', () => {
  it('notifies once for a material update and never for a plain republication', async () => {
    const rig = await createTestRig({ seedMockData: true });
    await rig.db.registerDevice({
      userId: 'user-1',
      expoPushToken: 'ExponentPushToken[test-device-0002]',
      platform: 'android',
      appVersion: '0.1.0',
    });

    const first = await rig.scanner.runToCompletionSafe();
    expect(first.updatedIncidents).toBeGreaterThanOrEqual(1);

    // The seeded North Sea fire gains a confirmed fatality from the breaking corpus.
    const fire = await rig.db.getIncident('mock-incident-offshore-fire-northstar', null);
    expect(fire).not.toBeNull();
    expect(fire!.consequences.fatalities).toBe(1);
    expect(fire!.status).toBe('updated');

    const pushesAfterFirst = rig.push.sent.length;
    expect(pushesAfterFirst).toBeGreaterThan(0);

    // Running again changes nothing, so nothing may be sent again.
    await rig.scanner.runToCompletionSafe();
    expect(rig.push.sent.length).toBe(pushesAfterFirst);
  });

  it('sends at most one push per device per incident fingerprint', async () => {
    const rig = await createTestRig({ seedMockData: true });
    await rig.db.registerDevice({
      userId: 'user-1',
      expoPushToken: 'ExponentPushToken[test-device-0003]',
      platform: 'ios',
      appVersion: '0.1.0',
    });

    await rig.scanner.runToCompletionSafe();
    await rig.scanner.runToCompletionSafe();
    await rig.scanner.runToCompletionSafe();

    const keys = rig.push.sent.map((message) => `${message.to}|${message.data.incidentId}|${message.title}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('respects a critical-only preference', async () => {
    const rig = await createTestRig({ seedMockData: true });
    await rig.db.registerDevice({
      userId: 'picky',
      expoPushToken: 'ExponentPushToken[test-device-0004]',
      platform: 'ios',
      appVersion: '0.1.0',
    });
    const preferences = await rig.db.getUserPreferences('picky');
    await rig.db.saveUserPreferences('picky', {
      ...preferences,
      notifications: { ...preferences.notifications, criticalOnly: true },
    });

    await rig.scanner.runToCompletionSafe();
    for (const message of rig.push.sent) {
      const incident = await rig.db.getIncident(message.data.incidentId, null);
      expect(incident?.severity).toBe('critical');
    }
  });
});
