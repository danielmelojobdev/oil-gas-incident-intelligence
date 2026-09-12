/**
 * Postgres adapter (Supabase or any Postgres 15+).
 *
 * Uses `postgres` (postgres.js) with tagged-template parameterisation, so every value
 * is bound — there is no string concatenation of user input anywhere in this file.
 *
 * Reads that need rich filtering are executed as SQL; the dashboard reuses the shared
 * in-process aggregator over the last 30 days, which is both simpler and correct at
 * the volumes this product produces (thousands of rows, not millions).
 */
import postgres from 'postgres';
import {
  applyIncidentFilters,
  buildDashboard,
  sortIncidents,
  toSummaryCard,
  EMPTY_CONSEQUENCES,
  incidentDetailSchema,
  resolveExplicitWindow,
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
import type { Logger } from '../logger';
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

type Row = Record<string, unknown>;

function str(row: Row, key: string): string | null {
  const value = row[key];
  return typeof value === 'string' ? value : null;
}
function num(row: Row, key: string): number | null {
  const value = row[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return null;
}
function bool(row: Row, key: string): boolean | null {
  const value = row[key];
  return typeof value === 'boolean' ? value : null;
}
function iso(row: Row, key: string): string | null {
  const value = row[key];
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : null;
}
function isoDate(row: Row, key: string): string | null {
  const value = row[key];
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return typeof value === 'string' ? value.slice(0, 10) : null;
}
function strArray(row: Row, key: string): string[] {
  const value = row[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export interface PostgresDatabaseOptions {
  readonly connectionString: string;
  readonly logger: Logger;
  readonly max?: number;
}

export class PostgresDatabase implements Database {
  readonly driver = 'postgres' as const;
  private readonly sql: postgres.Sql;
  private readonly logger: Logger;

  constructor(options: PostgresDatabaseOptions) {
    this.logger = options.logger.child({ component: 'db', driver: 'postgres' });
    this.sql = postgres(options.connectionString, {
      max: options.max ?? 10,
      idle_timeout: 30,
      connect_timeout: 15,
      onnotice: () => undefined,
      transform: { undefined: null },
    });
  }

  async init(): Promise<void> {
    await this.sql`select 1`;
    this.logger.info('postgres connection established');
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }

  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    try {
      const [row] = await this.sql<Row[]>`select count(*)::int as count from public.incidents`;
      return { healthy: true, message: `postgres (${num(row ?? {}, 'count') ?? 0} incidents)` };
    } catch (error) {
      return { healthy: false, message: error instanceof Error ? error.message : 'unknown error' };
    }
  }

  // ------------------------------------------------------------------ reads

  private mapIncident(row: Row, articles: Article[], highlights: Row[], entities: Row[], evidence: Row[]): IncidentDetail {
    const tiers = articles.map((article) => article.sourceTier);
    const highestSourceTier = tiers.reduce<Article['sourceTier']>((best, tier) => (tier < best ? tier : best), 5);

    const candidate = {
      id: str(row, 'id') ?? '',
      title: str(row, 'title') ?? 'Untitled incident',
      summary: str(row, 'summary'),
      incidentDate: isoDate(row, 'incident_date'),
      incidentTime: str(row, 'incident_time')?.slice(0, 5) ?? null,
      incidentDateIsEstimated: bool(row, 'incident_date_is_estimated') ?? false,
      detectedAt: iso(row, 'detected_at') ?? new Date().toISOString(),
      lastUpdatedAt: iso(row, 'last_updated_at') ?? new Date().toISOString(),
      country: str(row, 'country'),
      countryCode: str(row, 'country_code'),
      region: str(row, 'region'),
      city: str(row, 'city'),
      basin: str(row, 'basin'),
      block: str(row, 'block'),
      field: str(row, 'field'),
      latitude: num(row, 'latitude'),
      longitude: num(row, 'longitude'),
      operator: str(row, 'operator'),
      company: str(row, 'company'),
      licenceHolder: str(row, 'licence_holder'),
      drillingContractor: str(row, 'drilling_contractor'),
      serviceCompany: str(row, 'service_company'),
      pipelineOperator: str(row, 'pipeline_operator'),
      asset: str(row, 'asset'),
      installation: str(row, 'installation'),
      installationType: str(row, 'installation_type'),
      vessel: str(row, 'vessel'),
      wellName: str(row, 'well_name'),
      wellNumber: str(row, 'well_number'),
      wellType: str(row, 'well_type'),
      wellStatus: str(row, 'well_status'),
      oilGasSector: str(row, 'oil_gas_sector') ?? 'unknown',
      environment: str(row, 'environment') ?? 'unknown',
      waterDepthCategory: str(row, 'water_depth_category'),
      lifecycleStage: str(row, 'lifecycle_stage') ?? 'unknown',
      incidentType: str(row, 'incident_type') ?? 'other',
      secondaryIncidentTypes: strArray(row, 'secondary_incident_types'),
      isWellIntegrityRelated: bool(row, 'is_well_integrity_related'),
      wellIntegrityCategory: str(row, 'well_integrity_category'),
      suspectedFailedComponent: str(row, 'suspected_failed_component'),
      barrierFunctionImpacted: str(row, 'barrier_function_impacted'),
      isProcessSafetyEvent: bool(row, 'is_process_safety_event'),
      processSafetyCategory: str(row, 'process_safety_category'),
      severity: str(row, 'severity') ?? 'low',
      severityScore: num(row, 'severity_score') ?? 0,
      confidence: str(row, 'confidence') ?? 'low',
      confidenceScore: num(row, 'confidence_score') ?? 0,
      relevanceScore: num(row, 'relevance_score') ?? 0,
      consequences: {
        fatalities: num(row, 'fatalities'),
        injuries: num(row, 'injuries'),
        missingPersons: num(row, 'missing_persons'),
        evacuatedPersons: num(row, 'evacuated_persons'),
        hydrocarbonRelease: bool(row, 'hydrocarbon_release'),
        environmentalImpact: str(row, 'environmental_impact'),
        productionImpact: str(row, 'production_impact'),
        productionInterruption: bool(row, 'production_interruption'),
        shutdown: bool(row, 'shutdown'),
        assetDamage: str(row, 'asset_damage'),
        fire: bool(row, 'fire'),
        explosion: bool(row, 'explosion'),
        spill: bool(row, 'spill'),
        leak: bool(row, 'leak'),
        wellControlEvent: bool(row, 'well_control_event'),
      },
      status: str(row, 'status') ?? 'new',
      sourceCount: num(row, 'source_count') ?? articles.length,
      highestSourceTier,
      hasOfficialSource: bool(row, 'has_official_source') ?? highestSourceTier === 1,
      isMock: bool(row, 'is_mock') ?? false,
      createdAt: iso(row, 'created_at') ?? new Date().toISOString(),
      updatedAt: iso(row, 'updated_at') ?? new Date().toISOString(),
      highlights: highlights.map((highlight) => ({
        id: str(highlight, 'id') ?? '',
        text: str(highlight, 'text') ?? '',
        position: num(highlight, 'position') ?? 0,
        sourceArticleId: str(highlight, 'source_article_id'),
      })),
      articles,
      entities: entities.map((entity) => ({
        id: str(entity, 'id') ?? '',
        entityType: str(entity, 'entity_type') ?? 'company',
        name: str(entity, 'name') ?? '',
        normalizedName: str(entity, 'normalized_name') ?? '',
        sourceArticleId: str(entity, 'source_article_id'),
      })),
      evidence: evidence.map((item) => ({
        id: str(item, 'id') ?? '',
        field: str(item, 'field') ?? '',
        value: str(item, 'value'),
        sourceArticleId: str(item, 'source_article_id'),
        quote: str(item, 'quote'),
        confidence: num(item, 'confidence'),
      })),
      userState: str(row, 'user_state') ?? 'new',
    };

    // Parse rather than cast: a schema drift becomes a loud error, not silent corruption.
    return incidentDetailSchema.parse(candidate);
  }

  private mapArticle(row: Row): Article {
    return {
      id: str(row, 'id') ?? '',
      incidentId: str(row, 'incident_id'),
      sourceId: str(row, 'source_id'),
      provider: str(row, 'provider') ?? 'unknown',
      publisher: str(row, 'publisher') ?? 'Unknown publisher',
      title: str(row, 'title') ?? '',
      originalUrl: str(row, 'original_url') ?? '',
      canonicalUrl: str(row, 'canonical_url'),
      normalizedUrl: str(row, 'normalized_url') ?? '',
      publishedAt: iso(row, 'published_at'),
      author: str(row, 'author'),
      language: str(row, 'language') as Article['language'],
      excerpt: str(row, 'excerpt'),
      sourceTier: (num(row, 'source_tier') ?? 5) as Article['sourceTier'],
      titleHash: str(row, 'title_hash') ?? '',
      contentHash: str(row, 'content_hash') ?? '',
      processedAt: iso(row, 'processed_at'),
      scanRunId: str(row, 'scan_run_id'),
      createdAt: iso(row, 'created_at') ?? new Date().toISOString(),
      updatedAt: iso(row, 'updated_at') ?? new Date().toISOString(),
    };
  }

  /** Loads full incident aggregates for a set of ids, in one round trip per child table. */
  private async loadIncidents(ids: readonly string[], userId: string | null): Promise<IncidentDetail[]> {
    if (ids.length === 0) return [];
    const [incidents, articles, highlights, entities, evidence, states] = await Promise.all([
      this.sql<Row[]>`select * from public.incidents where id = any(${this.sql.array(ids as string[])}::uuid[])`,
      this.sql<Row[]>`
        select a.*, ia.incident_id as link_incident_id
        from public.articles a
        join public.incident_articles ia on ia.article_id = a.id
        where ia.incident_id = any(${this.sql.array(ids as string[])}::uuid[])
        order by a.source_tier asc, a.published_at desc nulls last`,
      this.sql<Row[]>`select * from public.incident_highlights where incident_id = any(${this.sql.array(ids as string[])}::uuid[]) order by position asc`,
      this.sql<Row[]>`select * from public.incident_entities where incident_id = any(${this.sql.array(ids as string[])}::uuid[])`,
      this.sql<Row[]>`select * from public.incident_evidence where incident_id = any(${this.sql.array(ids as string[])}::uuid[])`,
      userId === null
        ? Promise.resolve([] as Row[])
        : this.sql<Row[]>`select incident_id, state from public.user_incident_state where user_id = ${userId} and incident_id = any(${this.sql.array(ids as string[])}::uuid[])`,
    ]);

    const stateByIncident = new Map(states.map((row) => [str(row, 'incident_id') ?? '', str(row, 'state') ?? 'new']));
    const group = <T>(rows: Row[], mapRow: (row: Row) => T, key = 'incident_id'): Map<string, T[]> => {
      const map = new Map<string, T[]>();
      for (const row of rows) {
        const id = str(row, key) ?? '';
        const list = map.get(id) ?? [];
        list.push(mapRow(row));
        map.set(id, list);
      }
      return map;
    };

    const articlesByIncident = group(articles, (row) => this.mapArticle(row), 'link_incident_id');
    const highlightsByIncident = group(highlights, (row) => row);
    const entitiesByIncident = group(entities, (row) => row);
    const evidenceByIncident = group(evidence, (row) => row);

    return incidents.map((row) => {
      const id = str(row, 'id') ?? '';
      return this.mapIncident(
        { ...row, user_state: stateByIncident.get(id) ?? 'new' },
        articlesByIncident.get(id) ?? [],
        highlightsByIncident.get(id) ?? [],
        entitiesByIncident.get(id) ?? [],
        evidenceByIncident.get(id) ?? [],
      );
    });
  }

  async listIncidents(filters: IncidentFilters, userId: string | null, now: Date): Promise<IncidentPage> {
    const window = resolveExplicitWindow(filters.from, filters.to, filters.period, now, filters.dateAxis);
    const sql = this.sql;

    // Coarse SQL pre-filter on the indexed columns; the rich predicates (feed chips,
    // per-user state) are applied by the shared helper so both adapters agree.
    const rows = await sql<Row[]>`
      select i.id
      from public.incidents i
      where (${window.fromDate}::date is null or coalesce(i.incident_date, i.detected_at::date) >= ${window.fromDate}::date)
        and coalesce(i.incident_date, i.detected_at::date) <= ${window.toDate}::date
        and i.relevance_score >= ${filters.minRelevance}
        and (${filters.severities.length === 0} or i.severity = any(${sql.array(filters.severities as string[])}::text[]))
        and (${filters.sectors.length === 0} or i.oil_gas_sector = any(${sql.array(filters.sectors as string[])}::text[]))
        and (${filters.environments.length === 0} or i.environment = any(${sql.array(filters.environments as string[])}::text[]))
        and (${filters.incidentTypes.length === 0} or i.incident_type = any(${sql.array(filters.incidentTypes as string[])}::text[]))
        and (${filters.countries.length === 0} or lower(i.country) = any(${sql.array(filters.countries.map((c) => c.toLowerCase()))}::text[]))
        and (${!filters.wellIntegrityOnly} or i.is_well_integrity_related is true)
        and (${!filters.processSafetyOnly} or i.is_process_safety_event is true)
        and (${filters.query === null || filters.query.trim() === ''}
             or i.search_vector @@ plainto_tsquery('simple', ${filters.query ?? ''})
             or i.title ilike ${'%' + (filters.query ?? '') + '%'})
      order by coalesce(i.incident_date, i.detected_at::date) desc, i.detected_at desc
      limit 500`;

    const ids = rows.map((row) => str(row, 'id') ?? '').filter((id) => id !== '');
    const incidents = await this.loadIncidents(ids, userId);

    const userStates = new Map(incidents.map((incident) => [incident.id, incident.userState]));
    const filtered = applyIncidentFilters(incidents, filters, now, userStates);
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
    const [incident] = await this.loadIncidents([id], userId);
    return incident ?? null;
  }

  async getDashboard(userId: string | null, now: Date): Promise<Dashboard> {
    const sql = this.sql;
    const from = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
    const rows = await sql<Row[]>`
      select id from public.incidents
      where coalesce(incident_date, detected_at::date) >= ${from}::date`;
    const ids = rows.map((row) => str(row, 'id') ?? '').filter((id) => id !== '');
    const incidents = (await this.loadIncidents(ids, userId)).filter(
      (incident) => incident.userState !== 'archived',
    );
    return buildDashboard(incidents, now);
  }

  async listSources(): Promise<NewsSource[]> {
    const rows = await this.sql<Row[]>`select * from public.news_sources where enabled order by tier asc, name asc`;
    return rows.map((row) => ({
      id: str(row, 'slug') ?? str(row, 'id') ?? '',
      name: str(row, 'name') ?? '',
      homepage: str(row, 'homepage'),
      feedUrl: str(row, 'feed_url'),
      provider: str(row, 'provider_id') ?? 'rss',
      kind: (str(row, 'kind') ?? 'feed') as NewsSource['kind'],
      tier: (num(row, 'tier') ?? 5) as NewsSource['tier'],
      country: str(row, 'country'),
      language: str(row, 'language') as NewsSource['language'],
      isOfficial: bool(row, 'is_official') ?? false,
      enabled: bool(row, 'enabled') ?? true,
      lastFetchedAt: iso(row, 'last_fetched_at'),
      lastStatus: str(row, 'last_status'),
    }));
  }

  async findKnownArticles(keys: {
    normalizedUrls: readonly string[];
    canonicalUrls: readonly string[];
    titleHashes: readonly string[];
    contentHashes: readonly string[];
  }): Promise<Article[]> {
    const sql = this.sql;
    const rows = await sql<Row[]>`
      select * from public.articles
      where normalized_url = any(${sql.array(keys.normalizedUrls as string[])}::text[])
         or canonical_url  = any(${sql.array(keys.canonicalUrls as string[])}::text[])
         or title_hash     = any(${sql.array(keys.titleHashes as string[])}::text[])
         or content_hash   = any(${sql.array(keys.contentHashes as string[])}::text[])
      limit 2000`;
    return rows.map((row) => this.mapArticle(row));
  }

  async findGroupingCandidates(
    fromDate: string,
    toDate: string,
    countryCode: string | null,
  ): Promise<GroupingCandidateRow[]> {
    const rows = await this.sql<Row[]>`
      select id, title, incident_date, country, operator, company, asset, installation, field, well_name, incident_type
      from public.incidents
      where (incident_date is null or (incident_date >= ${fromDate}::date and incident_date <= ${toDate}::date))
        and (${countryCode}::char(2) is null or country_code is null or country_code = ${countryCode})
      order by incident_date desc nulls last
      limit 400`;
    return rows.map((row) => ({
      id: str(row, 'id') ?? '',
      title: str(row, 'title') ?? '',
      incidentDate: isoDate(row, 'incident_date'),
      country: str(row, 'country'),
      operator: str(row, 'operator'),
      company: str(row, 'company'),
      asset: str(row, 'asset'),
      installation: str(row, 'installation'),
      field: str(row, 'field'),
      wellName: str(row, 'well_name'),
      incidentType: (str(row, 'incident_type') ?? 'other') as GroupingCandidateRow['incidentType'],
    }));
  }

  // ----------------------------------------------------------------- writes

  async insertArticle(input: ArticleInput): Promise<Article> {
    const [row] = await this.sql<Row[]>`
      insert into public.articles (
        provider, publisher, title, original_url, canonical_url, normalized_url, published_at,
        author, language, excerpt, source_tier, title_hash, content_hash, scan_run_id,
        relevance_score, rejected_reason, processed_at, is_mock
      ) values (
        ${input.provider}, ${input.publisher}, ${input.title}, ${input.originalUrl}, ${input.canonicalUrl},
        ${input.normalizedUrl}, ${input.publishedAt}, ${input.author}, ${input.language}, ${input.excerpt},
        ${input.sourceTier}, ${input.titleHash}, ${input.contentHash}, ${input.scanRunId},
        ${input.relevanceScore}, ${input.rejectedReason}, now(), ${input.isMock}
      )
      on conflict (normalized_url) do update set
        updated_at = now(),
        relevance_score = coalesce(excluded.relevance_score, public.articles.relevance_score)
      returning *`;
    if (row === undefined) throw new Error('insertArticle returned no row');
    return this.mapArticle(row);
  }

  async createIncident(input: IncidentInput, scanRunId: string | null): Promise<IncidentDetail> {
    const c = { ...EMPTY_CONSEQUENCES, ...input.consequences };
    const [row] = await this.sql<Row[]>`
      insert into public.incidents (
        title, summary, incident_date, incident_time, incident_date_is_estimated,
        detected_at, last_updated_at,
        country, country_code, region, city, basin, block, field, latitude, longitude,
        operator, operator_normalized, company, licence_holder, drilling_contractor, service_company, pipeline_operator,
        asset, asset_normalized, installation, installation_type, vessel,
        well_name, well_number, well_type, well_status,
        oil_gas_sector, environment, water_depth_category, lifecycle_stage, incident_type, secondary_incident_types,
        is_well_integrity_related, well_integrity_category, suspected_failed_component, barrier_function_impacted,
        is_process_safety_event, process_safety_category,
        severity, severity_score, confidence, confidence_score, relevance_score,
        fatalities, injuries, missing_persons, evacuated_persons, hydrocarbon_release,
        environmental_impact, production_impact, production_interruption, shutdown, asset_damage,
        fire, explosion, spill, leak, well_control_event,
        status, is_mock, first_scan_run_id
      ) values (
        ${input.title}, ${input.summary}, ${input.incidentDate}, ${input.incidentTime}, ${input.incidentDateIsEstimated},
        coalesce(${input.detectedAt ?? null}::timestamptz, now()),
        coalesce(${input.lastUpdatedAt ?? null}::timestamptz, now()),
        ${input.country}, ${input.countryCode}, ${input.region}, ${input.city}, ${input.basin}, ${input.block},
        ${input.field}, ${input.latitude}, ${input.longitude},
        ${input.operator}, ${input.operator === null ? null : input.operator.toLowerCase()}, ${input.company},
        ${input.licenceHolder}, ${input.drillingContractor}, ${input.serviceCompany}, ${input.pipelineOperator},
        ${input.asset}, ${input.asset === null ? null : input.asset.toLowerCase()}, ${input.installation},
        ${input.installationType}, ${input.vessel},
        ${input.wellName}, ${input.wellNumber}, ${input.wellType}, ${input.wellStatus},
        ${input.oilGasSector}, ${input.environment}, ${input.waterDepthCategory}, ${input.lifecycleStage},
        ${input.incidentType}, ${this.sql.array([...input.secondaryIncidentTypes])}::text[],
        ${input.isWellIntegrityRelated}, ${input.wellIntegrityCategory}, ${input.suspectedFailedComponent},
        ${input.barrierFunctionImpacted}, ${input.isProcessSafetyEvent}, ${input.processSafetyCategory},
        ${input.severity}, ${input.severityScore}, ${input.confidence}, ${input.confidenceScore}, ${input.relevanceScore},
        ${c.fatalities}, ${c.injuries}, ${c.missingPersons}, ${c.evacuatedPersons}, ${c.hydrocarbonRelease},
        ${c.environmentalImpact}, ${c.productionImpact}, ${c.productionInterruption}, ${c.shutdown}, ${c.assetDamage},
        ${c.fire}, ${c.explosion}, ${c.spill}, ${c.leak}, ${c.wellControlEvent},
        ${input.status}, ${input.isMock}, ${scanRunId}
      )
      returning id`;
    const id = str(row ?? {}, 'id');
    if (id === null) throw new Error('createIncident returned no id');
    const incident = await this.getIncident(id, null);
    if (incident === null) throw new NotFoundError('Incident');
    return incident;
  }

  async updateIncident(id: string, patch: IncidentPatch): Promise<IncidentDetail> {
    const c = patch.consequences;
    await this.sql`
      update public.incidents set
        title = coalesce(${patch.title ?? null}, title),
        summary = coalesce(${patch.summary ?? null}, summary),
        incident_date = coalesce(${patch.incidentDate ?? null}::date, incident_date),
        incident_time = coalesce(${patch.incidentTime ?? null}::time, incident_time),
        country = coalesce(${patch.country ?? null}, country),
        country_code = coalesce(${patch.countryCode ?? null}, country_code),
        region = coalesce(${patch.region ?? null}, region),
        city = coalesce(${patch.city ?? null}, city),
        basin = coalesce(${patch.basin ?? null}, basin),
        block = coalesce(${patch.block ?? null}, block),
        field = coalesce(${patch.field ?? null}, field),
        latitude = coalesce(${patch.latitude ?? null}, latitude),
        longitude = coalesce(${patch.longitude ?? null}, longitude),
        operator = coalesce(${patch.operator ?? null}, operator),
        operator_normalized = coalesce(${patch.operator === undefined || patch.operator === null ? null : patch.operator.toLowerCase()}, operator_normalized),
        company = coalesce(${patch.company ?? null}, company),
        drilling_contractor = coalesce(${patch.drillingContractor ?? null}, drilling_contractor),
        service_company = coalesce(${patch.serviceCompany ?? null}, service_company),
        pipeline_operator = coalesce(${patch.pipelineOperator ?? null}, pipeline_operator),
        asset = coalesce(${patch.asset ?? null}, asset),
        installation = coalesce(${patch.installation ?? null}, installation),
        installation_type = coalesce(${patch.installationType ?? null}, installation_type),
        vessel = coalesce(${patch.vessel ?? null}, vessel),
        well_name = coalesce(${patch.wellName ?? null}, well_name),
        well_number = coalesce(${patch.wellNumber ?? null}, well_number),
        well_type = coalesce(${patch.wellType ?? null}, well_type),
        well_status = coalesce(${patch.wellStatus ?? null}, well_status),
        oil_gas_sector = coalesce(${patch.oilGasSector ?? null}, oil_gas_sector),
        environment = coalesce(${patch.environment ?? null}, environment),
        lifecycle_stage = coalesce(${patch.lifecycleStage ?? null}, lifecycle_stage),
        incident_type = coalesce(${patch.incidentType ?? null}, incident_type),
        is_well_integrity_related = coalesce(${patch.isWellIntegrityRelated ?? null}, is_well_integrity_related),
        well_integrity_category = coalesce(${patch.wellIntegrityCategory ?? null}, well_integrity_category),
        suspected_failed_component = coalesce(${patch.suspectedFailedComponent ?? null}, suspected_failed_component),
        barrier_function_impacted = coalesce(${patch.barrierFunctionImpacted ?? null}, barrier_function_impacted),
        is_process_safety_event = coalesce(${patch.isProcessSafetyEvent ?? null}, is_process_safety_event),
        process_safety_category = coalesce(${patch.processSafetyCategory ?? null}, process_safety_category),
        severity = coalesce(${patch.severity ?? null}, severity),
        severity_score = coalesce(${patch.severityScore ?? null}, severity_score),
        confidence = coalesce(${patch.confidence ?? null}, confidence),
        confidence_score = coalesce(${patch.confidenceScore ?? null}, confidence_score),
        relevance_score = coalesce(${patch.relevanceScore ?? null}, relevance_score),
        fatalities = coalesce(${c?.fatalities ?? null}, fatalities),
        injuries = coalesce(${c?.injuries ?? null}, injuries),
        missing_persons = coalesce(${c?.missingPersons ?? null}, missing_persons),
        evacuated_persons = coalesce(${c?.evacuatedPersons ?? null}, evacuated_persons),
        hydrocarbon_release = coalesce(${c?.hydrocarbonRelease ?? null}, hydrocarbon_release),
        environmental_impact = coalesce(${c?.environmentalImpact ?? null}, environmental_impact),
        production_impact = coalesce(${c?.productionImpact ?? null}, production_impact),
        production_interruption = coalesce(${c?.productionInterruption ?? null}, production_interruption),
        shutdown = coalesce(${c?.shutdown ?? null}, shutdown),
        asset_damage = coalesce(${c?.assetDamage ?? null}, asset_damage),
        fire = coalesce(${c?.fire ?? null}, fire),
        explosion = coalesce(${c?.explosion ?? null}, explosion),
        spill = coalesce(${c?.spill ?? null}, spill),
        leak = coalesce(${c?.leak ?? null}, leak),
        well_control_event = coalesce(${c?.wellControlEvent ?? null}, well_control_event),
        status = coalesce(${patch.status ?? null}, status),
        last_updated_at = coalesce(${patch.lastUpdatedAt ?? null}::timestamptz, now())
      where id = ${id}`;
    const incident = await this.getIncident(id, null);
    if (incident === null) throw new NotFoundError('Incident');
    return incident;
  }

  async attachArticle(
    incidentId: string,
    articleId: string,
    meta: { isPrimary: boolean; matchScore: number | null; matchReason: string | null; matchedBy: 'rules' | 'ai' | 'manual' },
  ): Promise<void> {
    await this.sql.begin(async (tx) => {
      await tx`
        insert into public.incident_articles (incident_id, article_id, is_primary, match_score, match_reason, matched_by)
        values (${incidentId}, ${articleId}, ${meta.isPrimary}, ${meta.matchScore}, ${meta.matchReason}, ${meta.matchedBy})
        on conflict (incident_id, article_id) do update set
          match_score = excluded.match_score, match_reason = excluded.match_reason, updated_at = now()`;
      await tx`update public.articles set incident_id = ${incidentId}, updated_at = now() where id = ${articleId}`;
      // Recompute the denormalised counters from the link table, never by increment.
      await tx`
        update public.incidents i set
          source_count = sub.publisher_count,
          highest_source_tier = sub.best_tier,
          has_official_source = (sub.best_tier = 1),
          last_updated_at = now()
        from (
          select count(distinct a.publisher)::int as publisher_count, coalesce(min(a.source_tier), 5)::smallint as best_tier
          from public.incident_articles ia join public.articles a on a.id = ia.article_id
          where ia.incident_id = ${incidentId}
        ) sub
        where i.id = ${incidentId}`;
    });
  }

  async replaceHighlights(incidentId: string, highlights: readonly HighlightInput[]): Promise<void> {
    await this.sql.begin(async (tx) => {
      await tx`delete from public.incident_highlights where incident_id = ${incidentId}`;
      for (const highlight of highlights) {
        await tx`
          insert into public.incident_highlights (incident_id, text, position, source_article_id)
          values (${incidentId}, ${highlight.text}, ${highlight.position}, ${highlight.sourceArticleId})`;
      }
    });
  }

  async upsertEntities(incidentId: string, entities: readonly EntityInput[]): Promise<void> {
    for (const entity of entities) {
      await this.sql`
        insert into public.incident_entities (incident_id, entity_type, name, normalized_name, source_article_id)
        values (${incidentId}, ${entity.entityType}, ${entity.name}, ${entity.normalizedName}, ${entity.sourceArticleId})
        on conflict (incident_id, entity_type, normalized_name) do update set name = excluded.name, updated_at = now()`;
    }
  }

  async upsertEvidence(incidentId: string, evidence: readonly EvidenceInput[]): Promise<void> {
    for (const item of evidence) {
      await this.sql`
        insert into public.incident_evidence (incident_id, field, value, source_article_id, quote, confidence)
        values (${incidentId}, ${item.field}, ${item.value}, ${item.sourceArticleId}, ${item.quote}, ${item.confidence})
        on conflict (incident_id, field, source_article_id) do update set
          value = excluded.value, quote = excluded.quote, confidence = excluded.confidence, updated_at = now()`;
    }
  }

  async recordMaterialUpdate(input: MaterialUpdateInput): Promise<string> {
    const [row] = await this.sql<Row[]>`
      insert into public.material_updates
        (incident_id, article_id, scan_run_id, is_material, change_types, descriptions, update_fingerprint, reason, decided_by)
      values (${input.incidentId}, ${input.articleId}, ${input.scanRunId}, ${input.isMaterial},
              ${this.sql.array([...input.changeTypes])}::text[], ${this.sql.array([...input.descriptions])}::text[],
              ${input.updateFingerprint}, ${input.reason}, ${input.decidedBy})
      on conflict (incident_id, update_fingerprint) do update set updated_at = now()
      returning id`;
    return str(row ?? {}, 'id') ?? '';
  }

  // -------------------------------------------------------------- scan runs

  private mapScanRun(row: Row, providerResults: Row[] = []): ScanRun {
    return {
      id: str(row, 'id') ?? '',
      trigger: (str(row, 'trigger') ?? 'scheduled') as ScanRun['trigger'],
      status: (str(row, 'status') ?? 'queued') as ScanRun['status'],
      startedAt: iso(row, 'started_at') ?? new Date().toISOString(),
      finishedAt: iso(row, 'finished_at'),
      durationMs: num(row, 'duration_ms'),
      providerCount: num(row, 'provider_count') ?? 0,
      queriesGenerated: num(row, 'queries_generated') ?? 0,
      resultsFound: num(row, 'results_found') ?? 0,
      resultsRejected: num(row, 'results_rejected') ?? 0,
      articlesProcessed: num(row, 'articles_processed') ?? 0,
      duplicatesFound: num(row, 'duplicates_found') ?? 0,
      newIncidents: num(row, 'new_incidents') ?? 0,
      updatedIncidents: num(row, 'updated_incidents') ?? 0,
      notificationsSent: num(row, 'notifications_sent') ?? 0,
      aiCalls: num(row, 'ai_calls') ?? 0,
      errors: strArray(row, 'errors'),
      providerResults: providerResults.map((result) => ({
        provider: str(result, 'provider_id') ?? '',
        queriesExecuted: num(result, 'queries_executed') ?? 0,
        resultsFound: num(result, 'results_found') ?? 0,
        durationMs: num(result, 'duration_ms') ?? 0,
        errorCount: num(result, 'error_count') ?? 0,
        retryCount: num(result, 'retry_count') ?? 0,
        healthy: bool(result, 'healthy') ?? true,
        errorMessage: str(result, 'error_message'),
      })),
      stage: str(row, 'stage'),
      progress: num(row, 'progress') ?? 0,
      isMock: bool(row, 'is_mock') ?? false,
    };
  }

  async createScanRun(trigger: ScanRun['trigger'], config: unknown, isMock: boolean): Promise<ScanRun> {
    const [row] = await this.sql<Row[]>`
      insert into public.scan_runs (trigger, status, config, is_mock, stage)
      values (${trigger}, 'queued', ${this.sql.json(config as never)}, ${isMock}, 'Queued')
      returning *`;
    if (row === undefined) throw new Error('createScanRun returned no row');
    return this.mapScanRun(row);
  }

  async updateScanRun(id: string, patch: ScanRunPatch): Promise<ScanRun> {
    await this.sql`
      update public.scan_runs set
        status = coalesce(${patch.status ?? null}, status),
        stage = coalesce(${patch.stage ?? null}, stage),
        progress = coalesce(${patch.progress ?? null}, progress),
        finished_at = coalesce(${patch.finishedAt ?? null}::timestamptz, finished_at),
        duration_ms = coalesce(${patch.durationMs ?? null}, duration_ms),
        provider_count = coalesce(${patch.providerCount ?? null}, provider_count),
        queries_generated = coalesce(${patch.queriesGenerated ?? null}, queries_generated),
        results_found = coalesce(${patch.resultsFound ?? null}, results_found),
        results_rejected = coalesce(${patch.resultsRejected ?? null}, results_rejected),
        articles_processed = coalesce(${patch.articlesProcessed ?? null}, articles_processed),
        duplicates_found = coalesce(${patch.duplicatesFound ?? null}, duplicates_found),
        new_incidents = coalesce(${patch.newIncidents ?? null}, new_incidents),
        updated_incidents = coalesce(${patch.updatedIncidents ?? null}, updated_incidents),
        notifications_sent = coalesce(${patch.notificationsSent ?? null}, notifications_sent),
        ai_calls = coalesce(${patch.aiCalls ?? null}, ai_calls),
        errors = coalesce(${patch.errors === undefined ? null : this.sql.array([...patch.errors])}::text[], errors)
      where id = ${id}`;

    for (const result of patch.providerResults ?? []) {
      await this.sql`
        insert into public.scan_run_provider_results
          (scan_run_id, provider_id, queries_executed, results_found, duration_ms, error_count, retry_count, healthy, error_message)
        values (${id}, ${result.provider}, ${result.queriesExecuted}, ${result.resultsFound}, ${result.durationMs},
                ${result.errorCount}, ${result.retryCount}, ${result.healthy}, ${result.errorMessage})
        on conflict (scan_run_id, provider_id) do update set
          queries_executed = excluded.queries_executed, results_found = excluded.results_found,
          duration_ms = excluded.duration_ms, error_count = excluded.error_count,
          retry_count = excluded.retry_count, healthy = excluded.healthy,
          error_message = excluded.error_message, updated_at = now()`;
    }

    const run = await this.getScanRun(id);
    if (run === null) throw new NotFoundError('Scan run');
    return run;
  }

  async getScanRun(id: string): Promise<ScanRun | null> {
    const [row] = await this.sql<Row[]>`select * from public.scan_runs where id = ${id}`;
    if (row === undefined) return null;
    const results = await this.sql<Row[]>`select * from public.scan_run_provider_results where scan_run_id = ${id}`;
    return this.mapScanRun(row, results);
  }

  async getLatestScanRun(): Promise<ScanRun | null> {
    const [row] = await this.sql<Row[]>`select * from public.scan_runs order by started_at desc limit 1`;
    if (row === undefined) return null;
    const id = str(row, 'id') ?? '';
    const results = await this.sql<Row[]>`select * from public.scan_run_provider_results where scan_run_id = ${id}`;
    return this.mapScanRun(row, results);
  }

  // ------------------------------------------------------------------ users

  /**
   * Creates the user row on demand.
   *
   * Every user-owned table has a foreign key to `users`, and the app is designed to
   * work before anyone signs in. An anonymous device is a real user as far as this
   * schema is concerned, so its row is provisioned the first time it writes anything.
   */
  private async ensureUser(userId: string): Promise<void> {
    await this.sql`insert into public.users (id) values (${userId}) on conflict (id) do nothing`;
  }

  async setUserIncidentState(userId: string, incidentId: string, state: UserIncidentState): Promise<void> {
    await this.ensureUser(userId);
    await this.sql`
      insert into public.user_incident_state (user_id, incident_id, state, read_at)
      values (${userId}, ${incidentId}, ${state}, case when ${state} = 'read' then now() else null end)
      on conflict (user_id, incident_id) do update set state = excluded.state, updated_at = now()`;
    if (state === 'saved') {
      await this.sql`
        insert into public.saved_incidents (user_id, incident_id) values (${userId}, ${incidentId})
        on conflict do nothing`;
    } else {
      await this.sql`delete from public.saved_incidents where user_id = ${userId} and incident_id = ${incidentId}`;
    }
  }

  async getUserPreferences(userId: string): Promise<UserPreferences> {
    const [row] = await this.sql<Row[]>`select * from public.user_preferences where user_id = ${userId}`;
    if (row === undefined) return userPreferencesSchema.parse({});
    return userPreferencesSchema.parse({
      theme: str(row, 'theme') ?? 'system',
      defaultPeriod: str(row, 'default_period') ?? 'last_30_days',
      defaultDateAxis: str(row, 'default_date_axis') ?? 'incident_date',
      regions: strArray(row, 'regions'),
      customCountries: strArray(row, 'custom_countries'),
      languages: strArray(row, 'languages'),
      dataRetentionDays: num(row, 'data_retention_days') ?? 730,
      notifications: {
        enabled: bool(row, 'notifications_enabled') ?? true,
        sound: bool(row, 'notifications_sound') ?? true,
        criticalOnly: bool(row, 'critical_only') ?? false,
        minSeverity: str(row, 'min_severity') ?? 'moderate',
        severities: strArray(row, 'notify_severities'),
        incidentTypes: strArray(row, 'notify_incident_types'),
        countries: strArray(row, 'notify_countries'),
        wellIntegrityAlerts: bool(row, 'well_integrity_alerts') ?? true,
        wellControlAlerts: bool(row, 'well_control_alerts') ?? true,
        quietHoursStart: str(row, 'quiet_hours_start')?.slice(0, 5) ?? null,
        quietHoursEnd: str(row, 'quiet_hours_end')?.slice(0, 5) ?? null,
      },
    });
  }

  async saveUserPreferences(userId: string, preferences: UserPreferences): Promise<UserPreferences> {
    const parsed = userPreferencesSchema.parse(preferences);
    const n = parsed.notifications;
    await this.ensureUser(userId);
    await this.sql`
      insert into public.user_preferences (
        user_id, theme, default_period, default_date_axis, regions, custom_countries, languages,
        notifications_enabled, notifications_sound, critical_only, min_severity,
        notify_severities, notify_incident_types, notify_countries,
        well_integrity_alerts, well_control_alerts, quiet_hours_start, quiet_hours_end, data_retention_days
      ) values (
        ${userId}, ${parsed.theme}, ${parsed.defaultPeriod}, ${parsed.defaultDateAxis},
        ${this.sql.array([...parsed.regions])}::text[], ${this.sql.array([...parsed.customCountries])}::text[],
        ${this.sql.array([...parsed.languages])}::text[],
        ${n.enabled}, ${n.sound}, ${n.criticalOnly}, ${n.minSeverity},
        ${this.sql.array([...n.severities])}::text[], ${this.sql.array([...n.incidentTypes])}::text[],
        ${this.sql.array([...n.countries])}::text[],
        ${n.wellIntegrityAlerts}, ${n.wellControlAlerts}, ${n.quietHoursStart}::time, ${n.quietHoursEnd}::time,
        ${parsed.dataRetentionDays}
      )
      on conflict (user_id) do update set
        theme = excluded.theme, default_period = excluded.default_period,
        default_date_axis = excluded.default_date_axis, regions = excluded.regions,
        custom_countries = excluded.custom_countries, languages = excluded.languages,
        notifications_enabled = excluded.notifications_enabled, notifications_sound = excluded.notifications_sound,
        critical_only = excluded.critical_only, min_severity = excluded.min_severity,
        notify_severities = excluded.notify_severities, notify_incident_types = excluded.notify_incident_types,
        notify_countries = excluded.notify_countries, well_integrity_alerts = excluded.well_integrity_alerts,
        well_control_alerts = excluded.well_control_alerts, quiet_hours_start = excluded.quiet_hours_start,
        quiet_hours_end = excluded.quiet_hours_end, data_retention_days = excluded.data_retention_days,
        updated_at = now()`;
    return parsed;
  }

  async registerDevice(input: DeviceInput): Promise<void> {
    if (input.userId !== null) await this.ensureUser(input.userId);
    await this.sql`
      insert into public.devices (user_id, expo_push_token, platform, app_version, last_seen_at)
      values (${input.userId}, ${input.expoPushToken}, ${input.platform}, ${input.appVersion}, now())
      on conflict (expo_push_token) do update set
        user_id = excluded.user_id, platform = excluded.platform,
        app_version = excluded.app_version, last_seen_at = now(), enabled = true, updated_at = now()`;
  }

  async listActiveDevices(): Promise<{ userId: string | null; expoPushToken: string }[]> {
    const rows = await this.sql<Row[]>`select user_id, expo_push_token from public.devices where enabled`;
    return rows.map((row) => ({ userId: str(row, 'user_id'), expoPushToken: str(row, 'expo_push_token') ?? '' }));
  }

  async hasNotification(userId: string | null, incidentId: string, updateFingerprint: string): Promise<boolean> {
    const rows = await this.sql<Row[]>`
      select 1 from public.notifications
      where incident_id = ${incidentId} and update_fingerprint = ${updateFingerprint}
        and (user_id is not distinct from ${userId})
      limit 1`;
    return rows.length > 0;
  }

  async recordNotification(
    input: NotificationInput,
    status: 'sent' | 'failed' | 'suppressed',
    error: string | null,
  ): Promise<void> {
    if (input.userId !== null) await this.ensureUser(input.userId);
    await this.sql`
      insert into public.notifications
        (user_id, incident_id, material_update_id, kind, title, body, update_fingerprint, sent_at, delivery_status, error_message)
      values (${input.userId}, ${input.incidentId}, ${input.materialUpdateId}, ${input.kind}, ${input.title},
              ${input.body}, ${input.updateFingerprint},
              ${status === 'sent' ? new Date().toISOString() : null}::timestamptz, ${status}, ${error})
      on conflict (user_id, incident_id, update_fingerprint) do nothing`;
  }

  async recordExport(
    userId: string | null,
    incidentId: string,
    format: 'pdf' | 'json' | 'csv',
    fileName: string | null,
  ): Promise<void> {
    if (userId !== null) await this.ensureUser(userId);
    await this.sql`
      insert into public.export_history (user_id, incident_id, format, file_name)
      values (${userId}, ${incidentId}, ${format}, ${fileName})`;
  }

  async deleteUserData(userId: string): Promise<void> {
    await this.sql`select public.delete_user_data(${userId}::uuid)`;
  }

  async exportUserData(userId: string): Promise<Record<string, unknown>> {
    const [row] = await this.sql<Row[]>`select public.export_user_data(${userId}::uuid) as data`;
    const data = row?.['data'];
    return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  }
}
