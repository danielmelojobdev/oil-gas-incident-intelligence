/**
 * MockNewsProvider — a real NewsSourceProvider backed by the fictional dataset.
 *
 * It answers queries the way a search provider would: it matches the query terms
 * against the synthetic corpus and returns only what matches, so the scanner's
 * filtering, deduplication and grouping stages all do real work.
 *
 * It also injects a small amount of deliberate NOISE (out-of-scope headlines and
 * duplicate/syndicated copies) so that Mock Mode proves the rejection and dedup
 * paths rather than only the happy path.
 */
import {
  MOCK_BREAKING_ARTICLES,
  buildMockDataset,
  foldCase,
  rawArticleSchema,
  tokenise,
  type RawArticle,
  type SearchQuery,
  type SourceTier,
} from '@ogii/domain';
import type {
  NewsSourceProvider,
  ProviderContext,
  ProviderHealth,
  ProviderSearchResult,
} from './news-source-provider';

interface CorpusEntry {
  readonly article: RawArticle;
  readonly haystack: string;
}

/** Out-of-scope headlines that MUST be rejected by the pipeline. */
const NOISE_ARTICLES: readonly Omit<RawArticle, 'raw'>[] = [
  {
    provider: 'mock',
    publisher: 'City Evening Post (fictional)',
    title: 'Fire destroys city centre restaurant, no injuries reported',
    url: 'https://example.com/mock/noise/restaurant-fire',
    canonicalUrl: null,
    publishedAt: null,
    excerpt: 'Firefighters spent four hours tackling a blaze at a restaurant in the city centre.',
    author: null,
    language: 'en',
    sourceTier: 4,
  },
  {
    provider: 'mock',
    publisher: 'Mining Review (fictional)',
    title: 'Twelve trapped after coal mine collapse in remote region',
    url: 'https://example.com/mock/noise/coal-mine-collapse',
    canonicalUrl: null,
    publishedAt: null,
    excerpt: 'Rescue teams are working at the site of a mining accident at an underground coal mine.',
    author: null,
    language: 'en',
    sourceTier: 4,
  },
  {
    provider: 'mock',
    publisher: 'Renewables Daily (fictional)',
    title: 'Explosion reported at offshore wind farm substation',
    url: 'https://example.com/mock/noise/wind-farm-explosion',
    canonicalUrl: null,
    publishedAt: null,
    excerpt: 'An electrical explosion was reported at a wind turbine substation; no injuries.',
    author: null,
    language: 'en',
    sourceTier: 4,
  },
  {
    provider: 'mock',
    publisher: 'Market Ticker (fictional)',
    title: 'Oil prices rise as Brent crude futures climb on supply concerns',
    url: 'https://example.com/mock/noise/oil-prices-rise',
    canonicalUrl: null,
    publishedAt: null,
    excerpt: 'Analysts raised their price target after the quarterly earnings report.',
    author: null,
    language: 'en',
    sourceTier: 5,
  },
  {
    provider: 'mock',
    publisher: 'Transport Wire (fictional)',
    title: 'Train derailment injures 20 near level crossing',
    url: 'https://example.com/mock/noise/train-derailment',
    canonicalUrl: null,
    publishedAt: null,
    excerpt: 'A passenger train derailed close to a level crossing during the morning commute.',
    author: null,
    language: 'en',
    sourceTier: 4,
  },
];

export interface MockNewsProviderOptions {
  /** Injected clock so the corpus lands inside the requested window. */
  readonly now: Date;
  /** Emit duplicate/syndicated copies to exercise deduplication. Default true. */
  readonly includeDuplicates?: boolean;
  /** Emit out-of-scope noise to exercise rejection. Default true. */
  readonly includeNoise?: boolean;
  /**
   * Emit "breaking" stories that are NOT in the seeded database, so a manual scan
   * demonstrates discovery, grouping, material updates and notifications. Default true.
   */
  readonly includeBreaking?: boolean;
}

export class MockNewsProvider implements NewsSourceProvider {
  readonly id = 'mock';
  readonly kind = 'mock' as const;
  readonly defaultTier: SourceTier = 3;

  private readonly corpus: CorpusEntry[];

  constructor(private readonly options: MockNewsProviderOptions) {
    this.corpus = this.buildCorpus();
  }

