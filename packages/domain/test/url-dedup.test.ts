import { describe, expect, it } from 'vitest';
import {
  compareArticles,
  contentHash,
  dedupeArticles,
  isSafeHttpUrl,
  normaliseUrl,
  publisherHost,
  titleHash,
  unwrapRedirect,
} from '../src';

describe('URL normalisation', () => {
  it('strips tracking parameters, www, fragments and trailing slashes', () => {
    expect(normaliseUrl('http://www.example.com/news/fire/?utm_source=x&utm_medium=y#top')).toBe(
      'https://example.com/news/fire',
    );
  });

  it('treats http and https as the same document', () => {
    expect(normaliseUrl('http://example.com/a')).toBe(normaliseUrl('https://example.com/a'));
  });

  it('sorts remaining query parameters', () => {
    expect(normaliseUrl('https://example.com/a?b=2&a=1')).toBe(normaliseUrl('https://example.com/a?a=1&b=2'));
  });

  it('removes the AMP suffix', () => {
    expect(normaliseUrl('https://example.com/news/story/amp')).toBe('https://example.com/news/story');
  });

  it('is total for unparseable input', () => {
    expect(normaliseUrl('  NOT a url ')).toBe('not a url');
  });

  it('rejects unsafe URLs', () => {
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('data:text/html,<script>')).toBe(false);
    expect(isSafeHttpUrl('https://user:pass@example.com')).toBe(false);
    expect(isSafeHttpUrl('https://example.com/ok')).toBe(true);
  });

  it('extracts a publisher host including two-level suffixes', () => {
    expect(publisherHost('https://news.example.co.uk/story')).toBe('example.co.uk');
    expect(publisherHost('https://www.example.com/story')).toBe('example.com');
  });

  it('unwraps a redirect wrapper', () => {
    expect(unwrapRedirect('https://news.example.com/r?url=https%3A%2F%2Fpublisher.example%2Fa')).toBe(
      'https://publisher.example/a',
    );
  });
});

describe('hashing', () => {
  it('is order-insensitive for titles', () => {
    expect(titleHash('Fire on North Sea platform')).toBe(titleHash('North Sea platform fire'));
  });

  it('separates different stories', () => {
    expect(titleHash('Fire on North Sea platform')).not.toBe(titleHash('Explosion at Texas refinery'));
  });

  it('produces a stable 32-char digest', () => {
    const digest = contentHash('title', 'excerpt');
    expect(digest).toMatch(/^[0-9a-f]{32}$/);
    expect(contentHash('title', 'excerpt')).toBe(digest);
  });
});

const base = {
  id: 'a1',
  title: 'Fire on North Sea oil platform',
  url: 'https://example.com/news/fire',
  publisher: 'Global Energy Wire',
  publishedAt: '2026-09-10T08:00:00.000Z',
  excerpt: 'The operator confirmed the fire.',
};

describe('article deduplication', () => {
  it('detects the same URL with different tracking parameters', () => {
    const verdict = compareArticles(
      { ...base, id: 'a2', url: 'https://www.example.com/news/fire?utm_source=twitter' },
      base,
    );
    expect(verdict.isDuplicate).toBe(true);
    expect(verdict.reason).toBe('normalized_url');
  });

  it('detects a canonical URL match across different landing URLs', () => {
    const verdict = compareArticles(
      {
        ...base,
        id: 'a3',
        url: 'https://aggregator.example/x/1',
        canonicalUrl: 'https://example.com/news/fire',
        title: 'Completely different headline text here',
      },
      { ...base, canonicalUrl: 'https://example.com/news/fire' },
    );
    expect(verdict.isDuplicate).toBe(true);
    expect(verdict.reason).toBe('canonical_url');
  });

  it('detects reordered titles from the same publisher', () => {
    const verdict = compareArticles(
      { ...base, id: 'a4', url: 'https://example.com/news/fire-2', title: 'North Sea oil platform fire' },
      base,
    );
    expect(verdict.isDuplicate).toBe(true);
  });

  it('detects syndication across sibling outlets within 48h', () => {
    const verdict = compareArticles(
      {
        ...base,
        id: 'a5',
        url: 'https://other.example/news/fire',
        publisher: 'Regional Mirror',
        title: 'Fire on North Sea oil platform, operator confirms',
        excerpt: 'A regional report carrying the same wire copy with a different standfirst.',
        publishedAt: '2026-09-10T20:00:00.000Z',
      },
      base,
    );
    expect(verdict.isDuplicate).toBe(true);
    expect(verdict.reason).toBe('fuzzy_syndication');
  });

  it('does not merge genuinely different stories', () => {
    const verdict = compareArticles(
      {
        ...base,
        id: 'a6',
        url: 'https://example.com/news/refinery-blast',
        title: 'Explosion at Gulf Coast refinery alkylation unit kills one',
      },
      base,
    );
    expect(verdict.isDuplicate).toBe(false);
  });

  it('deduplicates a batch, keeping the first occurrence', () => {
    const result = dedupeArticles([
      base,
      { ...base, id: 'dup', url: 'https://example.com/news/fire?utm_campaign=x' },
      { ...base, id: 'other', url: 'https://example.com/news/other', title: 'Pipeline rupture spills crude in Texas' },
    ]);
    expect(result.unique.map((item) => item.id)).toEqual(['a1', 'other']);
    expect(result.duplicates).toHaveLength(1);
  });
});
