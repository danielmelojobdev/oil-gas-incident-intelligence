/**
 * RSS / Atom feed provider.
 *
 * Polls the publicly published feeds in the source catalogue. Feeds do not accept a
 * query, so this provider ignores the query text and returns recent items; the
 * pipeline's own filters decide what is relevant. Each feed is polled at most once per
 * scan regardless of how many queries there are.
 */
import {
  isSafeHttpUrl,
  rawArticleSchema,
  type LanguageCode,
  type RawArticle,
  type SearchQuery,
  type SourceTier,
} from '@ogii/domain';
import { fetchText, type HttpOptions } from '../util/http';
import { parseFeed, parseFeedDate, type FeedItem } from './rss-parse';
import { pollableFeeds, type SourceCatalogueEntry } from './feeds';
import type {
  NewsSourceProvider,
  ProviderContext,
  ProviderHealth,
  ProviderSearchResult,
} from './news-source-provider';
import { mapSettled } from '../util/concurrency';
import { toErrorMessage } from '../util/errors';

export class RssProvider implements NewsSourceProvider {
  readonly id = 'rss';
  readonly kind = 'feed' as const;
  readonly defaultTier: SourceTier = 3;

  /** Feeds are polled once per scan; later queries reuse this. */
  private cache = new Map<string, RawArticle[]>();
  private cacheScanId: string | null = null;

  constructor(
    private readonly http: HttpOptions,
    private readonly feeds: readonly SourceCatalogueEntry[] = pollableFeeds(),
  ) {}

  isAvailable(): boolean {
    return this.feeds.length > 0;
  }

  /**
   * Probes several feeds, not just the first.
   *
   * The provider aggregates many independent feeds; one of them 404-ing (publishers
   * move their RSS paths without warning) says nothing about the other twenty.
   */
  async healthCheck(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    const sample = this.feeds.filter((feed) => feed.feedUrl !== null).slice(0, 5);

    if (sample.length === 0) {
      return { providerId: this.id, healthy: false, message: 'No pollable feeds configured.', checkedAt };
    }

    const results = await mapSettled(sample, 3, async (feed) => {
      await fetchText(feed.feedUrl as string, { ...this.http, maxRetries: 0 }, {}, `${this.id}:${feed.slug}`);
      return feed.slug;
    });

    const reachable = results.filter((result) => result.status === 'fulfilled').length;
    const dead = sample
      .filter((_, index) => results[index]?.status === 'rejected')
      .map((feed) => feed.slug);

    return {
      providerId: this.id,
      healthy: reachable > 0,
      message:
        `${reachable}/${sample.length} sampled feeds reachable (${this.feeds.length} configured)` +
        (dead.length === 0 ? '' : `; unreachable: ${dead.join(', ')}`),
      checkedAt,
    };
  }

  private toRawArticle(item: FeedItem, feed: SourceCatalogueEntry): RawArticle | null {
    if (!isSafeHttpUrl(item.link)) return null;
    const parsed = rawArticleSchema.safeParse({
      provider: this.id,
      publisher: item.source ?? feed.name,
      title: item.title,
      url: item.link,
      canonicalUrl: null,
      publishedAt: parseFeedDate(item.pubDate),
      excerpt: item.description === null ? null : item.description.slice(0, 600),
      author: item.author,
      language: feed.language satisfies LanguageCode,
      sourceTier: feed.tier,
      raw: { feed: feed.slug, guid: item.guid },
    });
    return parsed.success ? parsed.data : null;
  }

  private async pollAll(context: ProviderContext): Promise<RawArticle[]> {
    if (this.cacheScanId === context.scanId) {
      return [...this.cache.values()].flat();
    }
    this.cache = new Map();
    this.cacheScanId = context.scanId;

    const results = await mapSettled(this.feeds, 4, async (feed) => {
      if (feed.feedUrl === null) return [] as RawArticle[];
      const response = await fetchText(feed.feedUrl, this.http, {}, `${this.id}:${feed.slug}`);
      return parseFeed(response.body)
        .map((item) => this.toRawArticle(item, feed))
        .filter((article): article is RawArticle => article !== null);
    });

    const articles: RawArticle[] = [];
    for (const [index, result] of results.entries()) {
      const feed = this.feeds[index];
      if (result.status === 'fulfilled') {
        if (feed !== undefined) this.cache.set(feed.slug, result.value);
        articles.push(...result.value);
      } else {
        context.logger.warn('rss feed failed', {
          providerId: this.id,
          feed: feed?.slug,
          error: toErrorMessage(result.reason),
        });
      }
    }
    return articles;
  }

  async searchNews(query: SearchQuery, context: ProviderContext): Promise<ProviderSearchResult> {
    const startedAt = Date.now();
    const articles = await this.pollAll(context);
    return {
      providerId: this.id,
      query,
      articles: articles.slice(0, context.maxResults * 4),
      durationMs: Date.now() - startedAt,
      retries: 0,
    };
  }

  normaliseResult(raw: unknown): RawArticle | null {
    const parsed = rawArticleSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }
}
