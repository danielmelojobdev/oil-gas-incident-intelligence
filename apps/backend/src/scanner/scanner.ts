/**
 * AccidentNewsScanner — the 20-step pipeline from brief section 13.
 *
 * Design notes that matter:
 *   * One provider failing never fails a scan (`Promise.allSettled` + circuit breaker).
 *   * Cheap deterministic filters run before anything that costs money (section 51).
 *   * Rules decide; the model advises (decision D5).
 *   * Nothing reaches the database without passing a Zod schema (decision D6).
 */
import {
  DEFAULT_SCAN_LIMITS,
  PRODUCT,
  THRESHOLDS,
  computeConfidence,
  computeRelevanceScore,
  computeSeverity,
  contentHash as computeContentHash,
  titleHash as computeTitleHash,
  crossSourceAgreement,
  dataCompleteness,
  daysBetween,
  dedupeArticles,
  detectMaterialUpdate,
  effectiveFilterDate,
  evaluateOilGasHeuristics,
  findBestIncidentMatch,
  generateSearchQueries,
  isWithinWindow,
  normaliseAssetName,
  normaliseOrganisationName,
  normaliseUrl,
  resolveTimeWindow,
  scanConfigSchema,
  toIsoDate,
  truncate,
  type Article,
  type DedupCandidate,
  type ExtractedIncident,
  type GroupingCandidate,
  type IncidentConsequences,
  type RawArticle,
  type ScanConfig,
  type ScanProviderResult,
  type SearchQuery,
  type SourceTier,
} from '@ogii/domain';
import type { AIProvider, ArticleForAi } from '../ai/ai-provider';
import { extractIncidentHeuristically } from '../ai/heuristic-extraction';
import type { Database, IncidentInput, GroupingCandidateRow } from '../db/database';
import type { Logger } from '../logger';
import type { NewsSourceProvider, ProviderContext } from '../news/news-source-provider';
import { isOilGasDedicatedUrl } from '../news/feeds';
import type { NotificationDispatcher } from './notifications';
import { CircuitBreaker } from '../util/circuit-breaker';
import { RateLimiter } from '../util/rate-limiter';
import { mapSettled } from '../util/concurrency';
import { toErrorMessage } from '../util/errors';
import { SCAN_STAGES } from './types';
import type { Candidate, ScanRequest, ScanSummary } from './types';

export interface ScannerOptions {
  readonly db: Database;
  readonly ai: AIProvider;
  readonly providers: readonly NewsSourceProvider[];
  readonly notifications: NotificationDispatcher;
  readonly logger: Logger;
  readonly now: () => Date;
  readonly isMock: boolean;
  readonly aiConcurrency: number;
}

interface ProviderStats {
  queriesExecuted: number;
  resultsFound: number;
  durationMs: number;
  errorCount: number;
  retryCount: number;
  errorMessage: string | null;
}

export class AccidentNewsScanner {
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly rateLimiter: RateLimiter;
  private aiCalls = 0;

  constructor(private readonly options: ScannerOptions) {
    const intervals = new Map<string, number>();
    for (const provider of options.providers) {
      this.breakers.set(provider.id, new CircuitBreaker(provider.id));
      if (provider.minRequestIntervalMs !== undefined && provider.minRequestIntervalMs > 0) {
        intervals.set(provider.id, provider.minRequestIntervalMs);
      }
    }
    this.rateLimiter = new RateLimiter(intervals);
  }

  /**
   * Convenience wrapper used by tests and the CLI: runs a scan with the default
   * manual trigger and the supplied (or default) configuration.
   */
  async runToCompletionSafe(config?: ScanConfig): Promise<ScanSummary> {
    return this.run({
      trigger: 'manual',
      config:
        config ??
        scanConfigSchema.parse({
          period: 'last_30_days',
          languages: ['en', 'pt', 'es'],
          maxQueries: 40,
          maxResultsPerQuery: 25,
          maxAiExtractions: 120,
        }),
    });
  }

