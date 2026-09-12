/**
 * Mock dataset builders (brief section 56).
 *
 * Everything here is FICTIONAL: invented operators, invented assets, invented
 * publishers, and non-resolving `example.com` URLs. The `isMock` flag travels with every
 * record so the UI can label it `MOCK DATA` and nobody can mistake it for a real event.
 */
import type { Article, IncidentConsequences, IncidentDetail, IncidentHighlight } from '../schemas';
import type {
  ConfidenceLevel,
  IncidentEnvironment,
  IncidentType,
  InstallationType,
  LifecycleStage,
  OilGasSector,
  ProcessSafetyCategory,
  Severity,
  SourceTier,
  WellIntegrityCategory,
  WellStatus,
  WellType,
} from '../taxonomy';
import { contentHash, titleHash } from '../text/hash';
import { normaliseUrl } from '../text/url';
import { addDays, toIsoDate } from '../time/periods';

export const EMPTY_CONSEQUENCES: IncidentConsequences = {
  fatalities: null,
  injuries: null,
  missingPersons: null,
  evacuatedPersons: null,
  hydrocarbonRelease: null,
  environmentalImpact: null,
  productionImpact: null,
  productionInterruption: null,
  shutdown: null,
  assetDamage: null,
  fire: null,
  explosion: null,
  spill: null,
  leak: null,
  wellControlEvent: null,
};

export interface MockArticleSpec {
  readonly publisher: string;
  readonly title: string;
  readonly slug: string;
  readonly tier: SourceTier;
  readonly hoursAfterIncident: number;
  readonly excerpt: string;
  readonly language?: 'en' | 'pt' | 'es' | 'fr' | 'no';
  readonly domain?: string;
}

export interface MockIncidentSpec {
  readonly key: string;
  readonly title: string;
  readonly daysAgo: number;
  readonly summary: string;
  readonly highlights: readonly string[];
  readonly country: string;
  readonly countryCode: string;
  readonly region?: string | null;
  readonly city?: string | null;
  readonly basin?: string | null;
  readonly block?: string | null;
  readonly field?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly operator: string;
  readonly company?: string | null;
  readonly drillingContractor?: string | null;
  readonly serviceCompany?: string | null;
  readonly pipelineOperator?: string | null;
  readonly asset?: string | null;
  readonly installation?: string | null;
  readonly installationType?: InstallationType | null;
  readonly vessel?: string | null;
  readonly wellName?: string | null;
  readonly wellNumber?: string | null;
  readonly wellType?: WellType | null;
  readonly wellStatus?: WellStatus | null;
  readonly oilGasSector: OilGasSector;
  readonly environment: IncidentEnvironment;
  readonly lifecycleStage: LifecycleStage;
  readonly incidentType: IncidentType;
  readonly secondaryIncidentTypes?: readonly IncidentType[];
  readonly isWellIntegrityRelated?: boolean | null;
  readonly wellIntegrityCategory?: WellIntegrityCategory | null;
  readonly suspectedFailedComponent?: string | null;
  readonly barrierFunctionImpacted?: 'primary' | 'secondary' | 'both' | 'unknown' | null;
  readonly isProcessSafetyEvent?: boolean | null;
  readonly processSafetyCategory?: ProcessSafetyCategory | null;
  readonly severity: Severity;
  readonly severityScore: number;
  readonly confidence: ConfidenceLevel;
  readonly confidenceScore: number;
  readonly relevanceScore: number;
  readonly consequences: Partial<IncidentConsequences>;
  readonly status?: 'new' | 'updated' | 'monitoring' | 'under_review' | 'archived';
  readonly incidentTime?: string | null;
  readonly articles: readonly MockArticleSpec[];
}

function mockUrl(spec: MockArticleSpec, key: string): string {
  const domain = spec.domain ?? 'example.com';
  return `https://${domain}/mock/${key}/${spec.slug}`;
}

