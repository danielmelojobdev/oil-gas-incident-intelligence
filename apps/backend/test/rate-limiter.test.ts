import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/util/rate-limiter';

describe('RateLimiter', () => {
  it('does not delay a key with no configured interval', async () => {
    const limiter = new RateLimiter(new Map());
    const startedAt = Date.now();
    await limiter.acquire('free');
    await limiter.acquire('free');
    expect(Date.now() - startedAt).toBeLessThan(30);
  });

  it('paces sequential calls for the same key', async () => {
    const limiter = new RateLimiter(new Map([['slow', 60]]));
    const startedAt = Date.now();
    await limiter.acquire('slow');
    await limiter.acquire('slow');
    await limiter.acquire('slow');
    // First is immediate, then two waits of ~60ms.
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(110);
  });

  it('queues concurrent callers instead of releasing them together', async () => {
    const limiter = new RateLimiter(new Map([['slow', 50]]));
    const startedAt = Date.now();
    const finishes: number[] = [];
    await Promise.all(
      [0, 1, 2, 3].map(async () => {
        await limiter.acquire('slow');
        finishes.push(Date.now() - startedAt);
      }),
    );
    finishes.sort((a, b) => a - b);
    // Four callers at 50ms apart: the last one waits at least 150ms.
    expect(finishes[3]).toBeGreaterThanOrEqual(140);
  });

  it('keeps separate keys independent', async () => {
    const limiter = new RateLimiter(new Map([['a', 80], ['b', 0]]));
    await limiter.acquire('a');
    const startedAt = Date.now();
    await limiter.acquire('b');
    expect(Date.now() - startedAt).toBeLessThan(30);
    expect(limiter.pendingDelayMs('a')).toBeGreaterThan(0);
  });
});