  /** Runs one complete scan and returns its summary. Never throws for provider faults. */
  async run(request: ScanRequest): Promise<ScanSummary> {
    const { db, logger: baseLogger, now } = this.options;
    const startedAt = Date.now();
    this.aiCalls = 0;
    // Counters are per run, not cumulative across the process lifetime.
    this.options.notifications.reset();

    // Step 1-2: configuration and time window.
    const run = await db.createScanRun(request.trigger, request.config, this.options.isMock);
    const logger = baseLogger.child({ component: 'scanner', scanId: run.id, trigger: request.trigger });
    logger.info('scan started', { period: request.config.period, providers: this.options.providers.length });

    const errors: string[] = [];
    const providerStats = new Map<string, ProviderStats>();
    let duplicates = 0;
    let rejected = 0;
    let newIncidents = 0;
    let updatedIncidents = 0;
    let notificationsSent = 0;
    let articlesAnalysed = 0;
    let potentialIncidents = 0;

    try {
      const window = resolveTimeWindow(request.config.period, now(), request.config.dateAxis);

      // Step 3: query plan.
      await db.updateScanRun(run.id, { status: 'running', stage: SCAN_STAGES[0], progress: 0.02 });
      const queries = generateSearchQueries({
        languages: request.config.languages,
        regions: request.config.regions,
        customCountries: request.config.customCountries,
        includeKeywords: request.config.includeKeywords,
        excludeKeywords: request.config.excludeKeywords,
        maxQueries: request.config.maxQueries,
        window,
        period: request.config.period,
      });
      logger.info('query plan generated', { queries: queries.length });

      // Step 4-5: fan out to providers and normalise.
      await db.updateScanRun(run.id, {
        stage: SCAN_STAGES[1],
        progress: 0.1,
        queriesGenerated: queries.length,
        providerCount: this.options.providers.length,
      });
      const rawArticles = await this.searchAllProviders(queries, request, run.id, providerStats, errors, logger);
      logger.info('provider fan-out complete', { rawResults: rawArticles.length });

      // Step 6-7: deterministic filters (free).
      await db.updateScanRun(run.id, { stage: SCAN_STAGES[2], progress: 0.35, resultsFound: rawArticles.length });
      const { candidates, rejectedCount } = this.applyCheapFilters(rawArticles, request, window, logger);
      rejected += rejectedCount;
      articlesAnalysed = rawArticles.length;

      // Step 8-9: deduplication against this batch and against history.
      await db.updateScanRun(run.id, { stage: SCAN_STAGES[3], progress: 0.5 });
      const { unique, duplicateCount } = await this.deduplicate(candidates, logger);
      duplicates = duplicateCount;
      potentialIncidents = unique.length;

      // Step 10-14: AI relevance, extraction and scoring, then grouping.
      await db.updateScanRun(run.id, { stage: SCAN_STAGES[4], progress: 0.6 });
      const budget = Math.min(request.config.maxAiExtractions, DEFAULT_SCAN_LIMITS.maxArticlesPerRun);
      const classified = await this.classifyCandidates(unique, budget, logger);
      rejected += classified.rejected;

      await db.updateScanRun(run.id, { stage: SCAN_STAGES[5], progress: 0.75 });
      const outcome = await this.buildIncidents(classified.accepted, request, run.id, window, logger);
      newIncidents = outcome.created;
      updatedIncidents = outcome.updated;
      rejected += outcome.rejected;
      notificationsSent = outcome.notificationsSent;

      const durationMs = Date.now() - startedAt;
      const providerResults: ScanProviderResult[] = [...providerStats.entries()].map(([provider, stats]) => ({
        provider,
        queriesExecuted: stats.queriesExecuted,
        resultsFound: stats.resultsFound,
        durationMs: stats.durationMs,
        errorCount: stats.errorCount,
        retryCount: stats.retryCount,
        healthy: stats.errorCount === 0,
        errorMessage: stats.errorMessage,
      }));

      const finalRun = await db.updateScanRun(run.id, {
        status: errors.length > 0 ? 'partial' : 'completed',
        stage: SCAN_STAGES[6],
        progress: 1,
        finishedAt: new Date(startedAt + durationMs).toISOString(),
        durationMs,
        resultsFound: rawArticles.length,
        resultsRejected: rejected,
        articlesProcessed: articlesAnalysed,
        duplicatesFound: duplicates,
        newIncidents,
        updatedIncidents,
        notificationsSent,
        aiCalls: this.aiCalls,
        errors,
        providerResults,
      });

      logger.info('scan complete', {
        durationMs,
        rawResults: rawArticles.length,
        rejected,
        duplicates,
        newIncidents,
        updatedIncidents,
        notificationsSent,
        aiCalls: this.aiCalls,
      });

      return {
        scanId: run.id,
        sourcesSearched: this.options.providers.length,
        articlesAnalysed,
        potentialIncidents,
        rejected,
        duplicates,
        newIncidents,
        updatedIncidents,
        notificationsSent,
        durationMs,
        run: finalRun,
      };
    } catch (error) {
      const message = toErrorMessage(error);
      logger.error('scan failed', { error: message });
      const durationMs = Date.now() - startedAt;
      const failedRun = await db.updateScanRun(run.id, {
        status: 'failed',
        stage: 'Failed',
        progress: 1,
        finishedAt: new Date().toISOString(),
        durationMs,
        errors: [...errors, message],
      });
      return {
        scanId: run.id,
        sourcesSearched: this.options.providers.length,
        articlesAnalysed,
        potentialIncidents,
        rejected,
        duplicates,
        newIncidents,
        updatedIncidents,
        notificationsSent,
        durationMs,
        run: failedRun,
      };
    }
  }

  // ------------------------------------------------------------ steps 4 & 5

  private async searchAllProviders(
    queries: readonly SearchQuery[],
    request: ScanRequest,
    scanId: string,
    stats: Map<string, ProviderStats>,
    errors: string[],
    logger: Logger,
  ): Promise<RawArticle[]> {
    const context: ProviderContext = {
      logger,
      scanId,
      maxResults: request.config.maxResultsPerQuery,
      excludeKeywords: request.config.excludeKeywords,
    };

    // Queries arrive priority-ordered, so a capped provider gets the best ones.
    const tasks: { provider: NewsSourceProvider; query: SearchQuery }[] = [];
    for (const provider of this.options.providers) {
      const budget = provider.maxQueriesPerScan ?? queries.length;
      for (const query of queries.slice(0, budget)) tasks.push({ provider, query });
    }

    const results = await mapSettled(tasks, 6, async ({ provider, query }) => {
      const breaker = this.breakers.get(provider.id);
      const entry = stats.get(provider.id) ?? {
        queriesExecuted: 0,
        resultsFound: 0,
        durationMs: 0,
        errorCount: 0,
        retryCount: 0,
        errorMessage: null,
      };
      stats.set(provider.id, entry);

      if (breaker !== undefined && breaker.isOpen) {
        entry.errorMessage = 'circuit breaker open';
        return [] as RawArticle[];
      }

      try {
        // Pace before the call: some providers answer 429 rather than queueing.
        await this.rateLimiter.acquire(provider.id);
        const result = await (breaker === undefined
          ? provider.searchNews(query, context)
          : breaker.run(() => provider.searchNews(query, context)));
        entry.queriesExecuted += 1;
        entry.resultsFound += result.articles.length;
        entry.durationMs += result.durationMs;
        entry.retryCount += result.retries;
        return [...result.articles];
      } catch (error) {
        entry.errorCount += 1;
        entry.errorMessage = toErrorMessage(error);
        throw error;
      }
    });

    const articles: RawArticle[] = [];
    const failuresByProvider = new Map<string, number>();
    for (const [index, result] of results.entries()) {
      const task = tasks[index];
      if (result.status === 'fulfilled') {
        articles.push(...result.value);
      } else if (task !== undefined) {
        const count = (failuresByProvider.get(task.provider.id) ?? 0) + 1;
        failuresByProvider.set(task.provider.id, count);
      }
    }
    // One log line per failing provider, not one per failing query.
    for (const [providerId, count] of failuresByProvider) {
      const message = `${providerId}: ${count} quer${count === 1 ? 'y' : 'ies'} failed (${stats.get(providerId)?.errorMessage ?? 'unknown'})`;
      errors.push(message);
      logger.warn('provider errors', { providerId, failedQueries: count });
    }

    return articles;
  }

