/**
 * Per-key minimum-interval rate limiter.
 *
 * Some public APIs publish a hard pacing rule rather than a quota — GDELT, for
 * example, asks for no more than one request every five seconds and answers 429
 * otherwise. Retries and a circuit breaker do not help with that: the fan-out itself
 * has to be paced.
 *
 * Slots are reserved synchronously before the `await`, so concurrent callers queue
 * behind one another instead of all reading the same "last call" timestamp and firing
 * together.
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class RateLimiter {
  private readonly nextAvailableAt = new Map<string, number>();

  constructor(private readonly intervalsMs: ReadonlyMap<string, number>) {}

  /** Resolves when the caller is allowed to issue a request for `key`. */
  async acquire(key: string): Promise<void> {
    const interval = this.intervalsMs.get(key) ?? 0;
    if (interval <= 0) return;

    const now = Date.now();
    const earliest = this.nextAvailableAt.get(key) ?? 0;
    const startAt = Math.max(now, earliest);

    // Reserve the slot before yielding, so the next caller waits behind this one.
    this.nextAvailableAt.set(key, startAt + interval);

    const waitFor = startAt - now;
    if (waitFor > 0) await sleep(waitFor);
  }

  /** Seconds a caller would currently have to wait. Used for logging and tests. */
  pendingDelayMs(key: string): number {
    const earliest = this.nextAvailableAt.get(key) ?? 0;
    return Math.max(0, earliest - Date.now());
  }
}
