/** Bing News Search API (requires BING_API_KEY). */
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

interface BingNewsItem {
  name?: string;
  url?: string;
  description?: string;
  datePublished?: string;
  provider?: { name?: string }[];
}

interface BingNewsResponse {
  value?: BingNewsItem[];
}

const MARKETS: Readonly<Record<string, string>> = {
  en: 'en-GB',
  pt: 'pt-BR',
  es: 'es-MX',
  fr: 'fr-FR',
  no: 'nb-NO',
};

function freshness(days: number | null): string | null {
  if (days === null) return null;
  if (days <= 1) return 'Day';
  if (days <= 7) return 'Week';
  return 'Month';
}

export class BingNewsProvider implements NewsSourceProvider {
  readonly id = 'bing-news';
  readonly kind = 'search' as const;
  readonly defaultTier: SourceTier = 4;

  constructor(
    private readonly http: HttpOptions,
    private readonly apiKey: string | null,
    private readonly endpoint: string,
  ) {}

  isAvailable(): boolean {
    return this.apiKey !== null;
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (this.apiKey === null) {
      return {
        providerId: this.id,
        healthy: false,
        message: 'BING_API_KEY is not configured.',
        checkedAt: new Date().toISOString(),
      };
    }
    try {
      await fetchJson<BingNewsResponse>(
        `${this.endpoint}?q=oil+platform&count=1`,
        { ...this.http, maxRetries: 0 },
        { headers: { 'Ocp-Apim-Subscription-Key': this.apiKey } },
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

  async searchNews(query: SearchQuery, context: ProviderContext): Promise<ProviderSearchResult> {
    if (this.apiKey === null) {
      return { providerId: this.id, query, articles: [], durationMs: 0, retries: 0 };
    }

    const params = new URLSearchParams({
      q: renderQueryText(query, context.excludeKeywords),
      count: String(Math.min(100, context.maxResults)),
      mkt: MARKETS[query.language] ?? 'en-GB',
      sortBy: 'Date',
      safeSearch: 'Off',
    });
    const fresh = freshness(query.window.days);
    if (fresh !== null) params.set('freshness', fresh);

    const { data, durationMs, retries } = await fetchJson<BingNewsResponse>(
      `${this.endpoint}?${params.toString()}`,
      this.http,
      { headers: { 'Ocp-Apim-Subscription-Key': this.apiKey } },
      this.id,
    );

    const articles: RawArticle[] = [];
    for (const item of data.value ?? []) {
      const article = this.normaliseResult({ ...item, __language: query.language });
      if (article !== null) articles.push(article);
    }

    return { providerId: this.id, query, articles, durationMs, retries };
  }

  normaliseResult(raw: unknown): RawArticle | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const item = raw as BingNewsItem & { __language?: string };
    if (item.url === undefined || item.name === undefined || !isSafeHttpUrl(item.url)) return null;

    const parsed = rawArticleSchema.safeParse({
      provider: this.id,
      publisher:
        item.provider?.[0]?.name ?? publisherNameForUrl(item.url, publisherHost(item.url) ?? 'Unknown publisher'),
      title: item.name,
      url: item.url,
      canonicalUrl: null,
      publishedAt: item.datePublished ?? null,
      excerpt: item.description === undefined ? null : item.description.slice(0, 600),
      author: null,
      language: item.__language ?? null,
      sourceTier: tierForUrl(item.url, this.defaultTier),
    });
    return parsed.success ? parsed.data : null;
  }
}