  // ------------------------------------------------------------ steps 6 & 7

  private applyCheapFilters(
    rawArticles: readonly RawArticle[],
    request: ScanRequest,
    window: ReturnType<typeof resolveTimeWindow>,
    logger: Logger,
  ): { candidates: Candidate[]; rejectedCount: number } {
    const candidates: Candidate[] = [];
    let rejectedCount = 0;

    for (const raw of rawArticles) {
      // Stage 1 — date window. Publication date is a proxy at this point; the real
      // incident date is only known after extraction, and is re-checked then.
      if (window.fromDate !== null && raw.publishedAt !== null) {
        const publishedDate = raw.publishedAt.slice(0, 10);
        // Allow a 45-day lead-in: an article can report an incident inside the window
        // while itself being older/newer at the margins.
        const gap = daysBetween(window.fromDate, publishedDate) ?? 0;
        if (gap > 45 || publishedDate > window.toDate) {
          rejectedCount += 1;
          continue;
        }
      }

      // Stages 2-3 — keyword/rule filter and Oil & Gas heuristics.
      const heuristics = evaluateOilGasHeuristics({
        title: raw.title,
        excerpt: raw.excerpt,
        publisher: raw.publisher,
        sourceTier: raw.sourceTier,
        sourceIsOilGasDedicated: isOilGasDedicatedUrl(raw.url),
        includeKeywords: request.config.includeKeywords,
        excludeKeywords: request.config.excludeKeywords,
      });

      if (!heuristics.passed) {
        rejectedCount += 1;
        continue;
      }

      const canonical = raw.canonicalUrl ?? raw.url;
      candidates.push({
        raw,
        normalizedUrl: normaliseUrl(canonical),
        titleHash: computeTitleHash(raw.title),
        contentHash: computeContentHash(raw.title, raw.excerpt),
        heuristics,
      });
    }

    logger.info('cheap filters applied', {
      input: rawArticles.length,
      survived: candidates.length,
      rejected: rejectedCount,
    });
    return { candidates, rejectedCount };
  }

  // ------------------------------------------------------------ steps 8 & 9

  private async deduplicate(
    candidates: readonly Candidate[],
    logger: Logger,
  ): Promise<{ unique: Candidate[]; duplicateCount: number }> {
    if (candidates.length === 0) return { unique: [], duplicateCount: 0 };

    const known = await this.options.db.findKnownArticles({
      normalizedUrls: candidates.map((candidate) => candidate.normalizedUrl),
      canonicalUrls: candidates
        .map((candidate) => candidate.raw.canonicalUrl)
        .filter((url): url is string => url !== null),
      titleHashes: candidates.map((candidate) => candidate.titleHash),
      contentHashes: candidates.map((candidate) => candidate.contentHash),
    });

    const knownCandidates: DedupCandidate[] = known.map((article) => ({
      id: article.id,
      title: article.title,
      url: article.originalUrl,
      canonicalUrl: article.canonicalUrl,
      normalizedUrl: article.normalizedUrl,
      publisher: article.publisher,
      publishedAt: article.publishedAt,
      excerpt: article.excerpt,
      titleHash: article.titleHash,
      contentHash: article.contentHash,
    }));

    const batch = candidates.map((candidate, index) => ({
      id: `batch-${index}`,
      title: candidate.raw.title,
      url: candidate.raw.url,
      canonicalUrl: candidate.raw.canonicalUrl,
      normalizedUrl: candidate.normalizedUrl,
      publisher: candidate.raw.publisher,
      publishedAt: candidate.raw.publishedAt,
      excerpt: candidate.raw.excerpt,
      titleHash: candidate.titleHash,
      contentHash: candidate.contentHash,
      __candidate: candidate,
    }));

    const result = dedupeArticles(batch, knownCandidates);
    logger.info('deduplication complete', {
      input: candidates.length,
      unique: result.unique.length,
      duplicates: result.duplicates.length,
      knownArticles: known.length,
    });

    return {
      unique: result.unique.map((item) => item.__candidate),
      duplicateCount: result.duplicates.length,
    };
  }

  // --------------------------------------------------------- steps 10 to 12

  private toArticleForAi(candidate: Candidate, id = 'candidate'): ArticleForAi {
    return {
      id,
      title: candidate.raw.title,
      excerpt: candidate.raw.excerpt,
      publisher: candidate.raw.publisher,
      publishedAt: candidate.raw.publishedAt,
      url: candidate.raw.url,
      language: candidate.raw.language,
      sourceTier: candidate.raw.sourceTier,
    };
  }

