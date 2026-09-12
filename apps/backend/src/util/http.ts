/**
 * HTTP client with timeout, bounded retries and exponential backoff with jitter.
 *
 * Retries only on transport errors and on 408/429/5xx. A 4xx other than 408/429 is a
 * bug or a permission problem, and retrying it just burns quota.
 */
import { ProviderError, TimeoutError } from './errors';
import type { Logger } from '../logger';

export interface HttpOptions {
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly userAgent: string;
  readonly logger?: Logger;
}

export interface FetchTextResult {
  readonly body: string;
  readonly status: number;
  readonly retries: number;
  readonly durationMs: number;
}

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function backoffMs(attempt: number): number {
  const base = Math.min(8000, 2 ** attempt * 250);
  return base + Math.random() * 250; // jitter avoids synchronised retries
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** GET a URL and return its body as text. Never throws a non-`AppError`. */
export async function fetchText(
  url: string,
  options: HttpOptions,
  init: { headers?: Record<string, string>; method?: 'GET' | 'POST'; body?: string } = {},
  providerId = 'http',
): Promise<FetchTextResult> {
  const startedAt = Date.now();
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(url, {
        method: init.method ?? 'GET',
        headers: {
          'user-agent': options.userAgent,
          accept: 'application/json, application/rss+xml, application/xml, text/xml, */*',
          ...(init.headers ?? {}),
        },
        body: init.body,
        signal: controller.signal,
        redirect: 'follow',
      });

      if (!response.ok) {
        const shouldRetry = RETRYABLE_STATUSES.has(response.status) && attempt < options.maxRetries;
        const snippet = (await response.text().catch(() => '')).slice(0, 200);
        if (shouldRetry) {
          options.logger?.warn('http retryable failure', {
            providerId,
            status: response.status,
            attempt,
            url: redactUrl(url),
          });
          lastError = new ProviderError(providerId, `HTTP ${response.status}`, true);
          await sleep(backoffMs(attempt));
          continue;
        }
        throw new ProviderError(
          providerId,
          `HTTP ${response.status}${snippet === '' ? '' : `: ${snippet}`}`,
          RETRYABLE_STATUSES.has(response.status),
        );
      }

      return {
        body: await response.text(),
        status: response.status,
        retries: attempt,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      lastError = error;
      const aborted = error instanceof Error && error.name === 'AbortError';
      if (aborted && attempt >= options.maxRetries) throw new TimeoutError(`${providerId} request`, options.timeoutMs);
      if (error instanceof ProviderError && !error.retryable) throw error;
      if (attempt >= options.maxRetries) break;
      options.logger?.warn('http transport failure, retrying', {
        providerId,
        attempt,
        url: redactUrl(url),
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(backoffMs(attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  throw new ProviderError(
    providerId,
    lastError instanceof Error ? lastError.message : 'request failed',
    true,
  );
}

export async function fetchJson<T>(
  url: string,
  options: HttpOptions,
  init: { headers?: Record<string, string>; method?: 'GET' | 'POST'; body?: string } = {},
  providerId = 'http',
): Promise<{ data: T; retries: number; durationMs: number }> {
  const result = await fetchText(url, options, init, providerId);
  try {
    return { data: JSON.parse(result.body) as T, retries: result.retries, durationMs: result.durationMs };
  } catch {
    throw new ProviderError(providerId, 'response was not valid JSON', false);
  }
}

/** Strips query strings from URLs before they reach a log line (they can carry keys). */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '[unparseable url]';
  }
}
