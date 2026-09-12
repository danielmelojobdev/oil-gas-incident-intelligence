/**
 * Canonical Oil & Gas taxonomy.
 *
 * This file is the single source of truth for every enumerated value in the product.
 * The database mirrors these lists with CHECK constraints (see supabase/migrations),
 * and the Zod schemas in `schemas.ts` are derived from them — never hand-written twice.
 */

export const OIL_GAS_SECTORS = ['upstream', 'midstream', 'downstream', 'integrated', 'unknown'] as const;
export type OilGasSector = (typeof OIL_GAS_SECTORS)[number];

export const ENVIRONMENTS = ['offshore', 'onshore', 'subsea', 'unknown'] as const;
export type IncidentEnvironment = (typeof ENVIRONMENTS)[number];

/** Only ever set when a reliable source states it. Never inferred from "offshore". */
export const WATER_DEPTH_CATEGORIES = ['shallow_water', 'deepwater', 'ultra_deepwater', 'unknown'] as const;
export type WaterDepthCategory = (typeof WATER_DEPTH_CATEGORIES)[number];

export const LIFECYCLE_STAGES = [
  'design',
  'drilling',
  'completion',
  'commissioning',
  'production',
  'injection',
  'intervention',
  'workover',
  'suspension',
  'p_and_a',
  'unknown',
] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export const INSTALLATION_TYPES = [
  'fixed_platform',
  'jack_up',
  'semi_submersible',
  'drillship',
  'fpso',
  'fso',
  'tlp',
  'spar',
  'wellhead_platform',
  'subsea_installation',
  'refinery',
  'pipeline',
  'terminal',
  'lng_facility',
  'gas_processing_plant',
  'compressor_station',
  'storage_facility',
  'unknown',
] as const;
export type InstallationType = (typeof INSTALLATION_TYPES)[number];

export const WELL_TYPES = [
  'producer',
  'injector',
  'exploration',
  'appraisal',
  'development',
  'disposal',
  'gas_storage',
  'unknown',
] as const;
export type WellType = (typeof WELL_TYPES)[number];

export const WELL_STATUSES = [
  'drilling',
  'completion',
  'production',
  'injection',
  'intervention',
  'workover',
  'suspended',
  'abandoned',
  'p_and_a',
  'unknown',
] as const;
export type WellStatus = (typeof WELL_STATUSES)[number];

