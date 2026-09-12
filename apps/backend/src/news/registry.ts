/**
 * Provider registry.
 *
 * Adding a provider = write the adapter + add one case here. The scanner never imports
 * a concrete provider.
 */
import type { Env } from '../env';
import type { Logger } from '../logger';
import type { HttpOptions } from '../util/http';
import { BingNewsProvider } from './bing-news-provider';
import { GdeltProvider } from './gdelt-provider';
import { GoogleCseProvider } from './google-cse-provider';
import { GoogleNewsRssProvider } from './google-news-rss-provider';
import { MockNewsProvider } from './mock-news-provider';
import { NewsApiProvider } from './newsapi-provider';
import { RssProvider } from './rss-provider';
import type { NewsSourceProvider } from './news-source-provider';

export interface RegistryOptions {
  readonly now: () => Date;
}

export function createNewsProviders(
  env: Env,
  logger: Logger,
  http: HttpOptions,
  options: RegistryOptions,
): NewsSourceProvider[] {
  if (env.APP_MODE === 'mock') {
    logger.info('news providers: mock only (no network calls, no cost)');
    return [new MockNewsProvider({ now: options.now() })];
  }

  const requested = new Set(env.NEWS_PROVIDERS);
  const providers: NewsSourceProvider[] = [];

  const add = (provider: NewsSourceProvider): void => {
    if (!requested.has(provider.id)) return;
    if (!provider.isAvailable()) {
      logger.warn('news provider requested but unavailable, skipping', { providerId: provider.id });
      return;
    }
    providers.push(provider);
  };

  add(new MockNewsProvider({ now: options.now() }));
  add(new RssProvider(http));
  add(new GoogleNewsRssProvider(http));
  add(new GdeltProvider(http));
  add(new BingNewsProvider(http, env.BING_API_KEY, env.BING_ENDPOINT));
  add(new GoogleCseProvider(http, env.GOOGLE_SEARCH_API_KEY, env.GOOGLE_SEARCH_ENGINE_ID));
  add(new NewsApiProvider(http, env.NEWS_API_KEY));

  if (providers.length === 0) {
    logger.warn('no news providers available, falling back to mock', { requested: [...requested] });
    providers.push(new MockNewsProvider({ now: options.now() }));
  }

  logger.info('news providers configured', { providers: providers.map((provider) => provider.id) });
  return providers;
}

export type { NewsSourceProvider, ProviderContext, ProviderHealth, ProviderSearchResult } from './news-source-provider';
export { MockNewsProvider } from './mock-news-provider';
