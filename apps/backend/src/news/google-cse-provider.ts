/** Google Programmable Search (Custom Search JSON API). Requires key + engine id. */
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

interface CseItem {
  title?: string;
  link?: string;
  snippet?: string;
  displayLink?: string;
  pagemap?: { metatags?: Record<string, string>[] };
}

interface CseResponse {
  items?: CseItem[];
}

export class GoogleCseProvider implements NewsSourceProvider {
  readonly id = 'google-cse';
  readonly kind = 'search' as const;
  readonly defaultTier: SourceTier = 4;

  constructor(
    private readonly http: HttpOptions,
    private readonly apiKey: string | null,
    private readonly engineId: string | null,
  ) {}

  isAvailable(): boolean {
    return this.apiKey !== null && this.engineId !== null;
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this.isAvailable()) {
      return {
        providerId: this.id,
        healthy: false,
        message: 'GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID are required.',
        checkedAt: new Date().toISOString(),
      };
    }
    try {
      const params = new URLSearchParams({
        key: this.apiKey ?? '',
        cx: this.engineId ?? '',
        q: 'oil platform incident',
        num: '1',
      });
      await fetchJson<CseResponse>(
        `https://www.googleapis.com/customsearch/v1?${params.toString()}`,
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

  /** CSE expresses recency with `dateRestrict=dN`. */
  private dateRestrict(days: number | null): string | null {
    if (days === null) return null;
    return `d${Math.max(1, days)}`;
  }

  async searchNews(query: SearchQuery, context: ProviderContext): Promise<ProviderSearchResult> {
    if (!this.isAvailable()) {
      return { providerId: this.id, query, articles: [], durationMs: 0, retries: 0 };
    }

    const params = new URLSearchParams({
      key: this.apiKey ?? '',
      cx: this.engineId ?? '',
      q: renderQueryText(query, context.excludeKeywords),
      num: String(Math.min(10, context.maxResults)), // CSE hard limit is 10 per request
      sort: 'date',
      lr: `lang_${query.language}`,
    });
    const restrict = this.dateRestrict(query.window.days);
    if (restrict !== null) params.set('dateRestrict', restrict);

    const { data, durationMs, retries } = await fetchJson<CseResponse>(
      `https://www.googleapis.com/customsearch/v1?${params.toString()}`,
      this.http,
      {},
      this.id,
    );

    const articles: RawArticle[] = [];
    for (const item of data.items ?? []) {
      const article = this.normaliseResult({ ...item, __language: query.language });
      if (article !== null) articles.push(article);
    }

    return { providerId: this.id, query, articles, durationMs, retries };
  }

  normaliseResult(raw: unknown): RawArticle | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const item = raw as CseItem & { __language?: string };
    if (item.link === undefined || item.title === undefined || !isSafeHttpUrl(item.link)) return null;

    const meta = item.pagemap?.metatags?.[0] ?? {};
    const published =
      meta['article:published_time'] ?? meta['og:published_time'] ?? meta['date'] ?? meta['dc.date'] ?? null;
    const canonical = meta['og:url'] ?? null;

    const parsed = rawArticleSchema.safeParse({
      provider: this.id,
      publisher:
        meta['og:site_name'] ??
        publisherNameForUrl(item.link, item.displayLink ?? publisherHost(item.link) ?? 'Unknown publisher'),
      title: item.title,
      url: item.link,
      canonicalUrl: canonical !== null && isSafeHttpUrl(canonical) ? canonical : null,
      publishedAt: published === null || Number.isNaN(Date.parse(published)) ? null : new Date(published).toISOString(),
      excerpt: item.snippet === undefined ? null : item.snippet.slice(0, 600),
      author: meta['author'] ?? null,
      language: item.__language ?? null,
      sourceTier: tierForUrl(item.link, this.defaultTier),
    });
    return parsed.success ? parsed.data : null;
  }
}
