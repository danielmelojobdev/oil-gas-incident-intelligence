/** In-process TTL cache, used to avoid paying twice for the same AI answer. */

interface Entry<V> {
  readonly value: V;
  readonly expiresAt: number;
}

export class TtlCache<V> {
  private readonly store = new Map<string, Entry<V>>();
  private hits = 0;
  private misses = 0;

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 5000,
  ) {}

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (entry === undefined) {
      this.misses += 1;
      return undefined;
    }
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    return entry.value;
  }

  set(key: string, value: V): void {
    if (this.store.size >= this.maxEntries) {
      // Cheap eviction: drop the oldest insertion (Map preserves insertion order).
      const oldest = this.store.keys().next();
      if (!oldest.done) this.store.delete(oldest.value);
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  async wrap(key: string, produce: () => Promise<V>): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await produce();
    this.set(key, value);
    return value;
  }

  get stats(): { hits: number; misses: number; size: number } {
    return { hits: this.hits, misses: this.misses, size: this.store.size };
  }

  clear(): void {
    this.store.clear();
  }
}
