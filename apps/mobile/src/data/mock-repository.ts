/**
 * Mock Mode repository (brief section 56).
 *
 * Runs the real domain filtering, grouping-aware counts and report model against the
 * fictional dataset, entirely on device. Per-user state (read / saved / archived) is
 * persisted with AsyncStorage so the app behaves like the real thing across restarts.
 *
 * It also simulates a scan: staged progress, then a realistic summary, then two extra
 * incidents appearing in the feed — so "Scan Now" is demonstrable without a backend.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MOCK_BANNER,
  PRODUCT,
  buildMockDataset,
  incidentFiltersSchema,
  userPreferencesSchema,
  type Dashboard,
  type IncidentDetail,
  type IncidentFilters,
  type IncidentPage,
  type NewsSource,
  type ScanRun,
  type UserIncidentState,
  type UserPreferences,
} from '@ogii/domain';
import {
  applyMockFilters,
  buildMockDashboard,
  mockSources,
  toCard,
} from './mock-query';
import type { AppMeta, IncidentRepository, ScanStartResult, ScanStatus } from './repository';

const STATE_KEY = 'ogii.incidentState.v1';
const PREFERENCES_KEY = 'ogii.preferences.v1';
const SCAN_KEY = 'ogii.lastScan.v1';
const DISCOVERED_KEY = 'ogii.discovered.v1';

/** Incidents that only appear after the user runs a scan, so Scan Now visibly works. */
const DISCOVERABLE_KEYS = ['mock-incident-h2s-release-onshore', 'mock-incident-vessel-collision-supply'];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is a convenience here; losing it must never break the app.
  }
}

export class MockRepository implements IncidentRepository {
  readonly id = 'mock' as const;

  private cache: IncidentDetail[] | null = null;
  private runningScan: ScanRun | null = null;

  private now(): Date {
    return new Date();
  }

  private async all(): Promise<IncidentDetail[]> {
    this.cache ??= buildMockDataset(this.now());
    const discovered = await readJson<string[]>(DISCOVERED_KEY, []);
    // Before the first scan, the "discoverable" incidents are simply not there yet.
    return this.cache.filter(
      (incident) => !DISCOVERABLE_KEYS.includes(incident.id) || discovered.includes(incident.id),
    );
  }

  async getMeta(): Promise<AppMeta> {
    return {
      product: PRODUCT.name,
      mode: 'mock',
      isMock: true,
      mockBanner: MOCK_BANNER,
      disclaimer: PRODUCT.disclaimer,
      dataCaveat: PRODUCT.dataCaveat,
      severityCaveat: PRODUCT.severityCaveat,
    };
  }

  async listIncidents(filters: IncidentFilters): Promise<IncidentPage> {
    const parsed = incidentFiltersSchema.parse(filters);
    const states = await this.getIncidentStates();
    const filtered = applyMockFilters(await this.all(), parsed, this.now(), states);
    const offset = parsed.cursor === null ? 0 : Math.max(0, Number.parseInt(parsed.cursor, 10) || 0);
    const page = filtered.slice(offset, offset + parsed.limit);
    const nextOffset = offset + page.length;
    return {
      items: page.map(toCard),
      nextCursor: nextOffset < filtered.length ? String(nextOffset) : null,
      total: filtered.length,
    };
  }

  async getIncident(id: string): Promise<IncidentDetail | null> {
    const incident = (await this.all()).find((item) => item.id === id);
    if (incident === undefined) return null;
    const states = await this.getIncidentStates();
    return { ...incident, userState: states[id] ?? 'new' };
  }

  async getDashboard(): Promise<Dashboard> {
    const states = await this.getIncidentStates();
    const visible = (await this.all()).filter((incident) => states[incident.id] !== 'archived');
    return buildMockDashboard(visible, this.now());
  }

  async listSources(): Promise<NewsSource[]> {
    return mockSources();
  }

  async getIncidentStates(): Promise<Record<string, UserIncidentState>> {
    return readJson<Record<string, UserIncidentState>>(STATE_KEY, {});
  }

  async setIncidentState(id: string, state: UserIncidentState): Promise<void> {
    const states = await this.getIncidentStates();
    states[id] = state;
    await writeJson(STATE_KEY, states);
  }

  async getScanStatus(): Promise<ScanStatus> {
    const run = this.runningScan ?? (await readJson<ScanRun | null>(SCAN_KEY, null));
    return {
      run,
      running: this.runningScan !== null && this.runningScan.status === 'running',
      currentScanId: this.runningScan?.id ?? null,
      frequency: 'every-6-hours',
      nextScheduledRun: new Date(this.now().getTime() + 6 * 3600_000).toISOString(),
      sourcesMonitored: mockSources().length,
    };
  }

