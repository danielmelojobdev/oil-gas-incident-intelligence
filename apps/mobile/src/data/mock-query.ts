/**
 * Thin adapters over the shared domain query helpers.
 *
 * The filtering, sorting and aggregation rules live in `@ogii/domain` so the app and
 * the backend can never disagree about what "Critical + Offshore + last 7 days" means.
 */
import {
  applyIncidentFilters,
  buildDashboard,
  sortIncidents,
  toSummaryCard,
  SOURCE_TIER_LABELS,
  type Dashboard,
  type IncidentDetail,
  type IncidentFilters,
  type IncidentSummaryCard,
  type NewsSource,
  type UserIncidentState,
} from '@ogii/domain';

export { toSummaryCard as toCard };

export function applyMockFilters(
  incidents: readonly IncidentDetail[],
  filters: IncidentFilters,
  now: Date,
  states: Record<string, UserIncidentState>,
): IncidentDetail[] {
  return sortIncidents(applyIncidentFilters(incidents, filters, now, new Map(Object.entries(states))), filters.sort);
}

export function buildMockDashboard(incidents: readonly IncidentDetail[], now: Date): Dashboard {
  return buildDashboard(incidents, now);
}

export type { IncidentSummaryCard };

/**
 * The source catalogue shown in Settings > Sources while running offline.
 * Mirrors the backend catalogue; the real list comes from `GET /v1/sources`.
 */
const CATALOGUE: readonly [string, string, 1 | 2 | 3 | 4 | 5, string | null, boolean][] = [
  ['uk-hse', 'UK Health and Safety Executive', 1, 'United Kingdom', true],
  ['uk-hse-offshore', 'UK HSE — Offshore Major Accident Regulator', 1, 'United Kingdom', true],
  ['uk-nsta', 'North Sea Transition Authority', 1, 'United Kingdom', true],
  ['no-havtil', 'Havtil (Norwegian Ocean Industry Authority)', 1, 'Norway', true],
  ['no-sodir', 'Norwegian Offshore Directorate', 1, 'Norway', true],
  ['br-anp', 'ANP — Agência Nacional do Petróleo', 1, 'Brazil', true],
  ['us-bsee', 'BSEE', 1, 'United States', true],
  ['us-phmsa', 'PHMSA', 1, 'United States', true],
  ['us-csb', 'US Chemical Safety Board', 1, 'United States', true],
  ['au-nopsema', 'NOPSEMA', 1, 'Australia', true],
  ['ca-tsb', 'Transportation Safety Board of Canada', 1, 'Canada', true],
  ['reuters-energy', 'Reuters — Energy', 2, null, false],
  ['bloomberg-energy', 'Bloomberg — Energy', 2, null, false],
  ['bbc-business', 'BBC News — Business', 2, 'United Kingdom', false],
  ['ap-news', 'Associated Press', 2, null, false],
  ['offshore-energy', 'Offshore Energy', 3, null, false],
  ['offshore-magazine', 'Offshore Magazine', 3, null, false],
  ['upstream-online', 'Upstream', 3, null, false],
  ['energy-voice', 'Energy Voice', 3, null, false],
  ['world-oil', 'World Oil', 3, null, false],
  ['ogj', 'Oil & Gas Journal', 3, null, false],
  ['rigzone', 'Rigzone', 3, null, false],
  ['spglobal-ci', 'S&P Global Commodity Insights', 3, null, false],
  ['petronoticias', 'Petronotícias', 3, 'Brazil', false],
  ['epbr', 'agência epbr', 3, 'Brazil', false],
];

export function mockSources(): NewsSource[] {
  return CATALOGUE.map(([id, name, tier, country, isOfficial]) => ({
    id,
    name,
    homepage: null,
    feedUrl: null,
    provider: 'mock',
    kind: isOfficial ? ('regulator' as const) : ('feed' as const),
    tier,
    country,
    language: null,
    isOfficial,
    enabled: true,
    lastFetchedAt: null,
    lastStatus: null,
  }));
}

export { SOURCE_TIER_LABELS };
