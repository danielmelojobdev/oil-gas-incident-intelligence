/**
 * OilGasSearchQueryGenerator (brief section 10).
 *
 * One giant query returns one giant pile of noise. Instead we generate many small,
 * specific queries across the cartesian-ish product of
 *   sector x incident type x asset type x region x language
 * and let the provider layer fan them out. Queries are deterministic (same config in,
 * same list out) so scans are reproducible and testable.
 */
import { getGlossary } from '../glossary';
import type { LanguageCode, OilGasSector, Region, SearchPeriod } from '../taxonomy';
import type { TimeWindow } from '../time/periods';

export interface SearchQuery {
  /** Stable identifier: same inputs produce the same id. */
  readonly id: string;
  readonly text: string;
  readonly language: LanguageCode;
  readonly region: Region;
  readonly country: string | null;
  readonly sector: OilGasSector;
  readonly category: QueryCategory;
  /** Higher runs first when the query budget is tight. */
  readonly priority: number;
  readonly window: TimeWindow;
}

export type QueryCategory =
  | 'core-incident'
  | 'asset-specific'
  | 'well-integrity'
  | 'well-control'
  | 'process-safety'
  | 'pipeline'
  | 'downstream'
  | 'regional'
  | 'user-keyword';

export interface QueryGeneratorConfig {
  readonly languages: readonly LanguageCode[];
  readonly regions: readonly Region[];
  readonly customCountries: readonly string[];
  readonly includeKeywords: readonly string[];
  readonly excludeKeywords: readonly string[];
  readonly maxQueries: number;
  readonly window: TimeWindow;
  readonly period: SearchPeriod;
}

/** Country hints appended to regional queries. */
const REGION_COUNTRIES: Readonly<Record<Region, readonly string[]>> = {
  worldwide: [],
  united_kingdom: ['United Kingdom', 'North Sea', 'Aberdeen'],
  brazil: ['Brazil', 'Bacia de Campos', 'Bacia de Santos'],
  united_states: ['United States', 'Gulf of Mexico', 'Texas', 'Permian'],
  norway: ['Norway', 'Norwegian Continental Shelf', 'Nordsjoen'],
  europe: ['Europe', 'North Sea', 'Netherlands', 'Denmark'],
  middle_east: ['Saudi Arabia', 'UAE', 'Iraq', 'Kuwait', 'Qatar', 'Oman'],
  africa: ['Nigeria', 'Angola', 'Ghana', 'Libya', 'Egypt', 'Mozambique'],
  asia_pacific: ['Australia', 'Malaysia', 'Indonesia', 'India', 'China'],
  latin_america: ['Mexico', 'Colombia', 'Argentina', 'Guyana', 'Venezuela'],
  north_america: ['United States', 'Canada', 'Gulf of Mexico', 'Alberta'],
  custom: [],
};

/** The core, highest-value English query set from the brief (section 10). */
const CORE_EN_QUERIES: readonly { text: string; category: QueryCategory; sector: OilGasSector; priority: number }[] = [
  { text: '"offshore platform" fire', category: 'core-incident', sector: 'upstream', priority: 100 },
  { text: '"drilling rig" accident', category: 'core-incident', sector: 'upstream', priority: 100 },
  { text: '"oil platform" explosion', category: 'core-incident', sector: 'upstream', priority: 100 },
  { text: '"gas platform" leak', category: 'core-incident', sector: 'upstream', priority: 95 },
  { text: '"well control" incident', category: 'well-control', sector: 'upstream', priority: 100 },
  { text: '"well integrity" incident', category: 'well-integrity', sector: 'upstream', priority: 100 },
  { text: '"BOP failure"', category: 'well-integrity', sector: 'upstream', priority: 95 },
  { text: 'blowout oil well', category: 'well-control', sector: 'upstream', priority: 95 },
  { text: '"hydrocarbon release" offshore', category: 'process-safety', sector: 'upstream', priority: 95 },
  { text: '"loss of containment" refinery', category: 'process-safety', sector: 'downstream', priority: 90 },
  { text: '"pipeline rupture" gas', category: 'pipeline', sector: 'midstream', priority: 90 },
  { text: '"pipeline explosion" oil', category: 'pipeline', sector: 'midstream', priority: 90 },
  { text: 'FPSO incident', category: 'asset-specific', sector: 'upstream', priority: 85 },
  { text: 'drillship incident', category: 'asset-specific', sector: 'upstream', priority: 80 },
  { text: '"oil spill" platform', category: 'core-incident', sector: 'upstream', priority: 85 },
  { text: '"gas leak" refinery', category: 'downstream', sector: 'downstream', priority: 85 },
  { text: '"refinery fire"', category: 'downstream', sector: 'downstream', priority: 90 },
  { text: '"refinery explosion"', category: 'downstream', sector: 'downstream', priority: 90 },
  { text: '"LNG terminal" incident', category: 'downstream', sector: 'downstream', priority: 80 },
  { text: '"LNG plant" fire', category: 'downstream', sector: 'downstream', priority: 80 },
  { text: '"gas processing plant" explosion', category: 'downstream', sector: 'downstream', priority: 80 },
  { text: '"compressor station" incident gas', category: 'pipeline', sector: 'midstream', priority: 75 },
  { text: '"oil terminal" fire', category: 'pipeline', sector: 'midstream', priority: 75 },
  { text: '"subsea" leak oil', category: 'asset-specific', sector: 'upstream', priority: 75 },
  { text: '"wellhead" failure oil', category: 'well-integrity', sector: 'upstream', priority: 75 },
  { text: '"christmas tree" failure well', category: 'well-integrity', sector: 'upstream', priority: 70 },
  { text: '"sustained casing pressure"', category: 'well-integrity', sector: 'upstream', priority: 70 },
  { text: '"emergency shutdown" platform oil', category: 'process-safety', sector: 'upstream', priority: 70 },
  { text: '"evacuated" "oil platform"', category: 'core-incident', sector: 'upstream', priority: 70 },
  { text: '"H2S release" oil gas', category: 'process-safety', sector: 'integrated', priority: 70 },
  { text: '"helicopter" offshore oil crash', category: 'core-incident', sector: 'upstream', priority: 65 },
  { text: '"dropped object" offshore rig', category: 'core-incident', sector: 'upstream', priority: 60 },
  { text: '"crane incident" offshore platform', category: 'core-incident', sector: 'upstream', priority: 60 },
];

