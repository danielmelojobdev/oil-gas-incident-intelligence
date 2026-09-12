/**
 * In-memory database.
 *
 * Not a test double: it is a first-class adapter that makes the whole product runnable
 * with `APP_MODE=mock` and no infrastructure, and it is what the integration tests run
 * against. Data is lost on restart, which is the only difference that matters.
 */
import {
  applyIncidentFilters,
  buildDashboard,
  sortIncidents,
  toSummaryCard,
  EMPTY_CONSEQUENCES,
  buildMockDataset,
  userPreferencesSchema,
  type Article,
  type Dashboard,
  type IncidentDetail,
  type IncidentFilters,
  type IncidentPage,
  type NewsSource,
  type ScanRun,
  type UserIncidentState,
  type UserPreferences,
} from '@ogii/domain';
import { randomUUID } from 'node:crypto';
import { SOURCE_CATALOGUE } from '../news/feeds';
import { NotFoundError } from '../util/errors';
import type {
  ArticleInput,
  Database,
  DeviceInput,
  EntityInput,
  EvidenceInput,
  GroupingCandidateRow,
  HighlightInput,
  IncidentInput,
  IncidentPatch,
  MaterialUpdateInput,
  NotificationInput,
  ScanRunPatch,
} from './database';

interface StoredNotification extends NotificationInput {
  readonly id: string;
  readonly status: 'sent' | 'failed' | 'suppressed';
  readonly error: string | null;
  readonly createdAt: string;
}

export interface MemoryDatabaseOptions {
  /** Preload the fictional dataset (Mock Mode). */
  readonly seedMockData?: boolean;
  readonly now?: () => Date;
}

export class MemoryDatabase implements Database {
  readonly driver = 'memory' as const;

  private incidents = new Map<string, IncidentDetail>();
  private articles = new Map<string, Article>();
  private scanRuns = new Map<string, ScanRun>();
  private userStates = new Map<string, Map<string, UserIncidentState>>();
  private preferences = new Map<string, UserPreferences>();
  private devices = new Map<string, DeviceInput>();
  private notifications: StoredNotification[] = [];
  private materialUpdates = new Map<string, MaterialUpdateInput & { id: string }>();
  private exports: { userId: string | null; incidentId: string; format: string; createdAt: string }[] = [];
  private readonly now: () => Date;

  constructor(private readonly options: MemoryDatabaseOptions = {}) {
    this.now = options.now ?? (() => new Date());
  }

  async init(): Promise<void> {
    if (this.options.seedMockData === true && this.incidents.size === 0) {
      for (const incident of buildMockDataset(this.now())) {
        this.incidents.set(incident.id, incident);
        for (const article of incident.articles) this.articles.set(article.id, article);
      }
    }
  }

