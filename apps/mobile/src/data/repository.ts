/**
 * The app's data port.
 *
 * Screens never call `fetch`. They call a repository, which is either the local mock
 * store (Mock Mode, no backend, no keys) or the HTTP client. Swapping between them is
 * one environment variable.
 */
import type {
  Dashboard,
  IncidentDetail,
  IncidentFilters,
  IncidentPage,
  NewsSource,
  ScanRun,
  UserIncidentState,
  UserPreferences,
} from '@ogii/domain';

export interface ScanStatus {
  readonly run: ScanRun | null;
  readonly running: boolean;
  readonly currentScanId: string | null;
  readonly frequency: string;
  readonly nextScheduledRun: string | null;
  readonly sourcesMonitored: number;
}

export interface ScanStartResult {
  readonly scanId: string;
  readonly accepted: boolean;
  readonly message: string;
}

export interface AppMeta {
  readonly product: string;
  readonly mode: string;
  readonly isMock: boolean;
  readonly mockBanner: string | null;
  readonly disclaimer: string;
  readonly dataCaveat: string;
  readonly severityCaveat: string;
}

export interface IncidentRepository {
  readonly id: 'mock' | 'api';
  getMeta(): Promise<AppMeta>;
  listIncidents(filters: IncidentFilters): Promise<IncidentPage>;
  getIncident(id: string): Promise<IncidentDetail | null>;
  getDashboard(): Promise<Dashboard>;
  listSources(): Promise<NewsSource[]>;
  setIncidentState(id: string, state: UserIncidentState): Promise<void>;
  getIncidentStates(): Promise<Record<string, UserIncidentState>>;
  getScanStatus(): Promise<ScanStatus>;
  startScan(): Promise<ScanStartResult>;
  getScanRun(scanId: string): Promise<ScanRun | null>;
  registerDevice(token: string, platform: 'ios' | 'android' | 'web'): Promise<void>;
  getPreferences(): Promise<UserPreferences>;
  savePreferences(preferences: UserPreferences): Promise<UserPreferences>;
  exportUserData(): Promise<Record<string, unknown>>;
  deleteUserData(): Promise<void>;
}
