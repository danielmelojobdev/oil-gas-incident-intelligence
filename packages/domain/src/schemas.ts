/**
 * Zod schemas — the only trust boundary that matters.
 *
 * Everything that crosses a boundary (HTTP request, provider response, AI response,
 * database row) is parsed here. Nothing is cast with `as`.
 */
import { z } from 'zod';
import {
  BARRIER_FUNCTIONS,
  CONFIDENCE_LEVELS,
  DATE_AXES,
  ENTITY_TYPES,
  ENVIRONMENTS,
  FEED_FILTERS,
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
  INSTALLATION_TYPES,
  LANGUAGES,
  LIFECYCLE_STAGES,
  OIL_GAS_SECTORS,
  PROCESS_SAFETY_CATEGORIES,
  PROVIDER_KINDS,
  REGIONS,
  SCAN_STATUSES,
  SCAN_TRIGGERS,
  SEARCH_PERIODS,
  SEVERITIES,
  USER_INCIDENT_STATES,
  WATER_DEPTH_CATEGORIES,
  WELL_INTEGRITY_CATEGORIES,
  WELL_STATUSES,
  WELL_TYPES,
} from './taxonomy';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** ISO-8601 date, `YYYY-MM-DD`. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'invalid calendar date');

/** ISO-8601 instant. */
export const isoDateTimeSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'invalid ISO-8601 date-time');

/** `HH:MM` in 24h local time at the incident location, when a source states it. */
export const isoTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM');

export const httpUrlSchema = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), 'only http(s) URLs are allowed')
  .refine((value) => !value.includes('@') || !/^https?:\/\/[^/]*@/i.test(value), 'credentials in URL are not allowed');

/** ISO-3166 alpha-2, uppercase. */
export const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/, 'expected ISO-3166 alpha-2');

export const scoreSchema = z.number().min(0).max(100);
export const unitIntervalSchema = z.number().min(0).max(1);

/**
 * A count that the sources may simply not report.
 * `null` = not reported. `0` = a source explicitly said zero. They are never interchangeable.
 */
export const reportedCountSchema = z.number().int().min(0).nullable();

export const sourceTierSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

const enumOf = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values);

export const oilGasSectorSchema = enumOf(OIL_GAS_SECTORS);
export const environmentSchema = enumOf(ENVIRONMENTS);
export const waterDepthCategorySchema = enumOf(WATER_DEPTH_CATEGORIES);
export const lifecycleStageSchema = enumOf(LIFECYCLE_STAGES);
export const installationTypeSchema = enumOf(INSTALLATION_TYPES);
export const wellTypeSchema = enumOf(WELL_TYPES);
export const wellStatusSchema = enumOf(WELL_STATUSES);
export const incidentTypeSchema = enumOf(INCIDENT_TYPES);
export const wellIntegrityCategorySchema = enumOf(WELL_INTEGRITY_CATEGORIES);
export const barrierFunctionSchema = enumOf(BARRIER_FUNCTIONS);
export const processSafetyCategorySchema = enumOf(PROCESS_SAFETY_CATEGORIES);
export const severitySchema = enumOf(SEVERITIES);
export const confidenceLevelSchema = enumOf(CONFIDENCE_LEVELS);
export const incidentStatusSchema = enumOf(INCIDENT_STATUSES);
export const userIncidentStateSchema = enumOf(USER_INCIDENT_STATES);
export const searchPeriodSchema = enumOf(SEARCH_PERIODS);
export const dateAxisSchema = enumOf(DATE_AXES);
export const regionSchema = enumOf(REGIONS);
export const languageSchema = enumOf(LANGUAGES);
export const scanStatusSchema = enumOf(SCAN_STATUSES);
export const scanTriggerSchema = enumOf(SCAN_TRIGGERS);
export const entityTypeSchema = enumOf(ENTITY_TYPES);
export const providerKindSchema = enumOf(PROVIDER_KINDS);
export const feedFilterSchema = enumOf(FEED_FILTERS);

// ---------------------------------------------------------------------------
// Article
// ---------------------------------------------------------------------------