export const INCIDENT_TYPES = [
  'fire',
  'explosion',
  'blowout',
  'well_control',
  'well_integrity',
  'gas_leak',
  'oil_leak',
  'hydrocarbon_release',
  'toxic_gas_release',
  'loss_of_containment',
  'oil_spill',
  'pipeline_leak',
  'pipeline_rupture',
  'structural_failure',
  'equipment_failure',
  'emergency_shutdown',
  'production_shutdown',
  'evacuation',
  'marine_incident',
  'vessel_collision',
  'helicopter_incident',
  'crane_incident',
  'dropped_object',
  'fatality',
  'injury',
  'environmental_event',
  'process_safety_event',
  'other',
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const WELL_INTEGRITY_CATEGORIES = [
  'primary_barrier_failure',
  'secondary_barrier_failure',
  'multiple_barrier_failure',
  'well_control',
  'bop',
  'wellhead',
  'christmas_tree',
  'tubing',
  'casing',
  'cement',
  'packer',
  'annulus',
  'dhsv_scssv',
  'subsea_safety_system',
  'integrity_monitoring',
  'loss_of_containment',
  'structural_integrity',
  'unknown',
] as const;
export type WellIntegrityCategory = (typeof WELL_INTEGRITY_CATEGORIES)[number];

export const BARRIER_FUNCTIONS = ['primary', 'secondary', 'both', 'unknown'] as const;
export type BarrierFunction = (typeof BARRIER_FUNCTIONS)[number];

export const PROCESS_SAFETY_CATEGORIES = [
  'loss_of_primary_containment',
  'hydrocarbon_release',
  'fire',
  'explosion',
  'toxic_gas_release',
  'spill',
  'overpressure',
  'emergency_shutdown',
  'structural_failure',
  'unknown',
] as const;
export type ProcessSafetyCategory = (typeof PROCESS_SAFETY_CATEGORIES)[number];

export const SEVERITIES = ['low', 'moderate', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

/** 1 = regulator / official, 5 = unverified. Drives the confidence score. */
export const SOURCE_TIERS = [1, 2, 3, 4, 5] as const;
export type SourceTier = (typeof SOURCE_TIERS)[number];

export const INCIDENT_STATUSES = ['new', 'updated', 'monitoring', 'under_review', 'archived'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

/** Per-user read/interaction state, kept separate from the incident's own lifecycle. */
export const USER_INCIDENT_STATES = ['new', 'read', 'saved', 'archived', 'monitoring'] as const;
export type UserIncidentState = (typeof USER_INCIDENT_STATES)[number];

export const SEARCH_PERIODS = ['today', 'last_7_days', 'last_14_days', 'last_30_days', 'all_time'] as const;
export type SearchPeriod = (typeof SEARCH_PERIODS)[number];

export const DATE_AXES = ['incident_date', 'published_at'] as const;
export type DateAxis = (typeof DATE_AXES)[number];

export const REGIONS = [
  'worldwide',
  'united_kingdom',
  'brazil',
  'united_states',
  'norway',
  'europe',
  'middle_east',
  'africa',
  'asia_pacific',
  'latin_america',
  'north_america',
  'custom',
] as const;
export type Region = (typeof REGIONS)[number];

export const LANGUAGES = ['en', 'pt', 'es', 'fr', 'no'] as const;
export type LanguageCode = (typeof LANGUAGES)[number];

export const SCAN_STATUSES = ['queued', 'running', 'completed', 'failed', 'partial'] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export const SCAN_TRIGGERS = ['scheduled', 'manual', 'backfill'] as const;
export type ScanTrigger = (typeof SCAN_TRIGGERS)[number];

export const SCAN_FREQUENCIES = ['hourly', 'every-3-hours', 'every-6-hours', 'daily', 'off'] as const;
export type ScanFrequency = (typeof SCAN_FREQUENCIES)[number];

export const ENTITY_TYPES = [
  'operator',
  'company',
  'licence_holder',
  'drilling_contractor',
  'service_company',
  'pipeline_operator',
  'asset',
  'installation',
  'field',
  'well',
  'vessel',
  'regulator',
  'location',
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const PROVIDER_KINDS = ['search', 'feed', 'regulator', 'mock'] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

/** Quick-filter chips shown on the Home feed (§33). */
export const FEED_FILTERS = [
  'all',
  'critical',
  'well_integrity',
  'well_control',
  'offshore',
  'drilling',
  'production',
  'pipeline',
  'refinery',
  'lng',
  'fire',
  'explosion',
  'leak_release',
  'spill',
] as const;
export type FeedFilter = (typeof FEED_FILTERS)[number];

// ---------------------------------------------------------------------------
// Human-readable labels (UI + PDF). Kept next to the taxonomy so a new value
// cannot be added without also giving it a label.
// ---------------------------------------------------------------------------

/**
 * Words that must be rendered in full caps. An explicit list, because a
 * "short words are acronyms" heuristic turns "gas leak" into "GAS Leak".
 */
const ACRONYMS = new Set([
  'bop', 'fpso', 'fso', 'tlp', 'spar', 'lng', 'dhsv', 'scssv', 'h2s',
  'esd', 'psa', 'anp', 'hse', 'uk', 'us', 'usa', 'uae', 'p&a',
]);

function titleCase(value: string): string {
  return value
    .split('_')
    .map((part) =>
      ACRONYMS.has(part.toLowerCase())
        ? part.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(' ');
}

const LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  unknown: 'Unknown',
  p_and_a: 'P&A',
  dhsv_scssv: 'DHSV / SCSSV',
  bop: 'BOP',
  fpso: 'FPSO',
  fso: 'FSO',
  tlp: 'TLP',
  spar: 'SPAR',
  lng: 'LNG',
  lng_facility: 'LNG Facility',
  jack_up: 'Jack-up',
  semi_submersible: 'Semi-submersible',
  christmas_tree: 'Christmas Tree',
  oil_gas_sector: 'Oil & Gas Sector',
  leak_release: 'Leak / Release',
  loss_of_containment: 'Loss of Containment',
  loss_of_primary_containment: 'Loss of Primary Containment',
  us: 'US',
  united_kingdom: 'United Kingdom',
  united_states: 'United States',
  asia_pacific: 'Asia-Pacific',
  middle_east: 'Middle East',
  latin_america: 'Latin America',
  north_america: 'North America',
  last_7_days: 'Last 7 Days',
  last_14_days: 'Last 14 Days',
  last_30_days: 'Last 30 Days',
  all_time: 'All Time',
  today: 'Today',
  shallow_water: 'Shallow Water',
  deepwater: 'Deepwater',
  ultra_deepwater: 'Ultra-deepwater',
  incident_date: 'Incident Date',
  published_at: 'Publication Date',
};

/** Turns any taxonomy value into a display label. */
export function label(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'Not reported';
  const override = LABEL_OVERRIDES[value];
  if (override !== undefined) return override;
  return titleCase(value);
}

export const SOURCE_TIER_LABELS: Readonly<Record<SourceTier, string>> = {
  1: 'Tier 1 — Official regulator / government / operator statement',
  2: 'Tier 2 — Major international news organisation',
  3: 'Tier 3 — Recognised Oil & Gas publication',
  4: 'Tier 4 — Regional / local media',
  5: 'Tier 5 — Low-authority or unverified source',
};

export const SOURCE_TIER_SHORT_LABELS: Readonly<Record<SourceTier, string>> = {
  1: 'Official',
  2: 'Major news',
  3: 'Industry press',
  4: 'Regional',
  5: 'Unverified',
};

export const LANGUAGE_LABELS: Readonly<Record<LanguageCode, string>> = {
  en: 'English',
  pt: 'Portuguese',
  es: 'Spanish',
  fr: 'French',
  no: 'Norwegian',
};
