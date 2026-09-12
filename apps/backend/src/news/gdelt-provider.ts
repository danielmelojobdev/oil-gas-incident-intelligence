/**
 * GDELT 2.0 Document API — free, global, multilingual news index.
 *
 * Excellent breadth for non-English coverage. Returns metadata only, which is exactly
 * what we are allowed to store.
 */
import {
  isSafeHttpUrl,
  publisherHost,
  rawArticleSchema,
  renderQueryText,
  type RawArticle,
  type SearchQuery,
  type SourceTier,
} from '@ogii/domain';
import { fetchJson, type HttpOptions } from '../util/http';
import { publisherNameForUrl, tierForUrl } from './feeds';
import type {
  NewsSourceProvider,
  ProviderContext,
  ProviderHealth,
  ProviderSearchResult,
} from './news-source-provider';
import { toErrorMessage } from '../util/errors';

interface GdeltArticle {
  url?: string;
  title?: string;
  seendate?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
}

interface GdeltResponse {
  articles?: GdeltArticle[];
}

const GDELT_LANGUAGE: Readonly<Record<string, string>> = {
  en: 'english',
  pt: 'portuguese',
  es: 'spanish',
  fr: 'french',
  no: 'norwegian',
};

/** GDELT timestamps look like `20260912T101500Z`. */
function parseGdeltDate(value: string | undefined): string | null {
  if (value === undefined) return null;
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (match === null) {
    const fallback = Date.parse(value);
    return Number.isNaN(fallback) ? null : new Date(fallback).toISOString();
  }
  const [, y, m, d, hh, mm, ss] = match;
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}.000Z`;
}

export class GdeltProvider implements NewsSourceProvider {
  readonly id = 'gdelt';
  readonly kind = 'search' as const;
  readonly defaultTier: SourceTier = 4;
  /** GDELT documents a one-request-per-five-seconds limit and enforces it with 429s. */
  readonly minRequestIntervalMs = 5_000;
  /** At 5s per query, more than this would dominate the run. Highest priority wins. */
  readonly maxQueriesPerScan = 10;

  constructor(private readonly http: HttpOptions) {}

  isAvailable(): boolean {
    return true; // no credentials required
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      await fetchJson<GdeltResponse>(
        'https://api.gdeltproject.org/api/v2/doc/doc?query=%22oil%20platform%22&mode=artlist&format=json&maxrecords=1',
        { ...this.http, maxRetries: 0 },
        {},
        this.id,
      );
      return { providerId: this.id, healthy: true, message: 'OK', checkedAt: new Date().toISOString() };
    } catch (error) {
      return {
        providerId: this.id,
        healthy: false,
        message: toErrorMessage(error),
        checkedAt: new Date().toISOString(),
      };
    }
  }

  private buildUrl(query: SearchQuery, context: ProviderContext): string {
    const language = GDELT_LANGUAGE[query.language] ?? 'english';
    const text = `${renderQueryText(query, context.excludeKeywords)} sourcelang:${language}`;
    const params = new URLSearchParams({
      query: text,
      mode: 'artlist',
      format: 'json',
      sort: 'datedesc',
      maxrecords: String(Math.min(250, context.maxResults)),
    });
    if (query.window.fromDate !== null) {
      params.set('startdatetime', `${query.window.fromDate.replace(/-/g, '')}000000`);
      params.set('enddatetime', `${query.window.toDate.replace(/-/g, '')}235959`);
    }
    return `https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`;
  }

  async searchNews(query: SearchQuery, context: ProviderContext): Promise<ProviderSearchResult> {
    const { data, durationMs, retries } = await fetchJson<GdeltResponse>(
      this.buildUrl(query, context),
      this.http,
      {},
      this.id,
    );

    const articles: RawArticle[] = [];
    for (const item of data.articles ?? []) {
      const article = this.normaliseResult({ ...item, __language: query.language });
      if (article !== null) articles.push(article);
      if (articles.length >= context.maxResults) break;
    }

    return { providerId: this.id, query, articles, durationMs, retries };
  }

  normaliseResult(raw: unknown): RawArticle | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const item = raw as GdeltArticle & { __language?: string };
    if (item.url === undefined || item.title === undefined || !isSafeHttpUrl(item.url)) return null;

    const parsed = rawArticleSchema.safeParse({
      provider: this.id,
      publisher: publisherNameForUrl(item.url, item.domain ?? publisherHost(item.url) ?? 'Unknown publisher'),
      title: item.title,
      url: item.url,
      canonicalUrl: null,
      publishedAt: parseGdeltDate(item.seendate),
      // GDELT does not return a snippet; the AI stage works from the headline alone.
      excerpt: null,
      author: null,
      language: item.__language ?? null,
      sourceTier: tierForUrl(item.url, this.defaultTier),
      raw: { domain: item.domain, sourcecountry: item.sourcecountry },
    });
    return parsed.success ? parsed.data : null;
  }
}