function buildArticles(spec: MockIncidentSpec, incidentIso: string, nowIso: string): Article[] {
  return spec.articles.map((article, index) => {
    const publishedAt = new Date(Date.parse(incidentIso) + article.hoursAfterIncident * 3_600_000).toISOString();
    const url = mockUrl(article, spec.key);
    return {
      id: `mock-article-${spec.key}-${index + 1}`,
      incidentId: `mock-incident-${spec.key}`,
      sourceId: `mock-source-${article.publisher.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      provider: 'mock',
      publisher: article.publisher,
      title: article.title,
      originalUrl: url,
      canonicalUrl: url,
      normalizedUrl: normaliseUrl(url),
      publishedAt,
      author: null,
      language: article.language ?? 'en',
      excerpt: article.excerpt,
      sourceTier: article.tier,
      titleHash: titleHash(article.title),
      contentHash: contentHash(article.title, article.excerpt),
      processedAt: nowIso,
      scanRunId: 'mock-scan-run',
      createdAt: publishedAt,
      updatedAt: nowIso,
    };
  });
}

function buildHighlights(spec: MockIncidentSpec): IncidentHighlight[] {
  return spec.highlights.map((text, index) => ({
    id: `mock-highlight-${spec.key}-${index + 1}`,
    text,
    position: index,
    sourceArticleId: `mock-article-${spec.key}-${Math.min(index, spec.articles.length - 1) + 1}`,
  }));
}

/** Materialises one spec into a full `IncidentDetail` relative to `now`. */
export function buildMockIncident(spec: MockIncidentSpec, now: Date): IncidentDetail {
  const incidentDate = toIsoDate(addDays(now, -spec.daysAgo));
  const incidentIso = `${incidentDate}T${spec.incidentTime ?? '09:00'}:00.000Z`;
  const nowIso = now.toISOString();
  const articles = buildArticles(spec, incidentIso, nowIso);
  const tiers = articles.map((article) => article.sourceTier);
  const highestSourceTier = tiers.reduce<SourceTier>((best, tier) => (tier < best ? tier : best), 5);
  const lastPublished = articles.reduce<string>(
    (latest, article) => (article.publishedAt !== null && article.publishedAt > latest ? article.publishedAt : latest),
    incidentIso,
  );

  return {
    id: `mock-incident-${spec.key}`,
    title: spec.title,
    summary: spec.summary,
    incidentDate,
    incidentTime: spec.incidentTime ?? null,
    incidentDateIsEstimated: false,
    detectedAt: new Date(Date.parse(incidentIso) + 3 * 3_600_000).toISOString(),
    lastUpdatedAt: lastPublished,
    country: spec.country,
    countryCode: spec.countryCode,
    region: spec.region ?? null,
    city: spec.city ?? null,
    basin: spec.basin ?? null,
    block: spec.block ?? null,
    field: spec.field ?? null,
    latitude: spec.latitude ?? null,
    longitude: spec.longitude ?? null,
    operator: spec.operator,
    company: spec.company ?? null,
    licenceHolder: null,
    drillingContractor: spec.drillingContractor ?? null,
    serviceCompany: spec.serviceCompany ?? null,
    pipelineOperator: spec.pipelineOperator ?? null,
    asset: spec.asset ?? null,
    installation: spec.installation ?? null,
    installationType: spec.installationType ?? null,
    vessel: spec.vessel ?? null,
    wellName: spec.wellName ?? null,
    wellNumber: spec.wellNumber ?? null,
    wellType: spec.wellType ?? null,
    wellStatus: spec.wellStatus ?? null,
    oilGasSector: spec.oilGasSector,
    environment: spec.environment,
    waterDepthCategory: null,
    lifecycleStage: spec.lifecycleStage,
    incidentType: spec.incidentType,
    secondaryIncidentTypes: [...(spec.secondaryIncidentTypes ?? [])],
    isWellIntegrityRelated: spec.isWellIntegrityRelated ?? null,
    wellIntegrityCategory: spec.wellIntegrityCategory ?? null,
    suspectedFailedComponent: spec.suspectedFailedComponent ?? null,
    barrierFunctionImpacted: spec.barrierFunctionImpacted ?? null,
    isProcessSafetyEvent: spec.isProcessSafetyEvent ?? null,
    processSafetyCategory: spec.processSafetyCategory ?? null,
    severity: spec.severity,
    severityScore: spec.severityScore,
    confidence: spec.confidence,
    confidenceScore: spec.confidenceScore,
    relevanceScore: spec.relevanceScore,
    consequences: { ...EMPTY_CONSEQUENCES, ...spec.consequences },
    status: spec.status ?? 'new',
    sourceCount: articles.length,
    highestSourceTier,
    hasOfficialSource: highestSourceTier === 1,
    isMock: true,
    createdAt: incidentIso,
    updatedAt: nowIso,
    highlights: buildHighlights(spec),
    articles,
    entities: [],
    evidence: [],
    userState: 'new',
  };
}