  private buildCorpus(): CorpusEntry[] {
    const entries: CorpusEntry[] = [];
    const push = (article: RawArticle): void => {
      entries.push({
        article,
        haystack: foldCase(`${article.title} ${article.excerpt ?? ''} ${article.publisher}`),
      });
    };

    for (const incident of buildMockDataset(this.options.now)) {
      for (const article of incident.articles) {
        push(
          rawArticleSchema.parse({
            provider: 'mock',
            publisher: article.publisher,
            title: article.title,
            url: article.originalUrl,
            canonicalUrl: article.canonicalUrl,
            publishedAt: article.publishedAt,
            excerpt: article.excerpt,
            author: article.author,
            language: article.language,
            sourceTier: article.sourceTier,
            raw: { mockIncidentId: incident.id },
          }),
        );
      }

      // Syndicated republication of the first article, under a different outlet and URL.
      if (this.options.includeDuplicates !== false) {
        const first = incident.articles[0];
        if (first !== undefined) {
          push(
            rawArticleSchema.parse({
              provider: 'mock',
              publisher: 'Wire Syndication Network (fictional)',
              title: first.title,
              url: `https://syndicated.example.org/wire/${incident.id}?utm_source=wire`,
              canonicalUrl: first.canonicalUrl,
              publishedAt: first.publishedAt,
              excerpt: first.excerpt,
              author: null,
              language: first.language,
              sourceTier: 5,
              raw: { mockIncidentId: incident.id, syndicated: true },
            }),
          );
        }
      }
    }

    // Breaking stories: present only in the news corpus, never pre-seeded into the DB.
    if (this.options.includeBreaking !== false) {
      for (const item of MOCK_BREAKING_ARTICLES) {
        const publishedAt = new Date(this.options.now.getTime() - item.daysAgo * 86_400_000).toISOString();
        const url = `https://${item.domain ?? 'example.com'}/mock/breaking/${item.slug}`;
        push(
          rawArticleSchema.parse({
            provider: 'mock',
            publisher: item.publisher,
            title: item.title,
            url,
            canonicalUrl: url,
            publishedAt,
            excerpt: item.excerpt,
            author: null,
            language: item.language,
            sourceTier: item.tier,
            raw: { breaking: true, eventKey: item.eventKey },
          }),
        );
      }
    }

    if (this.options.includeNoise !== false) {
      const noiseDate = new Date(this.options.now.getTime() - 86_400_000).toISOString();
      for (const noise of NOISE_ARTICLES) {
        push(rawArticleSchema.parse({ ...noise, publishedAt: noiseDate, raw: { noise: true } }));
      }
    }

    return entries;
  }

  isAvailable(): boolean {
    return true;
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      providerId: this.id,
      healthy: true,
      message: `Mock corpus ready (${this.corpus.length} synthetic articles).`,
      checkedAt: new Date().toISOString(),
    };
  }

  /** Scores an entry against the query's meaningful tokens. */
  private matches(entry: CorpusEntry, query: SearchQuery): boolean {
    const phrases = [...query.text.matchAll(/"([^"]+)"/g)].map((match) => foldCase(match[1] ?? ''));
    if (phrases.length > 0 && phrases.some((phrase) => phrase !== '' && entry.haystack.includes(phrase))) {
      return true;
    }
    const terms = tokenise(query.text.replace(/"/g, '').replace(/-"[^"]*"/g, ''));
    if (terms.length === 0) return true;
    const hits = terms.filter((term) => entry.haystack.includes(term)).length;
    return hits / terms.length >= 0.5;
  }

  async searchNews(query: SearchQuery, context: ProviderContext): Promise<ProviderSearchResult> {
    const startedAt = Date.now();
    const excluded = context.excludeKeywords.map(foldCase);
    const articles = this.corpus
      .filter((entry) => this.matches(entry, query))
      .filter((entry) => !excluded.some((keyword) => keyword !== '' && entry.haystack.includes(keyword)))
      .slice(0, context.maxResults)
      .map((entry) => entry.article);

    return {
      providerId: this.id,
      query,
      articles,
      durationMs: Date.now() - startedAt,
      retries: 0,
    };
  }

  normaliseResult(raw: unknown): RawArticle | null {
    const parsed = rawArticleSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }
}
