/**
 * The persistence port.
 *
 * Two implementations: `MemoryDatabase` (Mock Mode, tests, zero-config demo) and
 * `PostgresDatabase` (Supabase / any Postgres). The scanner and the HTTP layer only
 * ever see this interface.
 */
import type {
  Article,
  Dashboard,
  Incident,
  IncidentDetail,
  IncidentEvidence,
  IncidentFilters,
  IncidentPage,
  NewsSource,
  ScanRun,
  UserIncidentState,
  UserPreferences,
} from '@ogii/domain';

export interface ArticleInput {
  readonly provider: string;
  readonly publisher: string;
  readonly title: string;
  readonly originalUrl: string;
  readonly canonicalUrl: string | null;
  readonly normalizedUrl: string;
  readonly publishedAt: string | null;
  readonly author: string | null;
  readonly language: Article['language'];
  readonly excerpt: string | null;
  readonly sourceTier: Article['sourceTier'];
  readonly titleHash: string;
  readonly contentHash: string;
  readonly scanRunId: string | null;
  readonly relevanceScore: number | null;
  readonly rejectedReason: string | null;
  readonly isMock: boolean;
}

/** Everything needed to create an incident, minus the generated fields. */
export type IncidentInput = Omit<
  Incident,
  'id' | 'createdAt' | 'updatedAt' | 'detectedAt' | 'lastUpdatedAt' | 'sourceCount' | 'highestSourceTier' | 'hasOfficialSource'
> & {
  readonly detectedAt?: string;
  readonly lastUpdatedAt?: string;
  readonly firstScanRunId?: string | null;
};

export type IncidentPatch = Partial<Omit<Incident, 'id' | 'createdAt'>>;

export interface HighlightInput {
  readonly text: string;
  readonly position: number;
  readonly sourceArticleId: string | null;
}

export interface EntityInput {
  readonly entityType: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly sourceArticleId: string | null;
}

export type EvidenceInput = Omit<IncidentEvidence, 'id'>;

export interface MaterialUpdateInput {
  readonly incidentId: string;
  readonly articleId: string | null;
  readonly scanRunId: string | null;
  readonly isMaterial: boolean;
  readonly changeTypes: readonly string[];
  readonly descriptions: readonly string[];
  readonly updateFingerprint: string;
  readonly reason: string;
  readonly decidedBy: 'rules' | 'rules+ai';
}

export interface DeviceInput {
  readonly userId: string | null;
  readonly expoPushToken: string;
  readonly platform: 'ios' | 'android' | 'web' | null;
  readonly appVersion: string | null;
}

export interface NotificationInput {
  readonly userId: string | null;
  readonly incidentId: string;
  readonly materialUpdateId: string | null;
  readonly kind: 'new_incident' | 'material_update' | 'digest';
  readonly title: string;
  readonly body: string;
  readonly updateFingerprint: string;
}

/** A lightweight projection used when searching for grouping candidates. */
export interface GroupingCandidateRow {
  readonly id: string;
  readonly title: string;
  readonly incidentDate: string | null;
  readonly country: string | null;
  readonly operator: string | null;
  readonly company: string | null;
  readonly asset: string | null;
  readonly installation: string | null;
  readonly field: string | null;
  readonly wellName: string | null;
  readonly incidentType: Incident['incidentType'];
}

export interface ScanRunPatch {
  readonly status?: ScanRun['status'];
  readonly stage?: string | null;
  readonly progress?: number;
  readonly finishedAt?: string | null;
  readonly durationMs?: number | null;
  readonly providerCount?: number;
  readonly queriesGenerated?: number;
  readonly resultsFound?: number;
  readonly resultsRejected?: number;
  readonly articlesProcessed?: number;
  readonly duplicatesFound?: number;
  readonly newIncidents?: number;
  readonly updatedIncidents?: number;
  readonly notificationsSent?: number;
  readonly aiCalls?: number;
  readonly errors?: readonly string[];
  readonly providerResults?: ScanRun['providerResults'];
}

export interface Database {
  readonly driver: 'memory' | 'postgres';
  init(): Promise<void>;
  close(): Promise<void>;
  healthCheck(): Promise<{ healthy: boolean; message: string }>;

  // --- Reads (app) --------------------------------------------------------
  listIncidents(filters: IncidentFilters, userId: string | null, now: Date): Promise<IncidentPage>;
  getIncident(id: string, userId: string | null): Promise<IncidentDetail | null>;
  getDashboard(userId: string | null, now: Date): Promise<Dashboard>;
  listSources(): Promise<NewsSource[]>;

  // --- Reads (pipeline) ---------------------------------------------------
  /** Looks up already-known articles by any of the dedup keys. */
  findKnownArticles(keys: {
    normalizedUrls: readonly string[];
    canonicalUrls: readonly string[];
    titleHashes: readonly string[];
    contentHashes: readonly string[];
  }): Promise<Article[]>;
  /** Incidents that could plausibly be the same event, cheaply pre-filtered. */
  findGroupingCandidates(fromDate: string, toDate: string, countryCode: string | null): Promise<GroupingCandidateRow[]>;

  // --- Writes (pipeline) --------------------------------------------------
  insertArticle(input: ArticleInput): Promise<Article>;
  createIncident(input: IncidentInput, scanRunId: string | null): Promise<IncidentDetail>;
  updateIncident(id: string, patch: IncidentPatch): Promise<IncidentDetail>;
  attachArticle(
    incidentId: string,
    articleId: string,
    meta: { isPrimary: boolean; matchScore: number | null; matchReason: string | null; matchedBy: 'rules' | 'ai' | 'manual' },
  ): Promise<void>;
  replaceHighlights(incidentId: string, highlights: readonly HighlightInput[]): Promise<void>;
  upsertEntities(incidentId: string, entities: readonly EntityInput[]): Promise<void>;
  upsertEvidence(incidentId: string, evidence: readonly EvidenceInput[]): Promise<void>;
  recordMaterialUpdate(input: MaterialUpdateInput): Promise<string>;

  // --- Scan runs ----------------------------------------------------------
  createScanRun(trigger: ScanRun['trigger'], config: unknown, isMock: boolean): Promise<ScanRun>;
  updateScanRun(id: string, patch: ScanRunPatch): Promise<ScanRun>;
  getScanRun(id: string): Promise<ScanRun | null>;
  getLatestScanRun(): Promise<ScanRun | null>;

  // --- Users / notifications ---------------------------------------------
  setUserIncidentState(userId: string, incidentId: string, state: UserIncidentState): Promise<void>;
  getUserPreferences(userId: string): Promise<UserPreferences>;
  saveUserPreferences(userId: string, preferences: UserPreferences): Promise<UserPreferences>;
  registerDevice(input: DeviceInput): Promise<void>;
  listActiveDevices(): Promise<{ userId: string | null; expoPushToken: string }[]>;
  hasNotification(userId: string | null, incidentId: string, updateFingerprint: string): Promise<boolean>;
  recordNotification(input: NotificationInput, status: 'sent' | 'failed' | 'suppressed', error: string | null): Promise<void>;
  recordExport(userId: string | null, incidentId: string, format: 'pdf' | 'json' | 'csv', fileName: string | null): Promise<void>;

  // --- GDPR ---------------------------------------------------------------
  deleteUserData(userId: string): Promise<void>;
  exportUserData(userId: string): Promise<Record<string, unknown>>;
}