/** A provider result before any enrichment. Providers must emit exactly this shape. */
export const rawArticleSchema = z.object({
  provider: z.string().min(1),
  publisher: z.string().min(1),
  title: z.string().min(1),
  url: httpUrlSchema,
  canonicalUrl: httpUrlSchema.nullable().default(null),
  publishedAt: isoDateTimeSchema.nullable().default(null),
  excerpt: z.string().nullable().default(null),
  author: z.string().nullable().default(null),
  language: languageSchema.nullable().default(null),
  /** Tier claimed by the provider/source catalogue; may be refined later. */
  sourceTier: sourceTierSchema.default(5),
  /** Free-form provider payload retained for debugging; never rendered to users. */
  raw: z.record(z.unknown()).optional(),
});
export type RawArticle = z.infer<typeof rawArticleSchema>;

export const articleSchema = z.object({
  id: z.string().min(1),
  incidentId: z.string().min(1).nullable(),
  sourceId: z.string().min(1).nullable(),
  provider: z.string().min(1),
  publisher: z.string().min(1),
  title: z.string().min(1),
  originalUrl: httpUrlSchema,
  canonicalUrl: httpUrlSchema.nullable(),
  normalizedUrl: z.string().min(1),
  publishedAt: isoDateTimeSchema.nullable(),
  author: z.string().nullable(),
  language: languageSchema.nullable(),
  /** Short excerpt as published by the feed. Full bodies are never stored (D7). */
  excerpt: z.string().nullable(),
  sourceTier: sourceTierSchema,
  titleHash: z.string().min(1),
  contentHash: z.string().min(1),
  processedAt: isoDateTimeSchema.nullable(),
  scanRunId: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Article = z.infer<typeof articleSchema>;

// ---------------------------------------------------------------------------
// Incident
// ---------------------------------------------------------------------------

export const incidentConsequencesSchema = z.object({
  fatalities: reportedCountSchema,
  injuries: reportedCountSchema,
  missingPersons: reportedCountSchema,
  evacuatedPersons: reportedCountSchema,
  hydrocarbonRelease: z.boolean().nullable(),
  environmentalImpact: z.string().nullable(),
  productionImpact: z.string().nullable(),
  productionInterruption: z.boolean().nullable(),
  shutdown: z.boolean().nullable(),
  assetDamage: z.string().nullable(),
  fire: z.boolean().nullable(),
  explosion: z.boolean().nullable(),
  spill: z.boolean().nullable(),
  leak: z.boolean().nullable(),
  wellControlEvent: z.boolean().nullable(),
});
export type IncidentConsequences = z.infer<typeof incidentConsequencesSchema>;

export const incidentHighlightSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  position: z.number().int().min(0),
  sourceArticleId: z.string().nullable(),
});
export type IncidentHighlight = z.infer<typeof incidentHighlightSchema>;

/** Per-field provenance (§27) — which article supports this value. */
export const incidentEvidenceSchema = z.object({
  id: z.string().min(1),
  field: z.string().min(1),
  value: z.string().nullable(),
  sourceArticleId: z.string().nullable(),
  quote: z.string().nullable(),
  confidence: unitIntervalSchema.nullable(),
});
export type IncidentEvidence = z.infer<typeof incidentEvidenceSchema>;

export const incidentEntitySchema = z.object({
  id: z.string().min(1),
  entityType: entityTypeSchema,
  name: z.string().min(1),
  normalizedName: z.string().min(1),
  sourceArticleId: z.string().nullable(),
});
export type IncidentEntity = z.infer<typeof incidentEntitySchema>;

