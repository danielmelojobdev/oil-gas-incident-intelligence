import { describe, expect, it } from 'vitest';
import { resolveTimeWindow } from '@ogii/domain';
import { parseFeed, parseFeedDate, stripTags, decodeEntities } from '../src/news/rss-parse';
import { MockNewsProvider } from '../src/news/mock-news-provider';
import { GdeltProvider } from '../src/news/gdelt-provider';
import { catalogueEntryForUrl, tierForUrl, isOilGasDedicatedUrl } from '../src/news/feeds';
import { silentLogger } from '../src/logger';
import { TEST_NOW } from './helpers';

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Example feed</title>
  <item>
    <title><![CDATA[Fire on North Sea platform &amp; evacuation]]></title>
    <link>https://example.com/news/fire?utm_source=rss</link>
    <description>&lt;p&gt;The operator confirmed the fire.&lt;/p&gt;</description>
    <pubDate>Fri, 11 Sep 2026 08:30:00 GMT</pubDate>
    <source>Example Wire</source>
    <guid>abc-123</guid>
  </item>
  <item>
    <title>Second story</title>
    <link>https://example.com/news/second</link>
    <pubDate>not a date</pubDate>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Regulator notice</title>
    <link rel="alternate" href="https://regulator.example.gov/notice/1"/>
    <summary>A hydrocarbon release has been notified.</summary>
    <published>2026-09-10T10:00:00Z</published>
  </entry>
</feed>`;

describe('feed parsing', () => {
  it('parses RSS items, CDATA and entities', () => {
    const items = parseFeed(RSS);
    expect(items).toHaveLength(2);
    expect(items[0]?.title).toBe('Fire on North Sea platform & evacuation');
    expect(items[0]?.link).toBe('https://example.com/news/fire?utm_source=rss');
    expect(items[0]?.description).toBe('The operator confirmed the fire.');
    expect(items[0]?.source).toBe('Example Wire');
  });

  it('parses Atom entries with the link in an attribute', () => {
    const items = parseFeed(ATOM);
    expect(items).toHaveLength(1);
    expect(items[0]?.link).toBe('https://regulator.example.gov/notice/1');
    expect(parseFeedDate(items[0]?.pubDate ?? null)).toBe('2026-09-10T10:00:00.000Z');
  });

  it('returns null for an unparseable date rather than inventing "now"', () => {
    expect(parseFeedDate('not a date')).toBeNull();
    expect(parseFeedDate(null)).toBeNull();
  });

  it('strips markup and decodes entities', () => {
    expect(stripTags('<p>a <b>bold</b> &amp; clear</p>')).toBe('a bold & clear');
    expect(decodeEntities('&#x41;&#66;&quot;')).toBe('AB"');
  });

  it('returns an empty list for junk input', () => {
    expect(parseFeed('<html><body>not a feed</body></html>')).toEqual([]);
  });
});

describe('source catalogue', () => {
  it('maps known publishers to their tier', () => {
    expect(tierForUrl('https://www.hse.gov.uk/news/story')).toBe(1);
    expect(tierForUrl('https://www.reuters.com/business/energy/story')).toBe(2);
    expect(tierForUrl('https://www.energyvoice.com/story')).toBe(3);
  });

  it('treats government domains as Tier 1 even when not in the catalogue', () => {
    expect(tierForUrl('https://some-agency.gov/report')).toBe(1);
  });

  it('falls back to the least trusted tier for unknown hosts', () => {
    expect(tierForUrl('https://random-blog.example/post')).toBe(5);
  });

  it('knows which sources are Oil & Gas dedicated', () => {
    expect(isOilGasDedicatedUrl('https://www.upstreamonline.com/x')).toBe(true);
    expect(isOilGasDedicatedUrl('https://www.bbc.co.uk/news/x')).toBe(false);
    expect(catalogueEntryForUrl('https://www.ogj.com/a')?.name).toBe('Oil & Gas Journal');
  });
});

describe('MockNewsProvider', () => {
  const provider = new MockNewsProvider({ now: TEST_NOW });
  const window = resolveTimeWindow('last_30_days', TEST_NOW);
  const context = { logger: silentLogger, scanId: 'test', maxResults: 25, excludeKeywords: [] };

  it('is always available and healthy', async () => {
    expect(provider.isAvailable()).toBe(true);
    expect((await provider.healthCheck()).healthy).toBe(true);
  });

  it('matches quoted phrases', async () => {
    const result = await provider.searchNews(
      {
        id: 'q1',
        text: '"offshore platform" fire',
        language: 'en',
        region: 'worldwide',
        country: null,
        sector: 'upstream',
        category: 'core-incident',
        priority: 100,
        window,
      },
      context,
    );
    expect(result.articles.length).toBeGreaterThan(0);
  });

  it('honours exclude keywords', async () => {
    const query = {
      id: 'q2',
      text: 'refinery explosion',
      language: 'en' as const,
      region: 'worldwide' as const,
      country: null,
      sector: 'downstream' as const,
      category: 'downstream' as const,
      priority: 90,
      window,
    };
    const unfiltered = await provider.searchNews(query, context);
    const filtered = await provider.searchNews(query, { ...context, excludeKeywords: ['Port Alder'] });
    expect(filtered.articles.length).toBeLessThan(unfiltered.articles.length);
  });

  it('emits only example.com URLs', async () => {
    const result = await provider.searchNews(
      {
        id: 'q3',
        text: 'oil',
        language: 'en',
        region: 'worldwide',
        country: null,
        sector: 'unknown',
        category: 'core-incident',
        priority: 50,
        window,
      },
      { ...context, maxResults: 100 },
    );
    expect(result.articles.every((article) => /example\.(com|org|gov)/.test(article.url))).toBe(true);
  });
});

describe('GDELT normalisation', () => {
  const provider = new GdeltProvider({ timeoutMs: 1000, maxRetries: 0, userAgent: 'test' });

  it('normalises a valid record', () => {
    const article = provider.normaliseResult({
      url: 'https://www.energyvoice.com/story',
      title: 'Platform fire reported',
      seendate: '20260911T083000Z',
      domain: 'energyvoice.com',
      __language: 'en',
    });
    expect(article?.publishedAt).toBe('2026-09-11T08:30:00.000Z');
    expect(article?.sourceTier).toBe(3);
  });

  it('rejects records without a safe URL', () => {
    expect(provider.normaliseResult({ url: 'javascript:alert(1)', title: 'x' })).toBeNull();
    expect(provider.normaliseResult({ title: 'no url' })).toBeNull();
    expect(provider.normaliseResult(null)).toBeNull();
  });
});
