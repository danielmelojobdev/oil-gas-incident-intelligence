/**
 * Scheduler (brief section 14): the scanner must not depend on the app being open.
 *
 * Implemented with aligned timers rather than a cron dependency — the frequencies the
 * product needs are all simple intervals, and an aligned timer is easier to reason
 * about (and to test) than a cron expression parser.
 */
import type { ScanFrequency } from '@ogii/domain';
import type { Logger } from '../logger';
import type { ScanQueue } from '../scanner/scan-queue';
import type { ScanConfig } from '@ogii/domain';
import { toErrorMessage } from '../util/errors';

const INTERVAL_MS: Readonly<Record<Exclude<ScanFrequency, 'off'>, number>> = {
  hourly: 60 * 60 * 1000,
  'every-3-hours': 3 * 60 * 60 * 1000,
  'every-6-hours': 6 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
};

export interface SchedulerOptions {
  readonly frequency: ScanFrequency;
  readonly enabled: boolean;
  readonly queue: ScanQueue;
  readonly logger: Logger;
  readonly config: () => ScanConfig;
  readonly now: () => Date;
}

export class ScanScheduler {
  private timer: NodeJS.Timeout | null = null;
  private nextRunAt: Date | null = null;

  constructor(private readonly options: SchedulerOptions) {}

  get nextScheduledRun(): string | null {
    return this.nextRunAt?.toISOString() ?? null;
  }

  get frequency(): ScanFrequency {
    return this.options.frequency;
  }

  start(): void {
    if (!this.options.enabled || this.options.frequency === 'off') {
      this.options.logger.info('scheduler disabled', { frequency: this.options.frequency });
      return;
    }

    const intervalMs = INTERVAL_MS[this.options.frequency];
    // Align to the wall clock so runs land on the hour rather than on process start.
    const now = this.options.now().getTime();
    const delay = intervalMs - (now % intervalMs);
    this.nextRunAt = new Date(now + delay);

    this.options.logger.info('scheduler started', {
      frequency: this.options.frequency,
      nextRunAt: this.nextRunAt.toISOString(),
    });

    const schedule = (wait: number): void => {
      this.timer = setTimeout(() => {
        void this.fire();
        this.nextRunAt = new Date(this.options.now().getTime() + intervalMs);
        schedule(intervalMs);
      }, wait);
      this.timer.unref?.();
    };
    schedule(delay);
  }

  private async fire(): Promise<void> {
    try {
      const result = await this.options.queue.enqueue('scheduled', this.options.config());
      this.options.logger.info('scheduled scan triggered', { scanId: result.scanId, accepted: result.accepted });
    } catch (error) {
      this.options.logger.error('scheduled scan failed to start', { error: toErrorMessage(error) });
    }
  }

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.nextRunAt = null;
  }
}