function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

function makeQuery(
  text: string,
  language: LanguageCode,
  region: Region,
  country: string | null,
  sector: OilGasSector,
  category: QueryCategory,
  priority: number,
  window: TimeWindow,
): SearchQuery {
  return {
    id: `${language}:${region}:${slug(text)}`,
    text,
    language,
    region,
    country,
    sector,
    category,
    priority,
    window,
  };
}

/**
 * Generates a deterministic, de-duplicated, priority-ordered query plan.
 */
export function generateSearchQueries(config: QueryGeneratorConfig): SearchQuery[] {
  const queries = new Map<string, SearchQuery>();
  const regions = config.regions.length > 0 ? config.regions : (['worldwide'] as const);
  const addQuery = (query: SearchQuery): void => {
    if (!queries.has(query.id)) queries.set(query.id, query);
  };

  for (const language of config.languages) {
    const glossary = getGlossary(language);

    if (language === 'en') {
      for (const core of CORE_EN_QUERIES) {
        addQuery(
          makeQuery(core.text, 'en', 'worldwide', null, core.sector, core.category, core.priority, config.window),
        );
      }
    } else {
      // Native-language phrases, not translations of the English list.
      for (const [index, phrase] of glossary.searchPhrases.entries()) {
        addQuery(
          makeQuery(
            phrase,
            language,
            'worldwide',
            null,
            'unknown',
            'core-incident',
            90 - index,
            config.window,
          ),
        );
      }
    }

    // Well-integrity and well-control deserve dedicated coverage in every language.
    for (const [index, term] of glossary.wellTerms.slice(0, 6).entries()) {
      addQuery(
        makeQuery(
          `"${term}" ${glossary.eventTerms[0] ?? 'incident'}`,
          language,
          'worldwide',
          null,
          'upstream',
          'well-integrity',
          72 - index,
          config.window,
        ),
      );
    }

    // Asset-specific coverage.
    for (const [index, asset] of glossary.assetTerms.slice(0, 6).entries()) {
      addQuery(
        makeQuery(
          `"${asset}" ${glossary.eventTerms.includes('incident') ? 'incident' : (glossary.eventTerms[0] ?? 'incident')}`,
          language,
          'worldwide',
          null,
          'unknown',
          'asset-specific',
          66 - index,
          config.window,
        ),
      );
    }

    // Regional queries: pair the top native phrases with the region's country hints.
    for (const region of regions) {
      if (region === 'worldwide') continue;
      const countries = region === 'custom' ? config.customCountries : REGION_COUNTRIES[region];
      for (const country of countries.slice(0, 3)) {
        const seeds =
          language === 'en'
            ? ['oil platform incident', 'refinery fire', 'pipeline explosion', 'well control incident']
            : glossary.searchPhrases.slice(0, 3);
        for (const [index, seed] of seeds.entries()) {
          addQuery(
            makeQuery(
              `${seed} ${country}`,
              language,
              region,
              country,
              'unknown',
              'regional',
              64 - index,
              config.window,
            ),
          );
        }
      }
    }
  }

  // User include-keywords get their own high-priority queries, always anchored to the industry.
  for (const [index, keyword] of config.includeKeywords.entries()) {
    const anchored = /oil|gas|petro|well|rig|platform|refin|pipeline/i.test(keyword)
      ? keyword
      : `${keyword} (oil OR gas OR petroleum)`;
    addQuery(
      makeQuery(
        anchored,
        config.languages[0] ?? 'en',
        'worldwide',
        null,
        'unknown',
        'user-keyword',
        110 - index,
        config.window,
      ),
    );
  }

  return [...queries.values()]
    .sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : 1))
    .slice(0, Math.max(1, config.maxQueries));
}

/**
 * Renders a query for a specific provider syntax.
 * Most providers accept plain text with quoted phrases; the few that do not are handled
 * in their own adapter.
 */
export function renderQueryText(query: SearchQuery, excludeKeywords: readonly string[] = []): string {
  const exclusions = excludeKeywords
    .filter((keyword) => keyword.trim().length > 0)
    .slice(0, 6)
    .map((keyword) => `-"${keyword.trim()}"`)
    .join(' ');
  return exclusions.length > 0 ? `${query.text} ${exclusions}` : query.text;
}