export const incidentSchema = z.object({
  id: z.string().min(1),

  // Identification
  title: z.string().min(1),
  summary: z.string().nullable(),
  incidentDate: isoDateSchema.nullable(),
  incidentTime: isoTimeSchema.nullable(),
  /** True when incidentDate was derived from publication date rather than stated (D8). */
  incidentDateIsEstimated: z.boolean().default(false),
  detectedAt: isoDateTimeSchema,
  lastUpdatedAt: isoDateTimeSchema,

  // Location
  country: z.string().nullable(),
  countryCode: countryCodeSchema.nullable(),
  region: z.string().nullable(),
  city: z.string().nullable(),
  basin: z.string().nullable(),
  block: z.string().nullable(),
  field: z.string().nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),

  // Organisation
  operator: z.string().nullable(),
  company: z.string().nullable(),
  licenceHolder: z.string().nullable(),
  drillingContractor: z.string().nullable(),
  serviceCompany: z.string().nullable(),
  pipelineOperator: z.string().nullable(),

  // Asset
  asset: z.string().nullable(),
  installation: z.string().nullable(),
  installationType: installationTypeSchema.nullable(),
  vessel: z.string().nullable(),

  // Well
  wellName: z.string().nullable(),
  wellNumber: z.string().nullable(),
  wellType: wellTypeSchema.nullable(),
  wellStatus: wellStatusSchema.nullable(),

  // Classification
  oilGasSector: oilGasSectorSchema,
  environment: environmentSchema,
  waterDepthCategory: waterDepthCategorySchema.nullable(),
  lifecycleStage: lifecycleStageSchema,
  incidentType: incidentTypeSchema,
  secondaryIncidentTypes: z.array(incidentTypeSchema).default([]),

  // Well integrity (§23) — never inferred without evidence
  isWellIntegrityRelated: z.boolean().nullable(),
  wellIntegrityCategory: wellIntegrityCategorySchema.nullable(),
  suspectedFailedComponent: z.string().nullable(),
  barrierFunctionImpacted: barrierFunctionSchema.nullable(),

  // Process safety (§24)
  isProcessSafetyEvent: z.boolean().nullable(),
  processSafetyCategory: processSafetyCategorySchema.nullable(),

  // Assessment
  severity: severitySchema,
  severityScore: scoreSchema,
  confidence: confidenceLevelSchema,
  confidenceScore: scoreSchema,
  relevanceScore: scoreSchema,

  // Consequences
  consequences: incidentConsequencesSchema,

  // Lifecycle
  status: incidentStatusSchema,
  sourceCount: z.number().int().min(0),
  highestSourceTier: sourceTierSchema,
  hasOfficialSource: z.boolean(),
  isMock: z.boolean().default(false),

  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Incident = z.infer<typeof incidentSchema>;

export const incidentDetailSchema = incidentSchema.extend({
  highlights: z.array(incidentHighlightSchema),
  articles: z.array(articleSchema),
  entities: z.array(incidentEntitySchema).default([]),
  evidence: z.array(incidentEvidenceSchema).default([]),
  userState: userIncidentStateSchema.default('new'),
});
export type IncidentDetail = z.infer<typeof incidentDetailSchema>;

/** Compact shape used by the feed list. */
export const incidentSummaryCardSchema = incidentSchema.pick({
  id: true,
  title: true,
  summary: true,
  incidentDate: true,
  country: true,
  operator: true,
  asset: true,
  incidentType: true,
  environment: true,
  oilGasSector: true,
  severity: true,
  confidence: true,
  sourceCount: true,
  status: true,
  lastUpdatedAt: true,
  detectedAt: true,
  isWellIntegrityRelated: true,
  isMock: true,
  relevanceScore: true,
});
export type IncidentSummaryCard = z.infer<typeof incidentSummaryCardSchema>;

// ---------------------------------------------------------------------------
// AI contracts (§26) — validated before anything reaches the database
// ---------------------------------------------------------------------------

/**
 * A free-text field the model may not know.
 *
 * `null` always means "not reported". The sentinel strings models reach for when they
 * have nothing ("unknown", "N/A", "not reported", an empty string) are mapped to null
 * here, so a value like `operator: "Unknown"` can never be rendered to a user as if it
 * were the name of a company.
 */
const NOT_REPORTED_SENTINELS = new Set([
  'unknown', 'n/a', 'na', 'none', 'null', 'nil', 'undefined', 'not reported',
  'not specified', 'not available', 'not disclosed', 'undisclosed', 'unspecified',
  'tbd', 'tba', '-', '--',
]);

const nullableString = z
  .preprocess((value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' || NOT_REPORTED_SENTINELS.has(trimmed.toLowerCase()) ? null : trimmed;
  }, z.string().min(1).nullable())
  .catch(null);

export const oilGasRelevanceResultSchema = z.object({
  isOilAndGasRelated: z.boolean(),
  confidence: unitIntervalSchema,
  oilAndGasSector: oilGasSectorSchema,
  reason: z.string().min(1),
  /** Optional: the model's view of whether this is an incident at all. */
  isIncident: z.boolean().nullable().default(null),
});
export type OilGasRelevanceResult = z.infer<typeof oilGasRelevanceResultSchema>;

export const extractedIncidentSchema = z.object({
  isOilAndGasRelated: z.boolean(),
  oilAndGasSector: oilGasSectorSchema,
  confidence: unitIntervalSchema,

  title: z.string().min(1),
  summary: z.string().min(1),
  highlights: z.array(z.string().min(1)).max(12).default([]),

  incidentDate: isoDateSchema.nullable().catch(null),
  incidentTime: isoTimeSchema.nullable().catch(null),

  country: nullableString,
  countryCode: countryCodeSchema.nullable().catch(null),
  region: nullableString,
  city: nullableString,
  basin: nullableString,
  block: nullableString,
  field: nullableString,
  latitude: z.number().min(-90).max(90).nullable().catch(null),
  longitude: z.number().min(-180).max(180).nullable().catch(null),

  operator: nullableString,
  company: nullableString,
  licenceHolder: nullableString,
  drillingContractor: nullableString,
  serviceCompany: nullableString,
  pipelineOperator: nullableString,

  asset: nullableString,
  installation: nullableString,
  installationType: installationTypeSchema.nullable().catch(null),
  vessel: nullableString,

  wellName: nullableString,
  wellNumber: nullableString,
  wellType: wellTypeSchema.nullable().catch(null),
  wellStatus: wellStatusSchema.nullable().catch(null),

  environment: environmentSchema.default('unknown'),
  waterDepthCategory: waterDepthCategorySchema.nullable().catch(null),
  lifecycleStage: lifecycleStageSchema.default('unknown'),
  incidentType: incidentTypeSchema.default('other'),
  secondaryIncidentTypes: z.array(incidentTypeSchema).max(6).default([]),

  isWellIntegrityRelated: z.boolean().nullable().catch(null),
  wellIntegrityCategory: wellIntegrityCategorySchema.nullable().catch(null),
  suspectedFailedComponent: nullableString,
  barrierFunctionImpacted: barrierFunctionSchema.nullable().catch(null),

  isProcessSafetyEvent: z.boolean().nullable().catch(null),
  processSafetyCategory: processSafetyCategorySchema.nullable().catch(null),

  severity: severitySchema.default('low'),

  fatalities: reportedCountSchema.catch(null),
  injuries: reportedCountSchema.catch(null),
  missingPersons: reportedCountSchema.catch(null),
  evacuatedPersons: reportedCountSchema.catch(null),
  hydrocarbonRelease: z.boolean().nullable().catch(null),
  environmentalImpact: nullableString,
  productionImpact: nullableString,
  assetDamage: nullableString,
});
export type ExtractedIncident = z.infer<typeof extractedIncidentSchema>;

export const incidentSummaryResultSchema = z.object({
  summary: z.string().min(1),
  highlights: z.array(z.string().min(1)).min(1).max(12),
});
export type IncidentSummaryResult = z.infer<typeof incidentSummaryResultSchema>;

export const incidentSimilarityVerdictSchema = z.object({
  sameIncident: z.boolean(),
  confidence: unitIntervalSchema,
  reason: z.string().min(1),
});
export type IncidentSimilarityVerdict = z.infer<typeof incidentSimilarityVerdictSchema>;

export const materialUpdateVerdictSchema = z.object({
  isMaterialUpdate: z.boolean(),
  confidence: unitIntervalSchema,
  changeTypes: z.array(z.string().min(1)).max(12).default([]),
  reason: z.string().min(1),
  headline: z.string().min(1).nullable().catch(null),
});
export type MaterialUpdateVerdict = z.infer<typeof materialUpdateVerdictSchema>;

// ---------------------------------------------------------------------------
// Search / filtering
// ---------------------------------------------------------------------------

export const incidentFiltersSchema = z.object({
  period: searchPeriodSchema.default('last_30_days'),
  dateAxis: dateAxisSchema.default('incident_date'),
  from: isoDateSchema.nullable().default(null),
  to: isoDateSchema.nullable().default(null),
  query: z.string().trim().max(200).nullable().default(null),
  feedFilter: feedFilterSchema.default('all'),
  sectors: z.array(oilGasSectorSchema).default([]),
  severities: z.array(severitySchema).default([]),
  confidences: z.array(confidenceLevelSchema).default([]),
  countries: z.array(z.string().min(1)).default([]),
  operators: z.array(z.string().min(1)).default([]),
  environments: z.array(environmentSchema).default([]),
  lifecycleStages: z.array(lifecycleStageSchema).default([]),
  incidentTypes: z.array(incidentTypeSchema).default([]),
  wellIntegrityOnly: z.boolean().default(false),
  processSafetyOnly: z.boolean().default(false),
  states: z.array(userIncidentStateSchema).default([]),
  includeArchived: z.boolean().default(false),
  minRelevance: scoreSchema.default(0),
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().nullable().default(null),
  sort: z.enum(['incident_date_desc', 'detected_at_desc', 'severity_desc', 'relevance_desc']).default('incident_date_desc'),
});
export type IncidentFilters = z.infer<typeof incidentFiltersSchema>;

export const incidentPageSchema = z.object({
  items: z.array(incidentSummaryCardSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int().min(0),
});
export type IncidentPage = z.infer<typeof incidentPageSchema>;

// ---------------------------------------------------------------------------
// Scan configuration + runs
// ---------------------------------------------------------------------------

export const scanConfigSchema = z.object({
  period: searchPeriodSchema.default('last_30_days'),
  dateAxis: dateAxisSchema.default('incident_date'),
  regions: z.array(regionSchema).default(['worldwide']),
  customCountries: z.array(z.string().min(1)).default([]),
  languages: z.array(languageSchema).min(1).default(['en']),
  includeKeywords: z.array(z.string().min(1)).default([]),
  excludeKeywords: z.array(z.string().min(1)).default([]),
  maxQueries: z.number().int().min(1).max(500).default(40),
  maxResultsPerQuery: z.number().int().min(1).max(100).default(25),
  maxAiExtractions: z.number().int().min(0).max(500).default(40),
  relevanceThresholdFeed: scoreSchema.default(70),
  relevanceThresholdReview: scoreSchema.default(50),
  notifyMinConfidence: unitIntervalSchema.default(0.7),
});
export type ScanConfig = z.infer<typeof scanConfigSchema>;

export const scanProviderResultSchema = z.object({
  provider: z.string().min(1),
  queriesExecuted: z.number().int().min(0),
  resultsFound: z.number().int().min(0),
  durationMs: z.number().int().min(0),
  errorCount: z.number().int().min(0),
  retryCount: z.number().int().min(0),
  healthy: z.boolean(),
  errorMessage: z.string().nullable().default(null),
});
export type ScanProviderResult = z.infer<typeof scanProviderResultSchema>;

export const scanRunSchema = z.object({
  id: z.string().min(1),
  trigger: scanTriggerSchema,
  status: scanStatusSchema,
  startedAt: isoDateTimeSchema,
  finishedAt: isoDateTimeSchema.nullable(),
  durationMs: z.number().int().min(0).nullable(),
  providerCount: z.number().int().min(0),
  queriesGenerated: z.number().int().min(0),
  resultsFound: z.number().int().min(0),
  resultsRejected: z.number().int().min(0),
  articlesProcessed: z.number().int().min(0),
  duplicatesFound: z.number().int().min(0),
  newIncidents: z.number().int().min(0),
  updatedIncidents: z.number().int().min(0),
  notificationsSent: z.number().int().min(0),
  aiCalls: z.number().int().min(0),
  errors: z.array(z.string()).default([]),
  providerResults: z.array(scanProviderResultSchema).default([]),
  /** Human-readable pipeline stage for the Scan Now progress UI. */
  stage: z.string().nullable().default(null),
  progress: unitIntervalSchema.default(0),
  isMock: z.boolean().default(false),
});
export type ScanRun = z.infer<typeof scanRunSchema>;

// ---------------------------------------------------------------------------
// User-facing settings
// ---------------------------------------------------------------------------

export const notificationPreferencesSchema = z.object({
  enabled: z.boolean().default(true),
  sound: z.boolean().default(true),
  criticalOnly: z.boolean().default(false),
  minSeverity: severitySchema.default('moderate'),
  severities: z.array(severitySchema).default([]),
  incidentTypes: z.array(incidentTypeSchema).default([]),
  countries: z.array(z.string().min(1)).default([]),
  wellIntegrityAlerts: z.boolean().default(true),
  wellControlAlerts: z.boolean().default(true),
  quietHoursStart: isoTimeSchema.nullable().default(null),
  quietHoursEnd: isoTimeSchema.nullable().default(null),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export const userPreferencesSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  defaultPeriod: searchPeriodSchema.default('last_30_days'),
  defaultDateAxis: dateAxisSchema.default('incident_date'),
  regions: z.array(regionSchema).default(['worldwide']),
  customCountries: z.array(z.string().min(1)).default([]),
  languages: z.array(languageSchema).min(1).default(['en']),
  includeKeywords: z.array(z.string().min(1)).default([]),
  excludeKeywords: z.array(z.string().min(1)).default([]),
  notifications: notificationPreferencesSchema.default(notificationPreferencesSchema.parse({})),
  dataRetentionDays: z.number().int().min(30).max(3650).default(730),
});
export type UserPreferences = z.infer<typeof userPreferencesSchema>;

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export const countBucketSchema = z.object({ key: z.string(), label: z.string(), count: z.number().int().min(0) });
export type CountBucket = z.infer<typeof countBucketSchema>;

export const dashboardSchema = z.object({
  generatedAt: isoDateTimeSchema,
  incidentsToday: z.number().int().min(0),
  incidentsLast7Days: z.number().int().min(0),
  incidentsLast30Days: z.number().int().min(0),
  criticalIncidents: z.number().int().min(0),
  highSeverityIncidents: z.number().int().min(0),
  offshoreIncidents: z.number().int().min(0),
  onshoreIncidents: z.number().int().min(0),
  wellIntegrityIncidents: z.number().int().min(0),
  wellControlIncidents: z.number().int().min(0),
  lossOfContainmentIncidents: z.number().int().min(0),
  topOperators: z.array(countBucketSchema),
  topCountries: z.array(countBucketSchema),
  topIncidentTypes: z.array(countBucketSchema),
  bySector: z.array(countBucketSchema),
  byLifecycleStage: z.array(countBucketSchema),
  bySeverity: z.array(countBucketSchema),
  trend: z.array(z.object({ date: isoDateSchema, count: z.number().int().min(0) })),
  isMock: z.boolean().default(false),
});
export type Dashboard = z.infer<typeof dashboardSchema>;

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export const newsSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  homepage: httpUrlSchema.nullable(),
  feedUrl: httpUrlSchema.nullable(),
  provider: z.string().min(1),
  kind: providerKindSchema,
  tier: sourceTierSchema,
  country: z.string().nullable(),
  language: languageSchema.nullable(),
  isOfficial: z.boolean(),
  enabled: z.boolean(),
  lastFetchedAt: isoDateTimeSchema.nullable(),
  lastStatus: z.string().nullable(),
});
export type NewsSource = z.infer<typeof newsSourceSchema>;
