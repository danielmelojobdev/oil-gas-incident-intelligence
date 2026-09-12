/**
 * Serialises scans.
 *
 * "Scan Now" returns immediately with a scan id; the work happens in the background
 * and the app polls `GET /v1/scans/:id` for progress. Only one scan runs at a time —
 * two concurrent scans would fight over grouping and could create duplicate incidents.
 */
import type { ScanConfig, ScanTrigger } from '@ogii/domain';
import type { Logger } from '../logger';
import type { AccidentNewsScanner } from './scanner';
import type { ScanSummary } from './types';
import { toErrorMessage } from '../util/errors';

export interface QueuedScan {
  readonly scanId: string;
  readonly accepted: boolean;
  readonly reason: string;
}

export class ScanQueue {
  private running: { scanId: string; promise: Promise<ScanSummary> } | null = null;
  private lastSummary: ScanSummary | null = null;
  private lastManualStartedAt = 0;

  constructor(
    private readonly scanner: AccidentNewsScanner,
    private readonly logger: Logger,
  ) {}

  get isRunning(): boolean {
    return this.running !== null;
  }

  get currentScanId(): string | null {
    return this.running?.scanId ?? null;
  }

  get latestSummary(): ScanSummary | null {
    return this.lastSummary;
  }

  /**
   * Seconds remaining before another user-triggered scan is allowed.
   *
   * Scans cost real money (provider quota and model tokens) and are global rather than
   * per-user, so one impatient tap must not be able to run the budget down.
   */
  cooldownRemaining(cooldownSeconds: number): number {
    if (this.lastManualStartedAt === 0) return 0;
    const elapsed = (Date.now() - this.lastManualStartedAt) / 1000;
    return Math.max(0, Math.ceil(cooldownSeconds - elapsed));
  }

  /** Starts a scan unless one is already running. Never throws. */
  async enqueue(trigger: ScanTrigger, config: ScanConfig): Promise<QueuedScan> {
    if (this.running !== null) {
      return {
        scanId: this.running.scanId,
        accepted: false,
        reason: 'A scan is already running; returning the in-flight scan id.',
      };
    }

    if (trigger === 'manual') this.lastManualStartedAt = Date.now();

    // The scan id is created inside run(); expose it as soon as the first await resolves.
    let resolveId: (id: string) => void = () => undefined;
    const idPromise = new Promise<string>((resolve) => {
      resolveId = resolve;
    });

    const promise = this.scanner
      .run({ trigger, config })
      .then((summary) => {
        resolveId(summary.scanId);
        this.lastSummary = summary;
        return summary;
      })
      .catch((error: unknown) => {
        this.logger.error('queued scan failed', { error: toErrorMessage(error) });
        throw error;
      })
      .finally(() => {
        this.running = null;
      });

    this.running = { scanId: 'pending', promise };
    // Wait only long enough to learn the id; the scan itself continues in the background.
    const scanId = await Promise.race([
      idPromise,
      new Promise<string>((resolve) => setTimeout(() => resolve('pending'), 250)),
    ]);
    if (this.running !== null) this.running = { scanId, promise };

    return { scanId, accepted: true, reason: 'Scan started.' };
  }

  /** Used by the CLI and tests: run to completion. */
  async runToCompletion(trigger: ScanTrigger, config: ScanConfig): Promise<ScanSummary> {
    if (this.running !== null) return this.running.promise;
    const summary = await this.scanner.run({ trigger, config });
    this.lastSummary = summary;
    return summary;
  }
}