  /**
   * Simulates the backend scan. The stage sequence is the real one, and the summary
   * numbers are derived from the mock corpus rather than invented at random.
   */
  async startScan(): Promise<ScanStartResult> {
    const startedAt = this.now();
    const id = `mock-scan-${startedAt.getTime()}`;

    const base: ScanRun = {
      id,
      trigger: 'manual',
      status: 'running',
      startedAt: startedAt.toISOString(),
      finishedAt: null,
      durationMs: null,
      providerCount: 18,
      queriesGenerated: 40,
      resultsFound: 0,
      resultsRejected: 0,
      articlesProcessed: 0,
      duplicatesFound: 0,
      newIncidents: 0,
      updatedIncidents: 0,
      notificationsSent: 0,
      aiCalls: 0,
      errors: [],
      providerResults: [],
      stage: 'Scanning...',
      progress: 0.02,
      isMock: true,
    };
    this.runningScan = base;

    void this.advanceScan(id, startedAt);
    return { scanId: id, accepted: true, message: 'Scan started (mock).' };
  }

  private async advanceScan(id: string, startedAt: Date): Promise<void> {
    const steps: { stage: string; progress: number; patch: Partial<ScanRun>; wait: number }[] = [
      { stage: 'Searching sources...', progress: 0.18, patch: { resultsFound: 124 }, wait: 700 },
      { stage: 'Analysing articles...', progress: 0.42, patch: { articlesProcessed: 124 }, wait: 900 },
      { stage: 'Removing duplicates...', progress: 0.6, patch: { duplicatesFound: 5 }, wait: 700 },
      { stage: 'Grouping incidents...', progress: 0.75, patch: { resultsRejected: 9 }, wait: 700 },
      { stage: 'Generating intelligence...', progress: 0.9, patch: { aiCalls: 21 }, wait: 900 },
    ];

    for (const step of steps) {
      await delay(step.wait);
      if (this.runningScan?.id !== id) return;
      this.runningScan = { ...this.runningScan, stage: step.stage, progress: step.progress, ...step.patch };
    }

    await delay(600);
    if (this.runningScan?.id !== id) return;

    // Reveal the incidents that were waiting to be "found".
    const discovered = await readJson<string[]>(DISCOVERED_KEY, []);
    const newlyFound = DISCOVERABLE_KEYS.filter((key) => !discovered.includes(key));
    await writeJson(DISCOVERED_KEY, [...discovered, ...newlyFound]);

    const finishedAt = this.now();
    const completed: ScanRun = {
      ...this.runningScan,
      status: 'completed',
      stage: 'Complete.',
      progress: 1,
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      resultsFound: 124,
      articlesProcessed: 124,
      resultsRejected: 9,
      duplicatesFound: 5,
      newIncidents: newlyFound.length,
      updatedIncidents: newlyFound.length > 0 ? 1 : 0,
      notificationsSent: newlyFound.length,
      aiCalls: 21,
      providerResults: [
        { provider: 'mock', queriesExecuted: 40, resultsFound: 124, durationMs: 3200, errorCount: 0, retryCount: 0, healthy: true, errorMessage: null },
      ],
    };
    this.runningScan = null;
    await writeJson(SCAN_KEY, completed);
  }

  async getScanRun(scanId: string): Promise<ScanRun | null> {
    if (this.runningScan?.id === scanId) return this.runningScan;
    const last = await readJson<ScanRun | null>(SCAN_KEY, null);
    return last !== null && last.id === scanId ? last : last;
  }

  async registerDevice(): Promise<void> {
    // No backend in Mock Mode; notifications are scheduled locally by the caller.
  }

  async getPreferences(): Promise<UserPreferences> {
    return userPreferencesSchema.parse(await readJson<unknown>(PREFERENCES_KEY, {}));
  }

  async savePreferences(preferences: UserPreferences): Promise<UserPreferences> {
    const parsed = userPreferencesSchema.parse(preferences);
    await writeJson(PREFERENCES_KEY, parsed);
    return parsed;
  }

  async exportUserData(): Promise<Record<string, unknown>> {
    return {
      mode: 'mock',
      preferences: await this.getPreferences(),
      incidentState: await this.getIncidentStates(),
      lastScan: await readJson<ScanRun | null>(SCAN_KEY, null),
    };
  }

  async deleteUserData(): Promise<void> {
    await AsyncStorage.multiRemove([STATE_KEY, PREFERENCES_KEY, SCAN_KEY, DISCOVERED_KEY]);
  }
}