  /** Stage 6 of the cost ladder: cheap AI relevance, budget-capped. */
  private async classifyCandidates(
    candidates: readonly Candidate[],
    budget: number,
    logger: Logger,
  ): Promise<{ accepted: Candidate[]; rejected: number }> {
    // Best candidates first so that a tight budget spends on the most promising ones.
    const ordered = [...candidates].sort(
      (a, b) => (b.heuristics?.score ?? 0) - (a.heuristics?.score ?? 0) || a.raw.sourceTier - b.raw.sourceTier,
    );
    const withinBudget = ordered.slice(0, budget);
    const overBudget = ordered.length - withinBudget.length;
    if (overBudget > 0) {
      logger.warn('ai budget exhausted, deferring candidates to the next scan', {
        budget,
        deferred: overBudget,
      });
    }

    const results = await mapSettled(withinBudget, this.options.aiConcurrency, async (candidate) => {
      const verdict = await this.options.ai.classifyOilAndGasRelevance(this.toArticleForAi(candidate));
      this.aiCalls += verdict.usage.cached ? 0 : 1;
      return { candidate, verdict: verdict.value };
    });

    const accepted: Candidate[] = [];
    let rejected = 0;

    for (const [index, result] of results.entries()) {
      const candidate = withinBudget[index];
      if (candidate === undefined) continue;

      if (result.status === 'rejected') {
        // AI unavailable: fall back to rules rather than dropping a real incident.
        logger.warn('relevance classification failed, falling back to heuristics', {
          error: toErrorMessage(result.reason),
        });
        candidate.aiRelevance = undefined;
        accepted.push(candidate);
        continue;
      }

      const verdict = result.value.verdict;
      candidate.aiRelevance = {
        isRelated: verdict.isOilAndGasRelated,
        confidence: verdict.confidence,
        sector: verdict.oilAndGasSector,
        reason: verdict.reason,
      };

      if (!verdict.isOilAndGasRelated || verdict.confidence < THRESHOLDS.aiRelevance.rejectBelow) {
        candidate.rejectedReason = verdict.reason;
        rejected += 1;
        continue;
      }
      accepted.push(candidate);
    }

    logger.info('ai relevance classification complete', {
      considered: withinBudget.length,
      accepted: accepted.length,
      rejected,
    });
    return { accepted, rejected };
  }

  // --------------------------------------------------------- steps 13 to 20

  private async buildIncidents(
    candidates: readonly Candidate[],
    request: ScanRequest,
    scanId: string,
    window: ReturnType<typeof resolveTimeWindow>,
    logger: Logger,
  ): Promise<{ created: number; updated: number; rejected: number; notificationsSent: number }> {
    let created = 0;
    let updated = 0;
    let rejected = 0;
    let notificationsSent = 0;

    for (const candidate of candidates) {
      try {
        const result = await this.processCandidate(candidate, request, scanId, window, logger);
        if (result === 'created') created += 1;
        else if (result === 'updated') updated += 1;
        else rejected += 1;
      } catch (error) {
        logger.error('candidate processing failed', {
          url: candidate.raw.url,
          error: toErrorMessage(error),
        });
        rejected += 1;
      }
    }

    notificationsSent = this.options.notifications.sentCount;
    return { created, updated, rejected, notificationsSent };
  }

  private async extract(candidate: Candidate, logger: Logger): Promise<ExtractedIncident> {
    try {
      const result = await this.options.ai.extractIncidentData([this.toArticleForAi(candidate)]);
      this.aiCalls += result.usage.cached ? 0 : 1;
      return result.value;
    } catch (error) {
      // Degradation path (decision D5): rules-only extraction keeps the pipeline alive.
      logger.warn('ai extraction failed, using rules-only extraction', { error: toErrorMessage(error) });
      return extractIncidentHeuristically([this.toArticleForAi(candidate)]);
    }
  }

  private async processCandidate(
    candidate: Candidate,
    request: ScanRequest,
    scanId: string,
    window: ReturnType<typeof resolveTimeWindow>,
    logger: Logger,
  ): Promise<'created' | 'updated' | 'rejected'> {
    const { db, now } = this.options;

    // Step 11 — full extraction.
    const extracted = await this.extract(candidate, logger);
    if (!extracted.isOilAndGasRelated) return 'rejected';

    // Step 12 — the incident date decides the window, not the publication date (D8).
    const { date: filterDate, isEstimated } = effectiveFilterDate(
      extracted.incidentDate,
      candidate.raw.publishedAt,
      request.config.dateAxis,
    );
    if (window.fromDate !== null && !isWithinWindow(filterDate, window)) {
      logger.debug('candidate outside the incident-date window', {
        url: candidate.raw.url,
        incidentDate: extracted.incidentDate,
      });
      return 'rejected';
    }

    const ageInDays = filterDate === null ? null : Math.abs(daysBetween(toIsoDate(now()), filterDate) ?? 0);

    // Step 12 — relevance score decides feed vs review vs reject.
    const relevance = computeRelevanceScore(
      {
        heuristicScore: candidate.heuristics?.score ?? 50,
        aiConfidence: candidate.aiRelevance?.confidence ?? null,
        aiSaysRelated: candidate.aiRelevance?.isRelated ?? null,
        sector: extracted.oilAndGasSector,
        bestSourceTier: candidate.raw.sourceTier,
        ageInDays,
        matchesRequestedRegion: this.matchesRequestedRegion(extracted.country, request),
        incidentTermHits: candidate.heuristics?.matchedEventTerms.length ?? 0,
        hasStrongPhrase: candidate.heuristics?.hasStrongPhrase ?? false,
      },
      { feed: request.config.relevanceThresholdFeed, review: request.config.relevanceThresholdReview },
    );

    if (relevance.outcome === 'reject') {
      logger.debug('candidate rejected on relevance', { url: candidate.raw.url, score: relevance.score });
      return 'rejected';
    }

    // Persist the article first: it is evidence regardless of how grouping resolves.
    const article = await db.insertArticle({
      provider: candidate.raw.provider,
      publisher: candidate.raw.publisher,
      title: candidate.raw.title,
      originalUrl: candidate.raw.url,
      canonicalUrl: candidate.raw.canonicalUrl,
      normalizedUrl: candidate.normalizedUrl,
      publishedAt: candidate.raw.publishedAt,
      author: candidate.raw.author,
      language: candidate.raw.language,
      excerpt: candidate.raw.excerpt,
      sourceTier: candidate.raw.sourceTier,
      titleHash: candidate.titleHash,
      contentHash: candidate.contentHash,
      scanRunId: scanId,
      relevanceScore: relevance.score,
      rejectedReason: null,
      isMock: this.options.isMock,
    });

    // Step 10/14 — grouping.
    const groupingCandidate: GroupingCandidate = {
      title: extracted.title,
      incidentDate: extracted.incidentDate,
      country: extracted.country,
      operator: extracted.operator,
      company: extracted.company,
      asset: extracted.asset,
      installation: extracted.installation,
      field: extracted.field,
      wellName: extracted.wellName,
      incidentType: extracted.incidentType,
    };

    const match = await this.findMatch(groupingCandidate, extracted, logger);

    if (match !== null) {
      await this.applyUpdate(match, article, candidate, extracted, relevance.score, scanId, logger);
      return 'updated';
    }

    await this.createIncident(article, candidate, extracted, relevance, isEstimated, scanId, logger);
    return 'created';
  }

