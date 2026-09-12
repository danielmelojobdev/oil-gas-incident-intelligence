# Adding a new AI provider

One file, one method. `BaseAiProvider` already implements the six port methods, the prompts, the
JSON repair, the Zod validation, the content-hash cache and the usage accounting.

## 1. Implement `complete()`

`apps/backend/src/ai/<vendor>-provider.ts`:

```ts
import { BaseAiProvider, type BaseAiOptions, type CompletionRequest,
         type CompletionResponse } from './base-ai-provider';
import { fetchJson, type HttpOptions } from '../util/http';
import { AiResponseError } from '../util/errors';

export interface VendorOptions extends BaseAiOptions {
  readonly apiKey: string | null;
  readonly http: HttpOptions;
}

export class VendorProvider extends BaseAiProvider {
  readonly id = 'vendor';
  private readonly apiKey: string | null;
  private readonly http: HttpOptions;

  constructor(options: VendorOptions) {
    super({
      ...options,
      // Two tiers on purpose: a cheap model screens, a stronger one extracts.
      classifyModel: options.classifyModel || 'vendor-small',
      extractModel: options.extractModel || 'vendor-large',
    });
    this.apiKey = options.apiKey;
    this.http = options.http;
  }

  isAvailable(): boolean {
    return this.apiKey !== null;
  }

  protected async complete(request: CompletionRequest): Promise<CompletionResponse> {
    if (this.apiKey === null) throw new AiResponseError('VENDOR_API_KEY is not configured', '');

    const { data } = await fetchJson<VendorResponse>(endpoint, this.http, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: request.model,
        temperature: request.temperature,   // always 0: extraction is not creative
        max_tokens: request.maxOutputTokens,
        // Ask for JSON mode if the vendor supports it — it reduces repair work.
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
      }),
    }, 'vendor');

    const text = data.output?.text;
    if (typeof text !== 'string' || text.trim() === '') {
      throw new AiResponseError('Vendor returned an empty completion', JSON.stringify(data).slice(0, 500));
    }
    return {
      text,
      promptTokens: data.usage?.input ?? null,
      completionTokens: data.usage?.output ?? null,
    };
  }
}
```

That is the whole adapter. Do **not** override the six port methods.

## 2. Register it

`apps/backend/src/ai/registry.ts`:

```ts
case 'vendor':
  return new VendorProvider({ ...base, apiKey: env.VENDOR_API_KEY });
```

## 3. Declare its configuration

* `apps/backend/src/env.ts` — add `'vendor'` to the `AI_PROVIDER` enum, add `VENDOR_API_KEY`, and
  add the cross-field check that refuses to boot without the key.
* `.env.example` — document both.

## Rules that are not negotiable

| Rule | Enforced by |
|---|---|
| Never return raw model JSON | `parseAiJson(schema, text)` is the only path from text to a value |
| Unknown ⇒ `null`, never `0`, never invented | The Zod schemas in `packages/domain/src/schemas.ts` |
| Temperature 0 | Passed in `CompletionRequest`; do not override |
| Keys never leave the backend | Nothing in `apps/mobile` may read an AI key |
| Never log the key | `logger` redacts `*_key` / `*token*` / `*secret*` by pattern |

## Testing without spending anything

`MockAiProvider` implements the same port with a deterministic rules engine, so the whole pipeline
and all its tests run at zero cost. To test a real adapter's parsing without network access, call
`parseAiJson` directly against a captured response — see `apps/backend/test/ai-json.test.ts`.

## Degradation

If your provider throws, the scanner does not stop. It falls back to
`extractIncidentHeuristically()` (rules only) and records lower confidence for the affected
incidents. Keep that in mind: a slow provider is worse than an unavailable one, so respect
`AI_TIMEOUT_MS`.