  async close(): Promise<void> {
    /* nothing to release */
  }

  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    return { healthy: true, message: `in-memory store (${this.incidents.size} incidents)` };
  }

  // --- Reads --------------------------------------------------------------

  private statesFor(userId: string | null): Map<string, UserIncidentState> {
    if (userId === null) return new Map();
    return this.userStates.get(userId) ?? new Map();
  }

  async listIncidents(filters: IncidentFilters, userId: string | null, now: Date): Promise<IncidentPage> {
    const states = this.statesFor(userId);
    const filtered = applyIncidentFilters([...this.incidents.values()], filters, now, states);
    const sorted = sortIncidents(filtered, filters.sort);
    const offset = filters.cursor === null ? 0 : Math.max(0, Number.parseInt(filters.cursor, 10) || 0);
    const page = sorted.slice(offset, offset + filters.limit);
    const nextOffset = offset + page.length;
    return {
      items: page.map(toSummaryCard),
      nextCursor: nextOffset < sorted.length ? String(nextOffset) : null,
      total: sorted.length,
    };
  }

  async getIncident(id: string, userId: string | null): Promise<IncidentDetail | null> {
    const incident = this.incidents.get(id);
    if (incident === undefined) return null;
    return { ...incident, userState: this.statesFor(userId).get(id) ?? 'new' };
  }

  async getDashboard(userId: string | null, now: Date): Promise<Dashboard> {
    const states = this.statesFor(userId);
    const visible = [...this.incidents.values()].filter((incident) => states.get(incident.id) !== 'archived');
    return buildDashboard(visible, now);
  }

  async listSources(): Promise<NewsSource[]> {
    return SOURCE_CATALOGUE.map((entry) => ({
      id: entry.slug,
      name: entry.name,
      homepage: entry.homepage,
      feedUrl: entry.feedUrl,
      provider: entry.feedUrl === null ? 'google-news-rss' : 'rss',
      kind: entry.isOfficial ? ('regulator' as const) : ('feed' as const),
      tier: entry.tier,
      country: entry.country,
      language: entry.language,
      isOfficial: entry.isOfficial,
      enabled: true,
      lastFetchedAt: null,
      lastStatus: null,
    }));
  }

  async findKnownArticles(keys: {
    normalizedUrls: readonly string[];
    canonicalUrls: readonly string[];
    titleHashes: readonly string[];
    contentHashes: readonly string[];
  }): Promise<Article[]> {
    const normalized = new Set(keys.normalizedUrls);
    const canonical = new Set(keys.canonicalUrls);
    const titles = new Set(keys.titleHashes);
    const contents = new Set(keys.contentHashes);
    return [...this.articles.values()].filter(
      (article) =>
        normalized.has(article.normalizedUrl) ||
        (article.canonicalUrl !== null && canonical.has(article.canonicalUrl)) ||
        titles.has(article.titleHash) ||
        contents.has(article.contentHash),
    );
  }

  async findGroupingCandidates(
    fromDate: string,
    toDate: string,
    countryCode: string | null,
  ): Promise<GroupingCandidateRow[]> {
    return [...this.incidents.values()]
      .filter((incident) => {
        if (incident.incidentDate === null) return true; // undated incidents remain candidates
        if (incident.incidentDate < fromDate || incident.incidentDate > toDate) return false;
        if (countryCode !== null && incident.countryCode !== null && incident.countryCode !== countryCode) return false;
        return true;
      })
      .map((incident) => ({
        id: incident.id,
        title: incident.title,
        incidentDate: incident.incidentDate,
        country: incident.country,
        operator: incident.operator,
        company: incident.company,
        asset: incident.asset,
        installation: incident.installation,
        field: incident.field,
        wellName: incident.wellName,
        incidentType: incident.incidentType,
      }));
  }

  // --- Writes -------------------------------------------------------------

  async insertArticle(input: ArticleInput): Promise<Article> {
    const existing = [...this.articles.values()].find((article) => article.normalizedUrl === input.normalizedUrl);
    if (existing !== undefined) return existing;

    const timestamp = this.now().toISOString();
    const article: Article = {
      id: randomUUID(),
      incidentId: null,
      sourceId: null,
      provider: input.provider,
      publisher: input.publisher,
      title: input.title,
      originalUrl: input.originalUrl,
      canonicalUrl: input.canonicalUrl,
      normalizedUrl: input.normalizedUrl,
      publishedAt: input.publishedAt,
      author: input.author,
      language: input.language,
      excerpt: input.excerpt,
      sourceTier: input.sourceTier,
      titleHash: input.titleHash,
      contentHash: input.contentHash,
      processedAt: timestamp,
      scanRunId: input.scanRunId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.articles.set(article.id, article);
    return article;
  }

  async createIncident(input: IncidentInput, scanRunId: string | null): Promise<IncidentDetail> {
    const timestamp = this.now().toISOString();
    const incident: IncidentDetail = {
      ...input,
      id: randomUUID(),
      detectedAt: input.detectedAt ?? timestamp,
      lastUpdatedAt: input.lastUpdatedAt ?? timestamp,
      consequences: { ...EMPTY_CONSEQUENCES, ...input.consequences },
      sourceCount: 0,
      highestSourceTier: 5,
      hasOfficialSource: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      highlights: [],
      articles: [],
      entities: [],
      evidence: [],
      userState: 'new',
    };
    void scanRunId;
    this.incidents.set(incident.id, incident);
    return incident;
  }

  async updateIncident(id: string, patch: IncidentPatch): Promise<IncidentDetail> {
    const existing = this.incidents.get(id);
    if (existing === undefined) throw new NotFoundError('Incident');
    const updated: IncidentDetail = {
      ...existing,
      ...patch,
      consequences: patch.consequences === undefined ? existing.consequences : patch.consequences,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: this.now().toISOString(),
    };
    this.incidents.set(id, updated);
    return updated;
  }

  async attachArticle(
    incidentId: string,
    articleId: string,
    _meta: { isPrimary: boolean; matchScore: number | null; matchReason: string | null; matchedBy: 'rules' | 'ai' | 'manual' },
  ): Promise<void> {
    const incident = this.incidents.get(incidentId);
    const article = this.articles.get(articleId);
    if (incident === undefined || article === undefined) throw new NotFoundError('Incident or article');

    const linked: Article = { ...article, incidentId };
    this.articles.set(articleId, linked);

    const articles = incident.articles.some((item) => item.id === articleId)
      ? incident.articles.map((item) => (item.id === articleId ? linked : item))
      : [...incident.articles, linked];

    const tiers = articles.map((item) => item.sourceTier);
    const highestSourceTier = tiers.reduce<Article['sourceTier']>((best, tier) => (tier < best ? tier : best), 5);

    this.incidents.set(incidentId, {
      ...incident,
      articles,
      sourceCount: new Set(articles.map((item) => item.publisher)).size,
      highestSourceTier,
      hasOfficialSource: highestSourceTier === 1,
      lastUpdatedAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    });
  }

  async replaceHighlights(incidentId: string, highlights: readonly HighlightInput[]): Promise<void> {
    const incident = this.incidents.get(incidentId);
    if (incident === undefined) throw new NotFoundError('Incident');
    this.incidents.set(incidentId, {
      ...incident,
      highlights: highlights.map((highlight, index) => ({
        id: `${incidentId}-highlight-${index}`,
        text: highlight.text,
        position: highlight.position,
        sourceArticleId: highlight.sourceArticleId,
      })),
    });
  }

  async upsertEntities(incidentId: string, entities: readonly EntityInput[]): Promise<void> {
    const incident = this.incidents.get(incidentId);
    if (incident === undefined) throw new NotFoundError('Incident');
    const merged = new Map(incident.entities.map((entity) => [`${entity.entityType}:${entity.normalizedName}`, entity]));
    for (const entity of entities) {
      const key = `${entity.entityType}:${entity.normalizedName}`;
      merged.set(key, {
        id: `${incidentId}-entity-${merged.size}`,
        entityType: entity.entityType as never,
        name: entity.name,
        normalizedName: entity.normalizedName,
        sourceArticleId: entity.sourceArticleId,
      });
    }
    this.incidents.set(incidentId, { ...incident, entities: [...merged.values()] });
  }

  async upsertEvidence(incidentId: string, evidence: readonly EvidenceInput[]): Promise<void> {
    const incident = this.incidents.get(incidentId);
    if (incident === undefined) throw new NotFoundError('Incident');
    const merged = new Map(incident.evidence.map((item) => [`${item.field}:${item.sourceArticleId}`, item]));
    for (const item of evidence) {
      merged.set(`${item.field}:${item.sourceArticleId}`, { id: `${incidentId}-evidence-${merged.size}`, ...item });
    }
    this.incidents.set(incidentId, { ...incident, evidence: [...merged.values()] });
  }

  async recordMaterialUpdate(input: MaterialUpdateInput): Promise<string> {
    const key = `${input.incidentId}:${input.updateFingerprint}`;
    const existing = this.materialUpdates.get(key);
    if (existing !== undefined) return existing.id;
    const id = randomUUID();
    this.materialUpdates.set(key, { ...input, id });
    return id;
  }

  // --- Scan runs ----------------------------------------------------------

  async createScanRun(trigger: ScanRun['trigger'], config: unknown, isMock: boolean): Promise<ScanRun> {
    void config;
    const run: ScanRun = {
      id: randomUUID(),
      trigger,
      status: 'queued',
      startedAt: this.now().toISOString(),
      finishedAt: null,
      durationMs: null,
      providerCount: 0,
      queriesGenerated: 0,
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
      stage: 'Queued',
      progress: 0,
      isMock,
    };
    this.scanRuns.set(run.id, run);
    return run;
  }

  async updateScanRun(id: string, patch: ScanRunPatch): Promise<ScanRun> {
    const existing = this.scanRuns.get(id);
    if (existing === undefined) throw new NotFoundError('Scan run');
    const updated: ScanRun = {
      ...existing,
      ...patch,
      errors: patch.errors === undefined ? existing.errors : [...patch.errors],
      providerResults: patch.providerResults === undefined ? existing.providerResults : [...patch.providerResults],
    };
    this.scanRuns.set(id, updated);
    return updated;
  }

  async getScanRun(id: string): Promise<ScanRun | null> {
    return this.scanRuns.get(id) ?? null;
  }

  async getLatestScanRun(): Promise<ScanRun | null> {
    return (
      [...this.scanRuns.values()].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0] ?? null
    );
  }

  // --- Users --------------------------------------------------------------

  async setUserIncidentState(userId: string, incidentId: string, state: UserIncidentState): Promise<void> {
    const states = this.userStates.get(userId) ?? new Map<string, UserIncidentState>();
    states.set(incidentId, state);
    this.userStates.set(userId, states);
  }

  async getUserPreferences(userId: string): Promise<UserPreferences> {
    return this.preferences.get(userId) ?? userPreferencesSchema.parse({});
  }

  async saveUserPreferences(userId: string, preferences: UserPreferences): Promise<UserPreferences> {
    const parsed = userPreferencesSchema.parse(preferences);
    this.preferences.set(userId, parsed);
    return parsed;
  }

  async registerDevice(input: DeviceInput): Promise<void> {
    this.devices.set(input.expoPushToken, input);
  }

  async listActiveDevices(): Promise<{ userId: string | null; expoPushToken: string }[]> {
    return [...this.devices.values()].map((device) => ({
      userId: device.userId,
      expoPushToken: device.expoPushToken,
    }));
  }

  async hasNotification(userId: string | null, incidentId: string, updateFingerprint: string): Promise<boolean> {
    return this.notifications.some(
      (notification) =>
        notification.userId === userId &&
        notification.incidentId === incidentId &&
        notification.updateFingerprint === updateFingerprint,
    );
  }

  async recordNotification(
    input: NotificationInput,
    status: 'sent' | 'failed' | 'suppressed',
    error: string | null,
  ): Promise<void> {
    this.notifications.push({ ...input, id: randomUUID(), status, error, createdAt: this.now().toISOString() });
  }

  async recordExport(
    userId: string | null,
    incidentId: string,
    format: 'pdf' | 'json' | 'csv',
    _fileName: string | null,
  ): Promise<void> {
    this.exports.push({ userId, incidentId, format, createdAt: this.now().toISOString() });
  }

  async deleteUserData(userId: string): Promise<void> {
    this.userStates.delete(userId);
    this.preferences.delete(userId);
    this.notifications = this.notifications.filter((notification) => notification.userId !== userId);
    this.exports = this.exports.filter((entry) => entry.userId !== userId);
    for (const [token, device] of this.devices) if (device.userId === userId) this.devices.delete(token);
  }

  async exportUserData(userId: string): Promise<Record<string, unknown>> {
    return {
      preferences: this.preferences.get(userId) ?? null,
      incidentState: Object.fromEntries(this.userStates.get(userId) ?? new Map()),
      notifications: this.notifications.filter((notification) => notification.userId === userId),
      exports: this.exports.filter((entry) => entry.userId === userId),
      devices: [...this.devices.values()].filter((device) => device.userId === userId),
    };
  }

  /** Test/demo helper: total incidents currently stored. */
  get incidentCount(): number {
    return this.incidents.size;
  }
}