  private matchesRequestedRegion(country: string | null, request: ScanRequest): boolean {
    if (request.config.regions.includes('worldwide')) return true;
    if (country === null) return false;
    const wanted = [...request.config.regions, ...request.config.customCountries].map((value) =>
      normaliseAssetName(value.replace(/_/g, ' ')),
    );
    const actual = normaliseAssetName(country);
    return wanted.some((value) => actual.includes(value) || value.includes(actual));
  }

  /** Rules gate the model: only the ambiguous band is escalated (brief section 17). */
  private async findMatch(
    candidate: GroupingCandidate,
    extracted: ExtractedIncident,
    logger: Logger,
  ): Promise<GroupingCandidateRow | null> {
    const anchorDate = extracted.incidentDate ?? toIsoDate(this.options.now());
    const from = toIsoDate(new Date(Date.parse(`${anchorDate}T00:00:00Z`) - 8 * 86_400_000));
    const to = toIsoDate(new Date(Date.parse(`${anchorDate}T00:00:00Z`) + 8 * 86_400_000));

    const existing = await this.options.db.findGroupingCandidates(from, to, extracted.countryCode);
    if (existing.length === 0) return null;

    const best = findBestIncidentMatch(candidate, existing);
    if (best === null) return null;

    if (best.score.decision === 'same') {
      logger.debug('grouped by rules', { incidentId: best.incident.id, score: best.score.score });
      return best.incident;
    }

    if (best.score.decision === 'review') {
      try {
        const verdict = await this.options.ai.compareIncidentSimilarity(
          {
            title: candidate.title,
            summary: extracted.summary,
            incidentDate: candidate.incidentDate,
            country: candidate.country,
            operator: candidate.operator,
            asset: candidate.asset,
            incidentType: candidate.incidentType,
            fatalities: extracted.fatalities,
            injuries: extracted.injuries,
          },
          {
            title: best.incident.title,
            summary: null,
            incidentDate: best.incident.incidentDate,
            country: best.incident.country,
            operator: best.incident.operator,
            asset: best.incident.asset ?? best.incident.installation,
            incidentType: best.incident.incidentType,
            fatalities: null,
            injuries: null,
          },
        );
        this.aiCalls += verdict.usage.cached ? 0 : 1;
        if (verdict.value.sameIncident && verdict.value.confidence >= THRESHOLDS.grouping.aiMinConfidence) {
          logger.debug('grouped by model tie-break', {
            incidentId: best.incident.id,
            confidence: verdict.value.confidence,
          });
          return best.incident;
        }
      } catch (error) {
        logger.warn('similarity tie-break failed, treating as a new incident', {
          error: toErrorMessage(error),
        });
      }
    }

    return null;
  }

  private buildConsequences(extracted: ExtractedIncident): IncidentConsequences {
    return {
      fatalities: extracted.fatalities,
      injuries: extracted.injuries,
      missingPersons: extracted.missingPersons,
      evacuatedPersons: extracted.evacuatedPersons,
      hydrocarbonRelease: extracted.hydrocarbonRelease,
      environmentalImpact: extracted.environmentalImpact,
      productionImpact: extracted.productionImpact,
      productionInterruption: extracted.productionImpact === null ? null : true,
      shutdown:
        extracted.incidentType === 'emergency_shutdown' || extracted.incidentType === 'production_shutdown'
          ? true
          : null,
      assetDamage: extracted.assetDamage,
      fire: extracted.incidentType === 'fire' || extracted.secondaryIncidentTypes.includes('fire') ? true : null,
      explosion:
        extracted.incidentType === 'explosion' || extracted.secondaryIncidentTypes.includes('explosion') ? true : null,
      spill: extracted.incidentType === 'oil_spill' || extracted.secondaryIncidentTypes.includes('oil_spill') ? true : null,
      leak: ['gas_leak', 'oil_leak', 'pipeline_leak'].includes(extracted.incidentType) ? true : null,
      wellControlEvent:
        extracted.incidentType === 'well_control' || extracted.incidentType === 'blowout' ? true : null,
    };
  }

