/**
 * Per-provider circuit breaker (brief section 50).
 *
 * After `failureThreshold` consecutive failures the breaker opens and calls fail fast
 * for `resetMs`, then a single probe decides whether to close it again. This stops one
 * dead provider from consuming the whole scan budget in timeouts.
 */
export type BreakerState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private state: BreakerState = 'closed';

  constructor(
    readonly name: string,
    private readonly failureThreshold = 4,
    private readonly resetMs = 60_000,
  ) {}

  get currentState(): BreakerState {
    if (this.state === 'open' && Date.now() - this.openedAt >= this.resetMs) {
      this.state = 'half-open';
    }
    return this.state;
  }

  get isOpen(): boolean {
    return this.currentState === 'open';
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.openedAt = Date.now();
    }
  }

  /** Runs `task` unless the breaker is open, in which case it throws immediately. */
  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.isOpen) {
      throw new Error(`Circuit breaker for "${this.name}" is open`);
    }
    try {
      const result = await task();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }
}
