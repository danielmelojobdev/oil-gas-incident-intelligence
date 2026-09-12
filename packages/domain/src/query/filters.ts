/**
 * Filtering, sorting and aggregation shared by both database adapters.
 *
 * Keeping this in one place means the memory adapter and the Postgres adapter cannot
 * drift apart in what "Critical + Offshore + last 7 days" means.
 */
import { PRODUCT } from '../config/defaults';
import {
  addDays,
  effectiveFilterDate,
  isWithinWindow,
  resolveExplicitWindow,
  toIsoDate,
} from '../time/periods';
import { foldCase } from '../text/normalise';
import { label } from '../taxonomy';
import type {
  CountBucket,
  Dashboard,
  Incident,
  IncidentDetail,
  IncidentFilters,
  IncidentSummaryCard,
} from '../schemas';
import type { FeedFilter, UserIncidentState } from '../taxonomy';

/** Quick-filter chips translate to predicates over the incident. */
const FEED_FILTER_PREDICATES: Readonly<Record<FeedFilter, (incident: Incident) => boolean>> = {
  all: () => true,
  critical: (incident) => incident.severity === 'critical',
  well_integrity: (incident) => incident.isWellIntegrityRelated === true,
  well_control: (incident) =>
    incident.incidentType === 'well_control' ||
    incident.incidentType === 'blowout' ||
    incident.wellIntegrityCategory === 'well_control' ||
    incident.consequences.wellControlEvent === true,
  offshore: (incident) => incident.environment === 'offshore' || incident.environment === 'subsea',
  drilling: (incident) => incident.lifecycleStage === 'drilling' || incident.lifecycleStage === 'completion',
  production: (incident) => incident.lifecycleStage === 'production' || incident.lifecycleStage === 'injection',
  pipeline: (incident) =>
    incident.installationType === 'pipeline' ||
    incident.incidentType === 'pipeline_leak' ||
    incident.incidentType === 'pipeline_rupture',
  refinery: (incident) => incident.installationType === 'refinery',
  lng: (incident) => incident.installationType === 'lng_facility',
  fire: (incident) => incident.incidentType === 'fire' || incident.secondaryIncidentTypes.includes('fire'),
  explosion: (incident) =>
    incident.incidentType === 'explosion' || incident.secondaryIncidentTypes.includes('explosion'),
  leak_release: (incident) =>
    ['gas_leak', 'oil_leak', 'hydrocarbon_release', 'loss_of_containment', 'toxic_gas_release', 'pipeline_leak'].includes(
      incident.incidentType,
    ),
  spill: (incident) => incident.incidentType === 'oil_spill' || incident.consequences.spill === true,
};

function matchesText(incident: Incident, query: string): boolean {
  const needle = foldCase(query);
  const haystack = foldCase(
    [
      incident.title,
      incident.summary,
      incident.operator,
      incident.company,
      incident.asset,
      incident.installation,
      incident.field,
      incident.wellName,
      incident.country,
      incident.region,
      incident.city,
      incident.incidentType,
    ]
      .filter((value) => value !== null && value !== undefined)
      .join(' '),
  );
  return needle.split(/\s+/).filter((token) => token.length > 0).every((token) => haystack.includes(token));
}

function includesAny<T>(selected: readonly T[], value: T): boolean {
  return selected.length === 0 || selected.includes(value);
}

const SEVERITY_ORDER = { low: 0, moderate: 1, high: 2, critical: 3 } as const;

export function applyIncidentFilters(
  incidents: readonly IncidentDetail[],
  filters: IncidentFilters,
  now: Date,
  userStates: ReadonlyMap<string, UserIncidentState> = new Map(),
): IncidentDetail[] {
  const window = resolveExplicitWindow(filters.from, filters.to, filters.period, now, filters.dateAxis);
  const feedPredicate = FEED_FILTER_PREDICATES[filters.feedFilter];

  return incidents.filter((incident) => {
    const articleDate = incident.articles[0]?.publishedAt ?? null;
    const { date } = effectiveFilterDate(incident.incidentDate, articleDate, filters.dateAxis);
    if (window.fromDate !== null && !isWithinWindow(date, window)) return false;

    if (!feedPredicate(incident)) return false;
    if (filters.query !== null && filters.query.trim() !== '' && !matchesText(incident, filters.query)) return false;
    if (!includesAny(filters.sectors, incident.oilGasSector)) return false;
    if (!includesAny(filters.severities, incident.severity)) return false;
    if (!includesAny(filters.confidences, incident.confidence)) return false;
    if (!includesAny(filters.environments, incident.environment)) return false;
    if (!includesAny(filters.lifecycleStages, incident.lifecycleStage)) return false;
    if (!includesAny(filters.incidentTypes, incident.incidentType)) return false;

    if (filters.countries.length > 0) {
      const country = foldCase(incident.country ?? '');
      if (!filters.countries.some((value) => foldCase(value) === country)) return false;
    }
    if (filters.operators.length > 0) {
      const operator = foldCase(incident.operator ?? '');
      if (!filters.operators.some((value) => operator.includes(foldCase(value)))) return false;
    }
    if (filters.wellIntegrityOnly && incident.isWellIntegrityRelated !== true) return false;
    if (filters.processSafetyOnly && incident.isProcessSafetyEvent !== true) return false;
    if (incident.relevanceScore < filters.minRelevance) return false;

    const state = userStates.get(incident.id) ?? 'new';
    if (filters.states.length > 0 && !filters.states.includes(state)) return false;
    if (!filters.includeArchived && filters.states.length === 0 && state === 'archived') return false;

    return true;
  });
}