  private async createIncident(
    article: Article,
    candidate: Candidate,
    extracted: ExtractedIncident,
    relevance: ReturnType<typeof computeRelevanceScore>,
    incidentDateIsEstimated: boolean,
    scanId: string,
    logger: Logger,
  ): Promise<void> {
    const consequences = this.buildConsequences(extracted);

    const severity = computeSeverity({
      fatalities: consequences.fatalities,
      injuries: consequences.injuries,
      missingPersons: consequences.missingPersons,
      evacuatedPersons: consequences.evacuatedPersons,
      incidentType: extracted.incidentType,
      secondaryIncidentTypes: extracted.secondaryIncidentTypes,
      isWellIntegrityRelated: extracted.isWellIntegrityRelated,
      wellIntegrityCategory: extracted.wellIntegrityCategory,
      isProcessSafetyEvent: extracted.isProcessSafetyEvent,
      hydrocarbonRelease: consequences.hydrocarbonRelease,
      environmentalImpact: consequences.environmentalImpact,
      productionImpact: consequences.productionImpact,
      shutdown: consequences.shutdown,
      fire: consequences.fire,
      explosion: consequences.explosion,
      spill: consequences.spill,
      aiSeverity: extracted.severity,
    });

    const confidence = computeConfidence({
      sourceTiers: [article.sourceTier],
      distinctPublishers: 1,
      crossSourceAgreement: null,
      dataCompleteness: dataCompleteness(extracted as unknown as Record<string, unknown>),
      aiConfidence: extracted.confidence,
      hasEvidence: true,
    });

    const input: IncidentInput = {
      title: truncate(extracted.title, 200),
      summary: extracted.summary,
      incidentDate: extracted.incidentDate ?? candidate.raw.publishedAt?.slice(0, 10) ?? null,
      incidentTime: extracted.incidentTime,
      incidentDateIsEstimated,
      country: extracted.country,
      countryCode: extracted.countryCode,
      region: extracted.region,
      city: extracted.city,
      basin: extracted.basin,
      block: extracted.block,
      field: extracted.field,
      latitude: extracted.latitude,
      longitude: extracted.longitude,
      operator: extracted.operator,
      company: extracted.company,
      licenceHolder: extracted.licenceHolder,
      drillingContractor: extracted.drillingContractor,
      serviceCompany: extracted.serviceCompany,
      pipelineOperator: extracted.pipelineOperator,
      asset: extracted.asset,
      installation: extracted.installation,
      installationType: extracted.installationType,
      vessel: extracted.vessel,
      wellName: extracted.wellName,
      wellNumber: extracted.wellNumber,
      wellType: extracted.wellType,
      wellStatus: extracted.wellStatus,
      oilGasSector: extracted.oilAndGasSector,
      environment: extracted.environment,
      waterDepthCategory: extracted.waterDepthCategory,
      lifecycleStage: extracted.lifecycleStage,
      incidentType: extracted.incidentType,
      secondaryIncidentTypes: extracted.secondaryIncidentTypes,
      isWellIntegrityRelated: extracted.isWellIntegrityRelated,
      wellIntegrityCategory: extracted.wellIntegrityCategory,
      suspectedFailedComponent: extracted.suspectedFailedComponent,
      barrierFunctionImpacted: extracted.barrierFunctionImpacted,
      isProcessSafetyEvent: extracted.isProcessSafetyEvent,
      processSafetyCategory: extracted.processSafetyCategory,
      severity: severity.severity,
      severityScore: severity.score,
      confidence: confidence.confidence,
      confidenceScore: confidence.score,
      relevanceScore: relevance.score,
      consequences,
      // Below the feed threshold the incident is stored but flagged for review and never notifies.
      status: relevance.outcome === 'feed' ? 'new' : 'under_review',
      isMock: this.options.isMock,
    };

    const incident = await this.options.db.createIncident(input, scanId);
    await this.options.db.attachArticle(incident.id, article.id, {
      isPrimary: true,
      matchScore: null,
      matchReason: 'First article for this incident.',
      matchedBy: 'rules',
    });

    await this.writeEnrichment(incident.id, article, extracted);

    const stored = await this.options.db.getIncident(incident.id, null);
    if (stored !== null && relevance.outcome === 'feed') {
      const sent = await this.options.notifications.notifyNewIncident(stored, confidence.score);
      if (sent > 0) logger.info('notification queued for new incident', { incidentId: incident.id, recipients: sent });
    }
  }

