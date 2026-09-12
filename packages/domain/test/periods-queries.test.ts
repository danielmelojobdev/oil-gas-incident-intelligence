import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PERIOD,
  effectiveFilterDate,
  generateSearchQueries,
  isWithinWindow,
  relativeTime,
  renderQueryText,
  resolveTimeWindow,
  formatDisplayDate,
} from '../src';

const NOW = new Date('2026-09-12T12:00:00.000Z');

describe('time windows', () => {
  it('defaults to the last 30 days (brief section 11)', () => {
    expect(DEFAULT_PERIOD).toBe('last_30_days');
    const window = resolveTimeWindow('last_30_days', NOW);
    expect(window.fromDate).toBe('2026-08-13');
    expect(window.toDate).toBe('2026-09-12');
    expect(window.axis).toBe('incident_date');
  });

  it.each([
    ['today', '2026-09-12'],
    ['last_7_days', '2026-09-05'],
    ['last_14_days', '2026-08-29'],
  ] as const)('resolves %s', (period, expected) => {
    expect(resolveTimeWindow(period, NOW).fromDate).toBe(expected);
  });

  it('resolves all_time to an open window', () => {
    expect(resolveTimeWindow('all_time', NOW).fromDate).toBeNull();
  });

  it('excludes dates outside the window', () => {
    const window = resolveTimeWindow('last_30_days', NOW);
    expect(isWithinWindow('2026-09-01', window)).toBe(true);
    expect(isWithinWindow('2026-01-01', window)).toBe(false);
    expect(isWithinWindow(null, window)).toBe(false);
  });

  it('filters on incident date, not publication date (decision D8)', () => {
    // Published today, but the event happened six months ago.
    const resolved = effectiveFilterDate('2026-03-04', '2026-09-12T10:00:00Z', 'incident_date');
    expect(resolved.date).toBe('2026-03-04');
    expect(resolved.isEstimated).toBe(false);
    expect(isWithinWindow(resolved.date, resolveTimeWindow('last_30_days', NOW))).toBe(false);
  });

  it('falls back to the publication date and flags the estimate', () => {
    const resolved = effectiveFilterDate(null, '2026-09-11T10:00:00Z', 'incident_date');
    expect(resolved.date).toBe('2026-09-11');
    expect(resolved.isEstimated).toBe(true);
  });

  it('can switch the axis to publication date', () => {
    const resolved = effectiveFilterDate('2026-03-04', '2026-09-12T10:00:00Z', 'published_at');
    expect(resolved.date).toBe('2026-09-12');
  });

  it('formats relative and display dates', () => {
    expect(relativeTime('2026-09-12T11:42:00.000Z', NOW)).toBe('18 min ago');
    expect(formatDisplayDate('2026-09-12')).toBe('12 Sep 2026');
    expect(formatDisplayDate(null)).toBe('Date not reported');
  });
});

describe('query generator', () => {
  const window = resolveTimeWindow('last_30_days', NOW);

  it('generates many specific queries rather than one giant query', () => {
    const queries = generateSearchQueries({
      languages: ['en'],
      regions: ['worldwide'],
      customCountries: [],
      includeKeywords: [],
      excludeKeywords: [],
      maxQueries: 40,
      window,
      period: 'last_30_days',
    });
    expect(queries.length).toBeGreaterThan(20);
    expect(queries.every((query) => query.text.length < 120)).toBe(true);
    expect(queries.map((query) => query.text)).toContain('"well control" incident');
    expect(queries.map((query) => query.text)).toContain('"BOP failure"');
  });

  it('is deterministic', () => {
    const config = {
      languages: ['en', 'pt'] as const,
      regions: ['worldwide'] as const,
      customCountries: [],
      includeKeywords: [],
      excludeKeywords: [],
      maxQueries: 30,
      window,
      period: 'last_30_days' as const,
    };
    expect(generateSearchQueries({ ...config, languages: [...config.languages], regions: [...config.regions] })).toEqual(
      generateSearchQueries({ ...config, languages: [...config.languages], regions: [...config.regions] }),
    );
  });

  it('produces native-language queries, not translations', () => {
    const queries = generateSearchQueries({
      languages: ['pt', 'no'],
      regions: ['worldwide'],
      customCountries: [],
      includeKeywords: [],
      excludeKeywords: [],
      maxQueries: 60,
      window,
      period: 'last_30_days',
    });
    const texts = queries.map((query) => query.text);
    expect(texts).toContain('acidente plataforma petróleo');
    expect(texts).toContain('brann oljeplattform');
    expect(queries.filter((query) => query.language === 'no').length).toBeGreaterThan(3);
  });

  it('adds regional queries with country hints', () => {
    const queries = generateSearchQueries({
      languages: ['en'],
      regions: ['brazil', 'norway'],
      customCountries: [],
      includeKeywords: [],
      excludeKeywords: [],
      maxQueries: 200,
      window,
      period: 'last_30_days',
    });
    expect(queries.some((query) => query.country === 'Brazil')).toBe(true);
    expect(queries.some((query) => query.country === 'Norway')).toBe(true);
  });

  it('anchors user keywords to the industry', () => {
    const queries = generateSearchQueries({
      languages: ['en'],
      regions: ['worldwide'],
      customCountries: [],
      includeKeywords: ['Acme Corp'],
      excludeKeywords: [],
      maxQueries: 50,
      window,
      period: 'last_30_days',
    });
    const userQuery = queries.find((query) => query.category === 'user-keyword');
    expect(userQuery?.text).toBe('Acme Corp (oil OR gas OR petroleum)');
    expect(userQuery?.priority).toBeGreaterThan(100);
  });

  it('respects the query budget', () => {
    const queries = generateSearchQueries({
      languages: ['en', 'pt', 'es', 'fr', 'no'],
      regions: ['worldwide', 'brazil', 'norway', 'united_kingdom'],
      customCountries: [],
      includeKeywords: [],
      excludeKeywords: [],
      maxQueries: 12,
      window,
      period: 'last_30_days',
    });
    expect(queries).toHaveLength(12);
  });

  it('renders exclusions into the query text', () => {
    const [query] = generateSearchQueries({
      languages: ['en'],
      regions: ['worldwide'],
      customCountries: [],
      includeKeywords: [],
      excludeKeywords: ['wind farm'],
      maxQueries: 1,
      window,
      period: 'last_30_days',
    });
    expect(query).toBeDefined();
    expect(renderQueryText(query!, ['wind farm'])).toContain('-"wind farm"');
  });
});
