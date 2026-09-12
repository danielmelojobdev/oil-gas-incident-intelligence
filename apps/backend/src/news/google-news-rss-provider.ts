/**
 * Google News RSS provider.
 *
 * Uses the public RSS search endpoint, which is published for syndication and returns
 * headline + snippet + link to the original publisher. No key required. We keep the
 * link to the publisher and never fetch or store the article body.
 */
import {
  isSafeHttpUrl,
  publisherHost,
  rawArticleSchema,
  renderQueryText,
  unwrapRedirect,
  type LanguageCode,
  type RawArticle,
  type Region,
  type SearchQuery,
  type SourceTier,
} from '@ogii/domain';
import { fetchText, type HttpOptions } from '../util/http';
import { parseFeed, parseFeedDate, stripTags } from './rss-parse';
import { publisherNameForUrl, tierForUrl } from './feeds';
import type {
  NewsSourceProvider,
  ProviderContext,
  ProviderHealth,
  ProviderSearchResult,
} from './news-source-provider';
import { toErrorMessage } from '../util/errors';

const LANGUAGE_LOCALE: Readonly<Record<LanguageCode, { hl: string; gl: string; ceid: string }>> = {
  en: { hl: 'en-GB', gl: 'GB', ceid: 'GB:en' },
  pt: { hl: 'pt-BR', gl: 'BR', ceid: 'BR:pt-419' },
  es: { hl: 'es-419', gl: 'MX', ceid: 'MX:es-419' },
  fr: { hl: 'fr-FR', gl: 'FR', ceid: 'FR:fr' },
  no: { hl: 'no', gl: 'NO', ceid: 'NO:no' },
};

const REGION_LOCALE: Partial<Record<Region, { hl: string; gl: string; ceid: string }>> = {
  united_kingdom: { hl: 'en-GB', gl: 'GB', ceid: 'GB:en' },
  united_states: { hl: 'en-US', gl: 'US', ceid: 'US:en' },
  brazil: { hl: 'pt-BR', gl: 'BR', ceid: 'BR:pt-419' },
  norway: { hl: 'no', gl: 'NO', ceid: 'NO:no' },
};

/** Google News supports `when:` for recency; map our windows onto it. */
function whenClause(query: SearchQuery): string {
  const days = query.window.days;
  if (days === null) return '';
  if (days <= 1) return ' when:2d';
  if (days <= 7) return ' when:7d';
  if (days <= 14) return ' when:14d';
  return ' when:30d';
}

export class GoogleNewsRssProvider implements NewsSourceProvider {
  readonly id = 'google-news-rss';
  readonly kind = 'search' as const;
  readonly defaultTier: SourceTier = 4;

  constructor(private readonly http: HttpOptions) {}

  isAvailable(): boolean {
    return true; // no credentials required
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      await fetchText(
        'https://news.google.com/rss/search?q=oil%20platform&hl=en-GB&gl=GB&ceid=GB:en',
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

  private buildUrl(query: SearchQuery, excludeKeywords: readonly string[]): string {
    const locale = REGION_LOCALE[query.region] ?? LANGUAGE_LOCALE[query.language];
    const text = `${renderQueryText(query, excludeKeywords)}${whenClause(query)}`;
    const params = new URLSearchParams({ q: text, hl: locale.hl, gl: locale.gl, ceid: locale.ceid });
    return `https://news.google.com/rss/search?${params.toString()}`;
  }

  async searchNews(query: SearchQuery, context: ProviderContext): Promise<ProviderSearchResult> {
    const response = await fetchText(this.buildUrl(query, context.excludeKeywords), this.http, {}, this.id);
    const articles: RawArticle[] = [];

    for (const item of parseFeed(response.body).slice(0, context.maxResults)) {
      // Google appends " - Publisher" to the headline; the <source> element is authoritative.
      const title = item.source === null ? item.title : item.title.replace(new RegExp(`\\s*-\\s*${item.source}$`), '');
      const url = unwrapRedirect(item.link);
      if (!isSafeHttpUrl(url)) continue;

      const parsed = rawArticleSchema.safeParse({
        provider: this.id,
        publisher: item.source ?? publisherNameForUrl(url, publisherHost(url) ?? 'Unknown publisher'),
        title,
        url,
        canonicalUrl: null,
        publishedAt: parseFeedDate(item.pubDate),
        excerpt: item.description === null ? null : stripTags(item.description).slice(0, 600),
        author: item.author,
        language: query.language,
        sourceTier: tierForUrl(url, this.defaultTier),
        raw: { guid: item.guid },
      });
      if (parsed.success) articles.push(parsed.data);
    }

    return {
      providerId: this.id,
      query,
      articles,
      durationMs: response.durationMs,
      retries: response.retries,
    };
  }

  normaliseResult(raw: unknown): RawArticle | null {
    const parsed = rawArticleSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }
}