  private async writeEnrichment(
    incidentId: string,
    article: Article,
    extracted: ExtractedIncident,
  ): Promise<void> {
    const { db } = this.options;

    await db.replaceHighlights(
      incidentId,
      extracted.highlights.slice(0, 8).map((text, index) => ({
        text,
        position: index,
        sourceArticleId: article.id,
      })),
    );

    const entities: { entityType: string; name: string; normalizedName: string; sourceArticleId: string | null }[] = [];
    const addEntity = (entityType: string, name: string | null, organisation: boolean): void => {
      if (name === null || name.trim() === '') return;
      entities.push({
        entityType,
        name,
        normalizedName: organisation ? normaliseOrganisationName(name) : normaliseAssetName(name),
        sourceArticleId: article.id,
      });
    };
    addEntity('operator', extracted.operator, true);
    addEntity('company', extracted.company, true);
    addEntity('drilling_contractor', extracted.drillingContractor, true);
    addEntity('service_company', extracted.serviceCompany, true);
    addEntity('pipeline_operator', extracted.pipelineOperator, true);
    addEntity('asset', extracted.asset, false);
    addEntity('installation', extracted.installation, false);
    addEntity('field', extracted.field, false);
    addEntity('well', extracted.wellName, false);
    addEntity('vessel', extracted.vessel, false);
    addEntity('location', extracted.country, false);
    if (entities.length > 0) await db.upsertEntities(incidentId, entities);

    // Per-field provenance (brief section 27) for the facts that matter most.
    const evidenceFields: [string, string | number | null][] = [
      ['operator', extracted.operator],
      ['asset', extracted.asset],
      ['incidentDate', extracted.incidentDate],
      ['country', extracted.country],
      ['fatalities', extracted.fatalities],
      ['injuries', extracted.injuries],
      ['wellIntegrityCategory', extracted.wellIntegrityCategory],
      ['suspectedFailedComponent', extracted.suspectedFailedComponent],
    ];
    const evidence = evidenceFields
      .filter(([, value]) => value !== null)
      .map(([field, value]) => ({
        field,
        value: String(value),
        sourceArticleId: article.id,
        quote: null,
        confidence: extracted.confidence,
      }));
    if (evidence.length > 0) await db.upsertEvidence(incidentId, evidence);
  }

  /** Brief section 18: attach the article, recompute, notify only on a material update. */
  private async applyUpdate(
    match: GroupingCandidateRow,
    article: Article,
    candidate: Candidate,
    extracted: ExtractedIncident,
    relevanceScore: number,
    scanId: string,
    logger: Logger,
  ): Promise<void> {
    const { db } = this.options;
    const before = await db.getIncident(match.id, null);
    if (before === null) return;

    await db.attachArticle(match.id, article.id, {
      isPrimary: false,
      matchScore: null,
      matchReason: 'Grouped with an existing incident.',
      matchedBy: 'rules',
    });

    const withArticle = await db.getIncident(match.id, null);
    if (withArticle === null) return;

    const incoming = this.buildConsequences(extracted);
    // Merge conservatively: a later source may fill a gap, but must not erase a fact.
    const merged: IncidentConsequences = {
      fatalities: incoming.fatalities ?? before.consequences.fatalities,
      injuries: incoming.injuries ?? before.consequences.injuries,
      missingPersons: incoming.missingPersons ?? before.consequences.missingPersons,
      evacuatedPersons: incoming.evacuatedPersons ?? before.consequences.evacuatedPersons,
      hydrocarbonRelease: incoming.hydrocarbonRelease ?? before.consequences.hydrocarbonRelease,
      environmentalImpact: incoming.environmentalImpact ?? before.consequences.environmentalImpact,
      productionImpact: incoming.productionImpact ?? before.consequences.productionImpact,
      productionInterruption: incoming.productionInterruption ?? before.consequences.productionInterruption,
      shutdown: incoming.shutdown ?? before.consequences.shutdown,
      assetDamage: incoming.assetDamage ?? before.consequences.assetDamage,
      fire: incoming.fire ?? before.consequences.fire,
      explosion: incoming.explosion ?? before.consequences.explosion,
      spill: incoming.spill ?? before.consequences.spill,
      leak: incoming.leak ?? before.consequences.leak,
      wellControlEvent: incoming.wellControlEvent ?? before.consequences.wellControlEvent,
    };

    const severity = computeSeverity({
      fatalities: merged.fatalities,
      injuries: merged.injuries,
      missingPersons: merged.missingPersons,
      evacuatedPersons: merged.evacuatedPersons,
      incidentType: before.incidentType,
      secondaryIncidentTypes: before.secondaryIncidentTypes,
      isWellIntegrityRelated: extracted.isWellIntegrityRelated ?? before.isWellIntegrityRelated,
      wellIntegrityCategory: extracted.wellIntegrityCategory ?? before.wellIntegrityCategory,
      isProcessSafetyEvent: extracted.isProcessSafetyEvent ?? before.isProcessSafetyEvent,
      hydrocarbonRelease: merged.hydrocarbonRelease,
      environmentalImpact: merged.environmentalImpact,
      productionImpact: merged.productionImpact,
      shutdown: merged.shutdown,
      fire: merged.fire,
      explosion: merged.explosion,
      spill: merged.spill,
      aiSeverity: extracted.severity,
    });

    const tiers: SourceTier[] = withArticle.articles.map((item) => item.sourceTier);
    const publishers = new Set(withArticle.articles.map((item) => item.publisher));
    const agreement = crossSourceAgreement(
      [
        { operator: before.operator, country: before.country, asset: before.asset },
        { operator: extracted.operator, country: extracted.country, asset: extracted.asset },
      ],
      ['operator', 'country', 'asset'],
    );
    const confidence = computeConfidence({
      sourceTiers: tiers,
      distinctPublishers: publishers.size,
      crossSourceAgreement: agreement,
      dataCompleteness: dataCompleteness(extracted as unknown as Record<string, unknown>),
      aiConfidence: extracted.confidence,
      hasEvidence: true,
    });

    const materialUpdate = detectMaterialUpdate(
      {
        fatalities: before.consequences.fatalities,
        injuries: before.consequences.injuries,
        missingPersons: before.consequences.missingPersons,
        evacuatedPersons: before.consequences.evacuatedPersons,
        severity: before.severity,
        severityScore: before.severityScore,
        environmentalImpact: before.consequences.environmentalImpact,
        productionImpact: before.consequences.productionImpact,
        shutdown: before.consequences.shutdown,
        operator: before.operator,
        asset: before.asset,
        wellName: before.wellName,
        isWellIntegrityRelated: before.isWellIntegrityRelated,
        wellIntegrityCategory: before.wellIntegrityCategory,
        suspectedFailedComponent: before.suspectedFailedComponent,
        barrierFunctionImpacted: before.barrierFunctionImpacted,
        isProcessSafetyEvent: before.isProcessSafetyEvent,
        processSafetyCategory: before.processSafetyCategory,
        cause: null,
        hasOfficialSource: before.hasOfficialSource,
        incidentDate: before.incidentDate,
      },
      {
        fatalities: merged.fatalities,
        injuries: merged.injuries,
        missingPersons: merged.missingPersons,
        evacuatedPersons: merged.evacuatedPersons,
        severity: severity.severity,
        severityScore: severity.score,
        environmentalImpact: merged.environmentalImpact,
        productionImpact: merged.productionImpact,
        shutdown: merged.shutdown,
        operator: extracted.operator ?? before.operator,
        asset: extracted.asset ?? before.asset,
        wellName: extracted.wellName ?? before.wellName,
        isWellIntegrityRelated: extracted.isWellIntegrityRelated ?? before.isWellIntegrityRelated,
        wellIntegrityCategory: extracted.wellIntegrityCategory ?? before.wellIntegrityCategory,
        suspectedFailedComponent: extracted.suspectedFailedComponent ?? before.suspectedFailedComponent,
        barrierFunctionImpacted: extracted.barrierFunctionImpacted ?? before.barrierFunctionImpacted,
        isProcessSafetyEvent: extracted.isProcessSafetyEvent ?? before.isProcessSafetyEvent,
        processSafetyCategory: extracted.processSafetyCategory ?? before.processSafetyCategory,
        cause: null,
        hasOfficialSource: before.hasOfficialSource || article.sourceTier === 1,
        incidentDate: extracted.incidentDate ?? before.incidentDate,
      },
    );

    await db.updateIncident(match.id, {
      consequences: merged,
      severity: severity.severity,
      severityScore: severity.score,
      confidence: confidence.confidence,
      confidenceScore: confidence.score,
      relevanceScore: Math.max(before.relevanceScore, relevanceScore),
      operator: extracted.operator ?? before.operator,
      asset: extracted.asset ?? before.asset,
      installation: extracted.installation ?? before.installation,
      field: extracted.field ?? before.field,
      wellName: extracted.wellName ?? before.wellName,
      incidentDate: before.incidentDate ?? extracted.incidentDate,
      isWellIntegrityRelated: extracted.isWellIntegrityRelated ?? before.isWellIntegrityRelated,
      wellIntegrityCategory: extracted.wellIntegrityCategory ?? before.wellIntegrityCategory,
      suspectedFailedComponent: extracted.suspectedFailedComponent ?? before.suspectedFailedComponent,
      barrierFunctionImpacted: extracted.barrierFunctionImpacted ?? before.barrierFunctionImpacted,
      isProcessSafetyEvent: extracted.isProcessSafetyEvent ?? before.isProcessSafetyEvent,
      processSafetyCategory: extracted.processSafetyCategory ?? before.processSafetyCategory,
      status: materialUpdate.isMaterialUpdate ? 'updated' : before.status,
      lastUpdatedAt: this.options.now().toISOString(),
    });

    const materialUpdateId = await db.recordMaterialUpdate({
      incidentId: match.id,
      articleId: article.id,
      scanRunId: scanId,
      isMaterial: materialUpdate.isMaterialUpdate,
      changeTypes: materialUpdate.changes,
      descriptions: materialUpdate.descriptions,
      updateFingerprint: materialUpdate.fingerprint,
      reason: materialUpdate.reason,
      decidedBy: 'rules',
    });

    // Regenerate the consolidated narrative only when the facts actually moved.
    if (materialUpdate.isMaterialUpdate) {
      await this.regenerateNarrative(match.id, logger);
      const after = await db.getIncident(match.id, null);
      if (after !== null) {
        await this.options.notifications.notifyMaterialUpdate(
          after,
          materialUpdate,
          materialUpdateId,
          confidence.score,
        );
      }
      logger.info('material update applied', { incidentId: match.id, changes: materialUpdate.changes });
    } else {
      logger.debug('non-material update, no notification', { incidentId: match.id, url: candidate.raw.url });
    }
  }

