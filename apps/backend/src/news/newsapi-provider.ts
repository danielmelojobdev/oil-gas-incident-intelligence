/** NewsAPI.org adapter (requires NEWS_API_KEY). */
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

interface NewsApiArticle {
  source?: { name?: string };
  author?: string | null;
  title?: string;
  description?: string | null;
  url?: string;
  publishedAt?: string;
}

interface NewsApiResponse {
  status?: string;
  message?: string;
  articles?: NewsApiArticle[];
}

export class NewsApiProvider implements NewsSourceProvider {
  readonly id = 'newsapi';
  readonly kind = 'search' as const;
  readonly defaultTier: SourceTier = 4;

  constructor(
    private readonly http: HttpOptions,
    private readonly apiKey: string | null,
  ) {}

  isAvailable(): boolean {
    return this.apiKey !== null;
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (this.apiKey === null) {
      return {
        providerId: this.id,
        healthy: false,
        message: 'NEWS_API_KEY is not configured.',
        checkedAt: new Date().toISOString(),
      };
    }
    try {
      const { data } = await fetchJson<NewsApiResponse>(
        'https://newsapi.org/v2/everything?q=oil&pageSize=1',
        { ...this.http, maxRetries: 0 },
        { headers: { 'X-Api-Key': this.apiKey } },
        this.id,
      );
      return {
        providerId: this.id,
        healthy: data.status === 'ok',
        message: data.status === 'ok' ? 'OK' : (data.message ?? 'unknown error'),
        checkedAt: new Date().toISOString(),
      };
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
      pageSize: String(Math.min(100, context.maxResults)),
      sortBy: 'publishedAt',
      language: query.language,
    });
    if (query.window.fromDate !== null) params.set('from', query.window.fromDate);
    params.set('to', query.window.toDate);

    const { data, durationMs, retries } = await fetchJson<NewsApiResponse>(
      `https://newsapi.org/v2/everything?${params.toString()}`,
      this.http,
      { headers: { 'X-Api-Key': this.apiKey } },
      this.id,
    );

    const articles: RawArticle[] = [];
    for (const item of data.articles ?? []) {
      const article = this.normaliseResult({ ...item, __language: query.language });
      if (article !== null) articles.push(article);
    }

    return { providerId: this.id, query, articles, durationMs, retries };
  }

  normaliseResult(raw: unknown): RawArticle | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const item = raw as NewsApiArticle & { __language?: string };
    if (item.url === undefined || item.title === undefined || !isSafeHttpUrl(item.url)) return null;
    // NewsAPI marks withdrawn content this way; it carries no usable metadata.
    if (item.title === '[Removed]') return null;

    const parsed = rawArticleSchema.safeParse({
      provider: this.id,
      publisher:
        item.source?.name ?? publisherNameForUrl(item.url, publisherHost(item.url) ?? 'Unknown publisher'),
      title: item.title,
      url: item.url,
      canonicalUrl: null,
      publishedAt: item.publishedAt ?? null,
      excerpt: item.description ?? null,
      author: item.author ?? null,
      language: item.__language ?? null,
      sourceTier: tierForUrl(item.url, this.defaultTier),
    });
    return parsed.success ? parsed.data : null;
  }
}
