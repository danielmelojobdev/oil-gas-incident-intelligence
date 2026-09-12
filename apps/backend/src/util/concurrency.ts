/** Minimal concurrency limiter — keeps provider and AI fan-out inside sane bounds. */

export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

export function createLimiter(maxConcurrent: number): Limiter {
  const limit = Math.max(1, maxConcurrent);
  let active = 0;
  const queue: (() => void)[] = [];

  const next = (): void => {
    if (active >= limit) return;
    const run = queue.shift();
    if (run === undefined) return;
    active += 1;
    run();
  };

  return <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            next();
          });
      });
      next();
    });
}

/** Runs tasks with a concurrency cap, never rejecting: mirrors Promise.allSettled. */
export async function mapSettled<T, R>(
  items: readonly T[],
  maxConcurrent: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const limiter = createLimiter(maxConcurrent);
  return Promise.allSettled(items.map((item, index) => limiter(() => task(item, index))));
}