  private async regenerateNarrative(incidentId: string, logger: Logger): Promise<void> {
    const incident = await this.options.db.getIncident(incidentId, null);
    if (incident === null) return;

    const articles: ArticleForAi[] = incident.articles.map((article) => ({
      id: article.id,
      title: article.title,
      excerpt: article.excerpt,
      publisher: article.publisher,
      publishedAt: article.publishedAt,
      url: article.originalUrl,
      language: article.language,
      sourceTier: article.sourceTier,
    }));

    try {
      const result = await this.options.ai.summarizeIncident(
        {
          title: incident.title,
          summary: incident.summary,
          incidentDate: incident.incidentDate,
          country: incident.country,
          operator: incident.operator,
          asset: incident.asset,
          incidentType: incident.incidentType,
          fatalities: incident.consequences.fatalities,
          injuries: incident.consequences.injuries,
        },
        articles,
      );
      this.aiCalls += result.usage.cached ? 0 : 1;
      await this.options.db.updateIncident(incidentId, { summary: result.value.summary });
      await this.options.db.replaceHighlights(
        incidentId,
        result.value.highlights.slice(0, 8).map((text, index) => ({
          text,
          position: index,
          sourceArticleId: articles[0]?.id ?? null,
        })),
      );
    } catch (error) {
      logger.warn('summary regeneration failed, keeping the previous narrative', {
        incidentId,
        error: toErrorMessage(error),
      });
    }
  }
}

export { PRODUCT };
