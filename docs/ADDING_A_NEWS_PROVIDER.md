# Adding a new news provider

Three steps, roughly 120 lines. The scanner never imports a concrete provider, so nothing in the
pipeline changes.

## 1. Implement the port

Create `apps/backend/src/news/<your-provider>.ts`:

```ts
import { isSafeHttpUrl, publisherHost, rawArticleSchema, renderQueryText,
         type RawArticle, type SearchQuery, type SourceTier } from '@ogii/domain';
import { fetchJson, type HttpOptions } from '../util/http';
import { publisherNameForUrl, tierForUrl } from './feeds';
import type { NewsSourceProvider, ProviderContext, ProviderHealth,
              ProviderSearchResult } from './news-source-provider';

export class YourProvider implements NewsSourceProvider {
  readonly id = 'your-provider';
  readonly kind = 'search' as const;        // 'search' | 'feed' | 'regulator'
  readonly defaultTier: SourceTier = 4;

  constructor(private readonly http: HttpOptions, private readonly apiKey: string | null) {}

  isAvailable(): boolean {
    return this.apiKey !== null;            // false ⇒ the registry skips it with a warning
  }

  async healthCheck(): Promise<ProviderHealth> { /* one cheap call, never throws */ }

  async searchNews(query: SearchQuery, context: ProviderContext): Promise<ProviderSearchResult> {
    const { data, durationMs, retries } = await fetchJson<YourResponse>(url, this.http, init, this.id);
    const articles = (data.items ?? [])
      .map((item) => this.normaliseResult(item))
      .filter((a): a is RawArticle => a !== null)
      .slice(0, context.maxResults);
    return { providerId: this.id, query, articles, durationMs, retries };
  }

  normaliseResult(raw: unknown): RawArticle | null {
    // Parse, never cast. Returning null for an unusable record is correct and expected.
    const parsed = rawArticleSchema.safeParse({ /* map fields */ });
    return parsed.success ? parsed.data : null;
  }
}
```

### Rules the implementation must follow

| Rule | Why |
|---|---|
| Use `fetchText` / `fetchJson` from `util/http` | You inherit timeout, bounded retry, exponential backoff with jitter, and log redaction |
| Never throw from `healthCheck()` | It is called on `/health`; a dead provider must not 500 the endpoint |
| `normaliseResult` returns `null`, never throws | One malformed record must not lose the whole page of results |
| Return `null` for an unparseable date | Never substitute "now": that would put a dateless article into the wrong window |
| Reject unsafe URLs with `isSafeHttpUrl` | Stops `javascript:` / `data:` / credential URLs at the boundary |
| Respect `context.maxResults` | It is the per-query budget |
| Store metadata only | Never the article body (decision D7) |

## 2. Register it

`apps/backend/src/news/registry.ts`:

```ts
add(new YourProvider(http, env.YOUR_PROVIDER_API_KEY));
```

`add()` skips providers that are not requested in `NEWS_PROVIDERS` and those whose
`isAvailable()` is false.

## 3. Declare its configuration

* `apps/backend/src/env.ts` — add the key to `envSchema` (use `optionalString`), and add a
  cross-field check in `loadEnv` if the provider is useless without it.
* `.env.example` — document it.
* `supabase/migrations/0003_seed_sources.sql` — add a row to `source_providers`.

## 4. Assign source tiers

Tier drives the confidence score, so it matters. Add the publishers this provider surfaces to
`SOURCE_CATALOGUE` in `apps/backend/src/news/feeds.ts` with the right tier, and mirror the row in
`0003_seed_sources.sql`. Unlisted hosts default to Tier 5, except `*.gov*` which is Tier 1.

## 5. Test it

Add a case to `apps/backend/test/providers.test.ts`. Test `normaliseResult` directly — it is pure,
so no network is needed:

```ts
it('rejects records without a safe URL', () => {
  expect(provider.normaliseResult({ url: 'javascript:alert(1)', title: 'x' })).toBeNull();
});
```

## Legal checklist

Before adding a source, confirm all four:

- [ ] The feed or API is published for third-party consumption.
- [ ] Access does not violate `robots.txt` or the terms of service.
- [ ] No paywall is circumvented.
- [ ] Only metadata is retained — headline, excerpt as published, publisher, dates, URL.

If any is false, do not add it.
