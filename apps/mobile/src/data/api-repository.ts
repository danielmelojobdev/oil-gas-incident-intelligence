/**
 * HTTP repository: talks to the scanner backend.
 *
 * Carries a stable anonymous device id so per-user state works before the user signs
 * in, and forwards a Supabase JWT when one is available. It never holds a secret.
 */
import {
  dashboardSchema,
  incidentDetailSchema,
  incidentPageSchema,
  newsSourceSchema,
  scanRunSchema,
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
import { z } from 'zod';
import { appConfig } from '../lib/config';
import { getDeviceId, getAuthToken } from './identity';
import type { AppMeta, IncidentRepository, ScanStartResult, ScanStatus } from './repository';

const metaSchema = z.object({
  product: z.string(),
  mode: z.string(),
  isMock: z.boolean(),
  mockBanner: z.string().nullable(),
  disclaimer: z.string(),
  dataCaveat: z.string(),
  severityCaveat: z.string(),
});

const scanStatusSchema = z.object({
  run: scanRunSchema.nullable(),
  running: z.boolean(),
  currentScanId: z.string().nullable(),
  frequency: z.string(),
  nextScheduledRun: z.string().nullable(),
  sourcesMonitored: z.number().int().min(0),
});

const scanStartSchema = z.object({
  scanId: z.string(),
  accepted: z.boolean(),
  message: z.string(),
});

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Serialises domain filters into the query string the backend expects. */
function toQuery(filters: IncidentFilters): string {
  const params = new URLSearchParams();
  const put = (key: string, value: string | number | boolean | null): void => {
    if (value === null || value === '' || value === false) return;
    params.set(key, String(value));
  };
  const putList = (key: string, values: readonly string[]): void => {
    if (values.length > 0) params.set(key, values.join(','));
  };

  put('period', filters.period);
  put('dateAxis', filters.dateAxis);
  put('from', filters.from);
  put('to', filters.to);
  put('q', filters.query);
  put('filter', filters.feedFilter);
  putList('sectors', filters.sectors);
  putList('severities', filters.severities);
  putList('confidences', filters.confidences);
  putList('countries', filters.countries);
  putList('operators', filters.operators);
  putList('environments', filters.environments);
  putList('lifecycleStages', filters.lifecycleStages);
  putList('incidentTypes', filters.incidentTypes);
  putList('states', filters.states);
  put('wellIntegrityOnly', filters.wellIntegrityOnly);
  put('processSafetyOnly', filters.processSafetyOnly);
  put('includeArchived', filters.includeArchived);
  put('minRelevance', filters.minRelevance);
  put('limit', filters.limit);
  put('cursor', filters.cursor);
  put('sort', filters.sort);
  return params.toString();
}

export class ApiRepository implements IncidentRepository {
  readonly id = 'api' as const;

  constructor(private readonly baseUrl: string = appConfig.apiUrl) {}

  private async request<S extends z.ZodTypeAny>(
    path: string,
    schema: S,
    init: RequestInit = {},
  ): Promise<z.output<S>> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'x-device-id': await getDeviceId(),
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
    };
    const token = await getAuthToken();
    if (token !== null) headers.authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
        signal: controller.signal,
      });

      const text = await response.text();
      if (!response.ok) {
        let message = `Request failed (${response.status})`;
        let code = 'http_error';
        try {
          const parsed = JSON.parse(text) as { error?: { message?: string; code?: string } };
          message = parsed.error?.message ?? message;
          code = parsed.error?.code ?? code;
        } catch {
          // Non-JSON error body; keep the generic message.
        }
        throw new ApiError(message, response.status, code);
      }

      return schema.parse(text === '' ? {} : (JSON.parse(text) as unknown));
    } finally {
      clearTimeout(timeout);
    }
  }

  async getMeta(): Promise<AppMeta> {
    return this.request('/v1/meta', metaSchema);
  }

  async listIncidents(filters: IncidentFilters): Promise<IncidentPage> {
    return this.request(`/v1/incidents?${toQuery(filters)}`, incidentPageSchema);
  }

  async getIncident(id: string): Promise<IncidentDetail | null> {
    try {
      return await this.request(`/v1/incidents/${encodeURIComponent(id)}`, incidentDetailSchema);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  }

  async getDashboard(): Promise<Dashboard> {
    return this.request('/v1/dashboard', dashboardSchema);
  }

  async listSources(): Promise<NewsSource[]> {
    const result = await this.request(
      '/v1/sources',
      z.object({ items: z.array(newsSourceSchema), total: z.number() }),
    );
    return result.items;
  }

  async setIncidentState(id: string, state: UserIncidentState): Promise<void> {
    await this.request(
      `/v1/incidents/${encodeURIComponent(id)}/state`,
      z.object({ id: z.string(), state: z.string() }),
      { method: 'POST', body: JSON.stringify({ state }) },
    );
  }

  async getIncidentStates(): Promise<Record<string, UserIncidentState>> {
    // The server applies state server-side; the app reads it per incident.
    return {};
  }

  async getScanStatus(): Promise<ScanStatus> {
    return this.request('/v1/scans/latest', scanStatusSchema);
  }

  async startScan(): Promise<ScanStartResult> {
    return this.request('/v1/scans', scanStartSchema, {
      method: 'POST',
      body: JSON.stringify({ trigger: 'manual' }),
    });
  }

  async getScanRun(scanId: string): Promise<ScanRun | null> {
    try {
      return await this.request(`/v1/scans/${encodeURIComponent(scanId)}`, scanRunSchema);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  }

  async registerDevice(token: string, platform: 'ios' | 'android' | 'web'): Promise<void> {
    await this.request('/v1/devices', z.object({ registered: z.boolean() }), {
      method: 'POST',
      body: JSON.stringify({ expoPushToken: token, platform, appVersion: '0.1.0' }),
    });
  }

  async getPreferences(): Promise<UserPreferences> {
    return this.request('/v1/preferences', userPreferencesSchema);
  }

  async savePreferences(preferences: UserPreferences): Promise<UserPreferences> {
    return this.request('/v1/preferences', userPreferencesSchema, {
      method: 'PUT',
      body: JSON.stringify(preferences),
    });
  }

  async exportUserData(): Promise<Record<string, unknown>> {
    return this.request('/v1/me/export', z.record(z.unknown()));
  }

  async deleteUserData(): Promise<void> {
    await this.request('/v1/me', z.object({ deleted: z.boolean() }), { method: 'DELETE' });
  }
}