export function sortIncidents(incidents: IncidentDetail[], sort: IncidentFilters['sort']): IncidentDetail[] {
  const sorted = [...incidents];
  switch (sort) {
    case 'detected_at_desc':
      sorted.sort((a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt));
      break;
    case 'severity_desc':
      sorted.sort(
        (a, b) =>
          SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] ||
          b.severityScore - a.severityScore ||
          (b.incidentDate ?? '').localeCompare(a.incidentDate ?? ''),
      );
      break;
    case 'relevance_desc':
      sorted.sort((a, b) => b.relevanceScore - a.relevanceScore);
      break;
    case 'incident_date_desc':
    default:
      sorted.sort(
        (a, b) =>
          (b.incidentDate ?? '').localeCompare(a.incidentDate ?? '') ||
          Date.parse(b.lastUpdatedAt) - Date.parse(a.lastUpdatedAt),
      );
      break;
  }
  return sorted;
}

export function toSummaryCard(incident: IncidentDetail): IncidentSummaryCard {
  return {
    id: incident.id,
    title: incident.title,
    summary: incident.summary,
    incidentDate: incident.incidentDate,
    country: incident.country,
    operator: incident.operator,
    asset: incident.asset,
    incidentType: incident.incidentType,
    environment: incident.environment,
    oilGasSector: incident.oilGasSector,
    severity: incident.severity,
    confidence: incident.confidence,
    sourceCount: incident.sourceCount,
    status: incident.status,
    lastUpdatedAt: incident.lastUpdatedAt,
    detectedAt: incident.detectedAt,
    isWellIntegrityRelated: incident.isWellIntegrityRelated,
    isMock: incident.isMock,
    relevanceScore: incident.relevanceScore,
  };
}

function topBuckets(
  incidents: readonly IncidentDetail[],
  pick: (incident: IncidentDetail) => string | null,
  limit: number,
  labelise: (key: string) => string = label,
): CountBucket[] {
  const counts = new Map<string, number>();
  for (const incident of incidents) {
    const key = pick(incident);
    if (key === null || key === '') continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([key, count]) => ({ key, label: labelise(key), count }));
}

/**
 * Builds the dashboard.
 *
 * The counts are explicitly "incidents detected by this system from the sources it
 * monitors" (brief section 43) — never presented as an industry accident rate. The
 * caveat travels with the data, in `PRODUCT.dataCaveat`.
 */
export function buildDashboard(incidents: readonly IncidentDetail[], now: Date): Dashboard {
  const today = toIsoDate(now);
  const last7 = toIsoDate(addDays(now, -7));
  const last30 = toIsoDate(addDays(now, -30));

  const inWindow = (incident: IncidentDetail, from: string): boolean =>
    incident.incidentDate !== null && incident.incidentDate >= from && incident.incidentDate <= today;

  const recent = incidents.filter((incident) => inWindow(incident, last30));

  const trend: { date: string; count: number }[] = [];
  for (let offset = 29; offset >= 0; offset -= 1) {
    const date = toIsoDate(addDays(now, -offset));
    trend.push({ date, count: recent.filter((incident) => incident.incidentDate === date).length });
  }

  return {
    generatedAt: now.toISOString(),
    incidentsToday: incidents.filter((incident) => incident.incidentDate === today).length,
    incidentsLast7Days: incidents.filter((incident) => inWindow(incident, last7)).length,
    incidentsLast30Days: recent.length,
    criticalIncidents: recent.filter((incident) => incident.severity === 'critical').length,
    highSeverityIncidents: recent.filter((incident) => incident.severity === 'high').length,
    offshoreIncidents: recent.filter(
      (incident) => incident.environment === 'offshore' || incident.environment === 'subsea',
    ).length,
    onshoreIncidents: recent.filter((incident) => incident.environment === 'onshore').length,
    wellIntegrityIncidents: recent.filter((incident) => incident.isWellIntegrityRelated === true).length,
    wellControlIncidents: recent.filter(
      (incident) =>
        incident.incidentType === 'well_control' ||
        incident.incidentType === 'blowout' ||
        incident.wellIntegrityCategory === 'well_control',
    ).length,
    lossOfContainmentIncidents: recent.filter(
      (incident) =>
        incident.incidentType === 'loss_of_containment' ||
        incident.processSafetyCategory === 'loss_of_primary_containment' ||
        incident.wellIntegrityCategory === 'loss_of_containment',
    ).length,
    topOperators: topBuckets(recent, (incident) => incident.operator, 8, (key) => key),
    topCountries: topBuckets(recent, (incident) => incident.country, 8, (key) => key),
    topIncidentTypes: topBuckets(recent, (incident) => incident.incidentType, 8),
    bySector: topBuckets(recent, (incident) => incident.oilGasSector, 5),
    byLifecycleStage: topBuckets(recent, (incident) => incident.lifecycleStage, 11),
    bySeverity: (['critical', 'high', 'moderate', 'low'] as const).map((severity) => ({
      key: severity,
      label: label(severity),
      count: recent.filter((incident) => incident.severity === severity).length,
    })),
    trend,
    isMock: recent.length > 0 && recent.every((incident) => incident.isMock),
  };
}

export const DASHBOARD_CAVEAT = PRODUCT.dataCaveat;
