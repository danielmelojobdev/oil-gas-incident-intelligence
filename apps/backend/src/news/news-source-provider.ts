/**
 * The news source port (brief section 6).
 *
 * Legal posture, enforced by only ever implementing these shapes:
 *   * public RSS/Atom feeds and documented public/commercial APIs only;
 *   * no HTML scraping of article bodies, no paywall circumvention, no robots.txt breach;
 *   * we retain metadata (headline, excerpt as published, publisher, URL, dates) plus our
 *     own generated summary — never a copy of a protected article.
 */
import type { RawArticle, SearchQuery, SourceTier } from '@ogii/domain';
import type { Logger } from '../logger';

export interface ProviderContext {
  readonly logger: Logger;
  readonly scanId: string;
  /** Hard cap on results the provider should return for one query. */
  readonly maxResults: number;
  readonly excludeKeywords: readonly string[];
}

export interface ProviderSearchResult {
  readonly providerId: string;
  readonly query: SearchQuery;
  readonly articles: readonly RawArticle[];
  readonly durationMs: number;
  readonly retries: number;
}

export interface ProviderHealth {
  readonly providerId: string;
  readonly healthy: boolean;
  readonly message: string;
  readonly checkedAt: string;
}

export interface NewsSourceProvider {
  readonly id: string;
  readonly kind: 'search' | 'feed' | 'regulator' | 'mock';
  readonly defaultTier: SourceTier;
  /**
   * Minimum gap between two requests to this provider, in milliseconds.
   *
   * Some public APIs publish a pacing rule rather than a quota (GDELT asks for one
   * request every five seconds and answers 429 otherwise). 0 means unpaced.
   */
  readonly minRequestIntervalMs?: number;
  /**
   * Cap on how many of the generated queries this provider is given in one scan.
   *
   * A heavily paced provider would otherwise dominate the wall-clock time of the run,
   * so it receives only the highest-priority queries.
   */
  readonly maxQueriesPerScan?: number;
  /** True when the provider has everything it needs (API key, feed list) to run. */
  isAvailable(): boolean;
  healthCheck(): Promise<ProviderHealth>;
  searchNews(query: SearchQuery, context: ProviderContext): Promise<ProviderSearchResult>;
  /** Optional enrichment of a single URL; providers that cannot do this omit it. */
  getArticleMetadata?(url: string): Promise<RawArticle | null>;
  /** Converts one provider-specific payload into a `RawArticle`, or null if unusable. */
  normaliseResult(raw: unknown): RawArticle | null;
}

export function emptyResult(providerId: string, query: SearchQuery): ProviderSearchResult {
  return { providerId, query, articles: [], durationMs: 0, retries: 0 };
}
