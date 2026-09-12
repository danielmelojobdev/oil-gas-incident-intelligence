/**
 * Deterministic, rules-only extraction.
 *
 * Two jobs:
 *   1. It is the engine behind `MockAiProvider`, so Mock Mode exercises the real
 *      pipeline with no API key and no spend.
 *   2. It is the degradation path when the configured AI provider is unavailable —
 *      the scanner keeps producing incidents, at lower confidence, instead of stopping
 *      (decision D5).
 *
 * It extracts only what the text literally says. Anything it cannot find is `null`.
 */
import {
  detectsWellIntegrityVocabulary,
  evaluateOilGasHeuristics,
  extractedIncidentSchema,
  foldCase,
  truncate,
  type ExtractedIncident,
  type IncidentType,
  type InstallationType,
  type LifecycleStage,
  type ProcessSafetyCategory,
  type WellIntegrityCategory,
} from '@ogii/domain';
import type { ArticleForAi } from './ai-provider';

interface Rule<T> {
  readonly value: T;
  readonly pattern: RegExp;
}

const INCIDENT_TYPE_RULES: readonly Rule<IncidentType>[] = [
  { value: 'blowout', pattern: /\b(blowout|blow-out|reventon|utblasning|eruption de puits)\b/ },
  { value: 'explosion', pattern: /\b(explosion|explosao|explosion|eksplosjon|blast)\b/ },
  { value: 'well_control', pattern: /\b(well control|controle de poco|control de pozo|bronnkontroll|influx|kick)\b/ },
  { value: 'well_integrity', pattern: /\b(well integrity|integridade de poco|brann?integritet|bronnintegritet|casing pressure|annulus)\b/ },
  { value: 'pipeline_rupture', pattern: /\b((pipeline|oleoducto|gasoducto|oleoduto|gasoduto|rorledning)\w*\s*\w*\s*(rupture|ruptured|burst|ruptura|rotura|rompimento|brudd)|(rupture|ruptura|rotura|rompimento)\w*\s+(de\s+)?(oleoducto|gasoducto|oleoduto|gasoduto|pipeline))\b/ },
  { value: 'pipeline_leak', pattern: /\bpipeline (leak|leaked)\b/ },
  { value: 'oil_spill', pattern: /\b(oil spill|crude (oil )?(spill|release)|derramamento|oljeutslipp)\b/ },
  { value: 'toxic_gas_release', pattern: /\b(h2s|hydrogen sulphide|hydrogen sulfide|toxic gas|gas sulfidrico)\b/ },
  { value: 'gas_leak', pattern: /\b(gas leak|gasslekkasje|vazamento de gas|fuga de gas)\b/ },
  { value: 'oil_leak', pattern: /\b(oil leak|oljelekkasje|vazamento de (oleo|petroleo))\b/ },
  { value: 'loss_of_containment', pattern: /\b(loss of (primary )?containment|perda de contencao|hydrocarbon release|hydrokarbonlekkasje)\b/ },
  { value: 'fire', pattern: /\b(fire|blaze|incendio|brann|incendie)\b/ },
  { value: 'helicopter_incident', pattern: /\bhelicopter\b/ },
  { value: 'vessel_collision', pattern: /\b(collision|contacts? (the )?(platform|leg)|allision)\b/ },
  { value: 'dropped_object', pattern: /\bdropped (object|load)\b/ },
  { value: 'crane_incident', pattern: /\bcrane\b/ },
  { value: 'structural_failure', pattern: /\bstructural (damage|failure)|brace\b/ },
  { value: 'evacuation', pattern: /\b(evacuat|down-?mann|abandon)/ },
  { value: 'emergency_shutdown', pattern: /\bemergency shutdown|nodavstenging|parada de emergencia\b/ },
  { value: 'equipment_failure', pattern: /\b(bop|blowout preventer|function test|equipment failure|valve failure)\b/ },
  { value: 'production_shutdown', pattern: /\b(production (halted|suspended|shut)|shut in)\b/ },
];

const WELL_INTEGRITY_RULES: readonly Rule<WellIntegrityCategory>[] = [
  { value: 'multiple_barrier_failure', pattern: /\bmultiple barrier|both barriers\b/ },
  { value: 'primary_barrier_failure', pattern: /\bprimary barrier\b/ },
  { value: 'secondary_barrier_failure', pattern: /\bsecondary barrier\b/ },
  { value: 'bop', pattern: /\b(bop|blowout preventer|annular preventer)\b/ },
  { value: 'christmas_tree', pattern: /\b(christmas tree|xmas tree|arvore de natal)\b/ },
  { value: 'wellhead', pattern: /\bwellhead|cabeca de poco|bronnhode\b/ },
  { value: 'annulus', pattern: /\b(annulus|annular pressure|casing pressure)\b/ },
  { value: 'tubing', pattern: /\btubing\b/ },
  { value: 'casing', pattern: /\bcasing\b/ },
  { value: 'cement', pattern: /\bcement(ing|ation)?\b/ },
  { value: 'packer', pattern: /\bpacker\b/ },
  { value: 'dhsv_scssv', pattern: /\b(dhsv|scssv|subsurface safety valve)\b/ },
  { value: 'well_control', pattern: /\b(well control|influx|kick|blowout)\b/ },
  { value: 'loss_of_containment', pattern: /\bloss of containment|hydrocarbon release\b/ },
];

const PROCESS_SAFETY_RULES: readonly Rule<ProcessSafetyCategory>[] = [
  { value: 'explosion', pattern: /\bexplosion|blast|explosao|eksplosjon\b/ },
  { value: 'fire', pattern: /\b(fire|blaze|incendio|brann)\b/ },
  { value: 'toxic_gas_release', pattern: /\b(h2s|hydrogen sulphide|toxic gas)\b/ },
  { value: 'spill', pattern: /\b(spill|derramamento|utslipp)\b/ },
  { value: 'loss_of_primary_containment', pattern: /\b(loss of (primary )?containment|leak|lekkasje|vazamento|fuga)\b/ },
  { value: 'hydrocarbon_release', pattern: /\bhydrocarbon release|hydrokarbonlekkasje\b/ },
  { value: 'emergency_shutdown', pattern: /\bemergency shutdown\b/ },
  { value: 'structural_failure', pattern: /\bstructural (damage|failure)\b/ },
  { value: 'overpressure', pattern: /\boverpressure|over-pressure\b/ },
];

const INSTALLATION_RULES: readonly Rule<InstallationType>[] = [
  { value: 'drillship', pattern: /\b(drillship|drill ship|navio-?sonda|boreskip)\b/ },
  { value: 'semi_submersible', pattern: /\b(semi-?submersible|semissubmersivel|halvt nedsenkbar)\b/ },
  { value: 'jack_up', pattern: /\bjack-?up\b/ },
  { value: 'fpso', pattern: /\bfpso\b/ },
  { value: 'fso', pattern: /\bfso\b/ },
  { value: 'tlp', pattern: /\btlp\b/ },
  { value: 'spar', pattern: /\bspar (platform|buoy)\b/ },
  { value: 'lng_facility', pattern: /\blng (plant|terminal|facility|export)\b/ },
  { value: 'gas_processing_plant', pattern: /\bgas (processing )?plant|upgn\b/ },
  { value: 'refinery', pattern: /\b(refinery|refineries|refinaria|refineria|raffineri)\b/ },
  { value: 'compressor_station', pattern: /\bcompressor station\b/ },
  { value: 'pipeline', pattern: /\b(pipeline|gasoduto|oleoduto|rorledning)\b/ },
  { value: 'terminal', pattern: /\b(terminal|jetty)\b/ },
  { value: 'storage_facility', pattern: /\b(tank farm|storage (facility|depot)|gathering station|estacao coletora)\b/ },
  { value: 'subsea_installation', pattern: /\b(subsea (template|installation|manifold))\b/ },
  { value: 'wellhead_platform', pattern: /\bwellhead platform\b/ },
  { value: 'fixed_platform', pattern: /\b(fixed platform|production platform|oil platform|offshore platform|plataforma|oljeplattform)\b/ },
];

const LIFECYCLE_RULES: readonly Rule<LifecycleStage>[] = [
  { value: 'workover', pattern: /\b(workover|reacondicionamiento|overhaling)\b/ },
  { value: 'intervention', pattern: /\b(well intervention|intervencao)\b/ },
  { value: 'drilling', pattern: /\b(drilling|perfuracao|perforacion|boring)\b/ },
  { value: 'completion', pattern: /\b(completion|completacao)\b/ },
  { value: 'commissioning', pattern: /\bcommissioning\b/ },
  { value: 'p_and_a', pattern: /\b(plug and abandon|p&a|abandono)\b/ },
  { value: 'injection', pattern: /\binjection well|injector\b/ },
  { value: 'production', pattern: /\b(production|producao|produksjon)\b/ },
];

/**
 * Countries we can recognise, in two passes.
 *
 * `name` patterns are specific (a country name or demonym) and are checked first.
 * `region` patterns are geographic shorthand that only *usually* implies a country —
 * "North Sea" is mostly UK waters, but "Danish North Sea" is Denmark. Checking the
 * specific pass first is what stops that story being filed under the wrong flag.
 */
const COUNTRIES: readonly { name: string; code: string; specific: RegExp; region?: RegExp }[] = [
  { name: 'United Kingdom', code: 'GB', specific: /\b(united kingdom|uk|britain|british|scotland|scottish|aberdeen)\b/, region: /\bnorth sea\b/ },
  { name: 'Norway', code: 'NO', specific: /\b(norway|norwegian|norge|norsk|stavanger|bergen)\b/, region: /\b(norskehavet|nordsjoen|barents sea|norwegian (sea|continental shelf))\b/ },
  { name: 'Denmark', code: 'DK', specific: /\b(denmark|danish|danmark|esbjerg)\b/ },
  { name: 'Netherlands', code: 'NL', specific: /\b(netherlands|dutch|rotterdam|groningen)\b/ },
  { name: 'Brazil', code: 'BR', specific: /\b(brazil|brasil|brazilian|brasileir|rio de janeiro|macae)\b/, region: /\b(bacia de \w+|campos basin|santos basin|reconcavo|pre-?sal)\b/ },
  { name: 'United States', code: 'US', specific: /\b(united states|u\.s\.|usa|american|texas|louisiana|oklahoma|alaska|new mexico)\b/, region: /\b(gulf of mexico|permian|gulf coast|midwest|bakken|eagle ford)\b/ },
  { name: 'Canada', code: 'CA', specific: /\b(canada|canadian|alberta|newfoundland|saskatchewan)\b/ },
  { name: 'Mexico', code: 'MX', specific: /\b(mexico|mexican|mexicano|veracruz|tabasco|campeche)\b/ },
  { name: 'Colombia', code: 'CO', specific: /\b(colombia|colombian|colombiano)\b/, region: /\bllanos\b/ },
  { name: 'Argentina', code: 'AR', specific: /\b(argentina|argentine|argentino|neuquen)\b/, region: /\bvaca muerta\b/ },
  { name: 'Venezuela', code: 'VE', specific: /\b(venezuela|venezuelan|pdvsa)\b/ },
  { name: 'Guyana', code: 'GY', specific: /\bguyana\b/, region: /\bstabroek\b/ },
  { name: 'Angola', code: 'AO', specific: /\b(angola|angolan|luanda)\b/, region: /\blower congo\b/ },
  { name: 'Nigeria', code: 'NG', specific: /\b(nigeria|nigerian|lagos|port harcourt)\b/, region: /\bniger delta\b/ },
  { name: 'Ghana', code: 'GH', specific: /\b(ghana|ghanaian)\b/ },
  { name: 'Egypt', code: 'EG', specific: /\b(egypt|egyptian)\b/ },
  { name: 'Libya', code: 'LY', specific: /\b(libya|libyan)\b/ },
  { name: 'Mozambique', code: 'MZ', specific: /\b(mozambique|mozambican)\b/ },
  { name: 'Saudi Arabia', code: 'SA', specific: /\b(saudi arabia|saudi|aramco)\b/ },
  { name: 'United Arab Emirates', code: 'AE', specific: /\b(united arab emirates|uae|abu dhabi|adnoc|dubai)\b/ },
  { name: 'Iraq', code: 'IQ', specific: /\b(iraq|iraqi|basra|kurdistan)\b/ },
  { name: 'Kuwait', code: 'KW', specific: /\bkuwait/ },
  { name: 'Qatar', code: 'QA', specific: /\b(qatar|qatari)\b/ },
  { name: 'Oman', code: 'OM', specific: /\b(oman|omani)\b/ },
  { name: 'Australia', code: 'AU', specific: /\b(australia|australian|western australia|queensland|perth)\b/, region: /\b(north west shelf|bass strait)\b/ },
  { name: 'Malaysia', code: 'MY', specific: /\b(malaysia|malaysian|sarawak|sabah)\b/ },
  { name: 'Indonesia', code: 'ID', specific: /\b(indonesia|indonesian)\b/ },
  { name: 'India', code: 'IN', specific: /\b(india|indian)\b/, region: /\bmumbai high\b/ },
  { name: 'China', code: 'CN', specific: /\b(china|chinese|cnooc|sinopec)\b/ },
];

/** Place names and newsroom names: never an operator, never an asset. */
const ORG_STOP_WORDS =
  /\b(County|Parish|Borough|City|State|Province|Department|District|Forest|Beacon|Herald|Times|Post|News|Wire|Journal|Gazette|Tribune|Review|Daily|Press)\b/i;

/**
 * Named assets: an installation name sitting next to an asset noun.
 *
 * Both orders occur in real copy: "the jack-up rig Nordvind II" and
 * "the Nordvind II jack-up rig". Extracting that name is what lets the grouping stage
 * recognise that three publishers are describing one event.
 */
const ASSET_NOUNS = 'rig|platform|installation|facility|refinery|terminal|pipeline|plant|vessel|fpso|fso|drillship|field';

/** A proper name: capitalised words, roman numerals and alphanumeric unit numbers. */
const ASSET_NAME = String.raw`[A-Z][\w'-]*(?:\s+(?:[A-Z][\w'-]*|[IVX]{1,4}|\d{1,3}[A-Z]?))*`;

/** Words that are never an asset name even though they are capitalised. */
const NOT_AN_ASSET =
  /^(The|A|An|This|That|Its|Drilling|Crude|Gas|Oil|Regulator|Operator|Two|One|Three|Personnel|Rescue|Local|Fire|Production|Investigators|Analysts|Authorities)\b/;
const ORGANISATION_MARKER =
  /\b(Energy|Energi|Energia|Petroleum|Petroleo|Refining|Midstream|Upstream|Resources|Inc|Ltd|Limited|LLC|plc|Corporation|Company|Services)\b/;

function extractAssetName(rawText: string, publisher?: string | null): string | null {
  // "... the jack-up drilling rig Nordvind II ..." (noun, then name)
  const after = new RegExp(String.raw`\b(?:${ASSET_NOUNS})\s+(?:named\s+)?(${ASSET_NAME})`).exec(rawText);
  // "... the Nordvind II jack-up rig ..." (name, then up to two qualifiers, then noun)
  const before = new RegExp(
    String.raw`\b(${ASSET_NAME})\s+(?:[a-z][a-z-]*\s+){0,2}(?:${ASSET_NOUNS})\b`,
  ).exec(rawText);

  const normalisedPublisher = (publisher ?? '')
    .toLowerCase()
    .replace(/\s*\(fictional\)\s*/i, '')
    .trim();

  const candidates = [after?.[1], before?.[1]]
    .map((value) => value?.trim())
    .filter((value): value is string => value !== undefined && value.length >= 3)
    .filter((value) => !NOT_AN_ASSET.test(value))
    .filter((value) => !ORGANISATION_MARKER.test(value))
    // A newsroom or a county is not an asset. "Alaska Beacon ... platform" was being
    // filed as the installation involved in the incident it reported on.
    .filter((value) => !ORG_STOP_WORDS.test(value))
    .filter(
      (value) =>
        normalisedPublisher === '' ||
        (!normalisedPublisher.includes(value.toLowerCase()) &&
          !value.toLowerCase().includes(normalisedPublisher)),
    );

  // Prefer the longer, more specific name.
  return candidates.sort((a, b) => b.length - a.length)[0] ?? null;
}

function firstMatch<T>(text: string, rules: readonly Rule<T>[]): T | null {
  for (const rule of rules) if (rule.pattern.test(text)) return rule.value;
  return null;
}

function allMatches<T>(text: string, rules: readonly Rule<T>[], limit: number): T[] {
  const found: T[] = [];
  for (const rule of rules) {
    if (found.length >= limit) break;
    if (rule.pattern.test(text)) found.push(rule.value);
  }
  return found;
}

/** Number words the sources actually use, so "two workers" is not missed. */
const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, um: 1, dois: 2, tres: 3, quatro: 4, cinco: 5, uno: 1, dos: 2,
};

function parseCount(token: string | undefined): number | null {
  if (token === undefined) return null;
  const numeric = Number.parseInt(token.replace(/[,.]/g, ''), 10);
  if (!Number.isNaN(numeric)) return numeric;
  return NUMBER_WORDS[token.toLowerCase()] ?? null;
}

/**
 * Casualty counts. Only matched when the sentence explicitly attaches a number to a
 * casualty noun. "No fatalities were reported" yields `0`; silence yields `null`.
 */
function extractCasualties(text: string): {
  fatalities: number | null;
  injuries: number | null;
  missing: number | null;
  evacuated: number | null;
} {
  const num = '(\\d{1,5}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|um|dois|tres|uno|dos)';

  const killedMatch = new RegExp(`${num}\\s+(?:people\\s+|workers?\\s+|crew\\s+)?(?:were\\s+)?(?:killed|dead|died|fatalities|fatally)`, 'i').exec(text)
    ?? new RegExp(`(?:fatalities|deaths?|killed)[:\\s]+${num}`, 'i').exec(text)
    ?? new RegExp(`${num}\\s+(?:mortos?|mortes|fallecidos|omkomne)`, 'i').exec(text);
  const noFatalities = /\bno (fatalities|deaths|one was killed)\b|\bnao houve mortes\b|\bingen omkomne\b/i.test(text);

  const injuredMatch = new RegExp(`${num}\\s+(?:people\\s+|workers?\\s+|personnel\\s+|crew\\s+)?(?:were\\s+)?(?:injured|hurt|injuries|treated)`, 'i').exec(text)
    ?? new RegExp(`(?:injuries|injured)[:\\s]+${num}`, 'i').exec(text)
    ?? new RegExp(`${num}\\s+(?:feridos?|heridos?|skadet)`, 'i').exec(text);
  const noInjuries = /\bno (injuries|one was (injured|hurt))\b|\bnao houve feridos\b/i.test(text);

  const missingMatch = new RegExp(`${num}\\s+(?:people\\s+|workers?\\s+|crew\\s+)?(?:are\\s+|were\\s+)?missing`, 'i').exec(text)
    ?? new RegExp(`${num}\\s+(?:desaparecidos?|savnet)`, 'i').exec(text);

  const evacuatedMatch = new RegExp(`${num}\\s+(?:people\\s+|personnel\\s+|workers?\\s+|staff\\s+)?(?:were\\s+)?(?:evacuated|down-?manned|relocated|moved to)`, 'i').exec(text)
    ?? new RegExp(`evacuat\\w*\\s+(?:of\\s+)?${num}`, 'i').exec(text);

  return {
    fatalities: parseCount(killedMatch?.[1]) ?? (noFatalities ? 0 : null),
    injuries: parseCount(injuredMatch?.[1]) ?? (noInjuries ? 0 : null),
    missing: parseCount(missingMatch?.[1]),
    evacuated: parseCount(evacuatedMatch?.[1]),
  };
}

/**
 * Organisation names: capitalised sequences ending in a corporate marker.
 *
 * Conservative by design - a wrong operator is worse than no operator. Three guards
 * were added after the first live scan produced "Rusk County. Oil" (the match spanned
 * a sentence boundary) and "Alaska Beacon" (the publisher's own name appearing in the
 * text it published).
 */
function extractOrganisation(rawText: string, publisher?: string | null): string | null {
  // [^.]* in the tail: a company name never spans a full stop.
  const pattern =
    /\b([A-Z][\w&-]*(?:\s+[A-Z][\w&-]*){0,3}\s+(?:Energy|Energi|Energia|Petroleum|Petroleo|Oil|Gas|Refining|Midstream|Upstream|Drilling|Resources|Offshore|LNG|Services|Petrobras|Corporation|Inc|Ltd|Limited|LLC|plc|AS|ASA|S\.A\.|SA|Pty|Pte|Company|Co))\b/;
  const match = pattern.exec(rawText);
  const name = match?.[1]?.trim();
  if (name === undefined || name.length < 4) return null;

  // Sentence-initial false positives such as "The Oil".
  if (/^(the|a|an|this|that|its|and|but)\b/i.test(name)) return null;
  // Place names and newsroom names are not operators.
  if (ORG_STOP_WORDS.test(name)) return null;
  // The publisher writing the article is not the company involved in it.
  if (publisher != null && publisher.trim() !== '') {
    const normalisedPublisher = publisher.toLowerCase().replace(/\s*\(fictional\)\s*/i, '').trim();
    const normalisedName = name.toLowerCase();
    if (normalisedPublisher.includes(normalisedName) || normalisedName.includes(normalisedPublisher)) {
      return null;
    }
  }
  return name;
}

function extractCountry(text: string): { country: string | null; code: string | null } {
  // Pass 1: an explicit country name or demonym always wins.
  for (const entry of COUNTRIES) {
    if (entry.specific.test(text)) return { country: entry.name, code: entry.code };
  }
  // Pass 2: geographic shorthand, only when no country was named.
  for (const entry of COUNTRIES) {
    if (entry.region !== undefined && entry.region.test(text)) return { country: entry.name, code: entry.code };
  }
  return { country: null, code: null };
}

function detectEnvironment(text: string): 'offshore' | 'onshore' | 'subsea' | 'unknown' {
  if (/\bsubsea|undervanns|submarina\b/.test(text)) return 'subsea';
  if (/\b(offshore|platform|rig|fpso|fso|north sea|gulf of mexico|sokkel|plataforma|drillship)\b/.test(text)) {
    return 'offshore';
  }
  if (/\b(onshore|refinery|refinaria|plant|pipeline|terminal|field site|well pad|land)\b/.test(text)) return 'onshore';
  return 'unknown';
}

function detectSeverity(
  casualties: ReturnType<typeof extractCasualties>,
  incidentType: IncidentType,
  text: string,
): 'low' | 'moderate' | 'high' | 'critical' {
  if ((casualties.fatalities ?? 0) > 1) return 'critical';
  if ((casualties.fatalities ?? 0) === 1) return 'high';
  if (incidentType === 'blowout' || incidentType === 'explosion') return 'critical';
  if ((casualties.injuries ?? 0) >= 3 || (casualties.evacuated ?? 0) >= 50) return 'high';
  if (['fire', 'well_control', 'pipeline_rupture', 'oil_spill', 'loss_of_containment'].includes(incidentType)) {
    return 'high';
  }
  if (/\b(major|significant|serious|severe)\b/.test(text)) return 'moderate';
  return (casualties.injuries ?? 0) > 0 ? 'moderate' : 'low';
}

/** Builds an `ExtractedIncident` from article text alone. Never invents a value. */
export function extractIncidentHeuristically(articles: readonly ArticleForAi[]): ExtractedIncident {
  const primary = articles[0];
  if (primary === undefined) throw new Error('extractIncidentHeuristically requires at least one article');

  const rawText = articles.map((article) => `${article.title}. ${article.excerpt ?? ''}`).join(' ');
  const text = foldCase(rawText);

  const heuristics = evaluateOilGasHeuristics({ title: primary.title, excerpt: primary.excerpt });
  const incidentType = firstMatch(text, INCIDENT_TYPE_RULES) ?? 'other';
  const secondary = allMatches(text, INCIDENT_TYPE_RULES, 4).filter((type) => type !== incidentType);
  const casualties = extractCasualties(rawText);
  const { country, code } = extractCountry(text);
  const environment = detectEnvironment(text);
  const wellIntegrityVocabulary = detectsWellIntegrityVocabulary(rawText);
  const wellIntegrityCategory = wellIntegrityVocabulary ? firstMatch(text, WELL_INTEGRITY_RULES) : null;
  const processSafetyCategory = firstMatch(text, PROCESS_SAFETY_RULES);

  const wellNumberMatch = /\b(\d{1,3}-[A-Z]{2,5}-\d{1,4}[A-Z]?|\d{4}\/\d{1,2}-[A-Z]-\d{1,3}\s?[A-Z]?)\b/.exec(rawText);

  const candidate = {
    isOilAndGasRelated: heuristics.passed,
    oilAndGasSector: heuristics.sectorHint,
    // Rules-only extraction is honestly capped: it is never as confident as a model.
    confidence: heuristics.passed ? Math.min(0.75, 0.4 + heuristics.score / 250) : 0.2,

    title: truncate(primary.title, 160),
    summary: articles
      .slice(0, 3)
      .map((article) => article.excerpt ?? article.title)
      .join(' ')
      .slice(0, 900),
    highlights: articles.slice(0, 6).map((article) => truncate(article.excerpt ?? article.title, 180)),

    incidentDate: primary.publishedAt?.slice(0, 10) ?? null,
    incidentTime: null,

    country,
    countryCode: code,
    region: null,
    city: null,
    basin: /\b([a-z ]+) basin\b/.exec(text)?.[0] ?? null,
    block: /\bblock [\w/-]+\b/i.exec(rawText)?.[0] ?? null,
    field: null,
    latitude: null,
    longitude: null,

    operator: extractOrganisation(rawText, primary.publisher),
    company: null,
    licenceHolder: null,
    drillingContractor: null,
    serviceCompany: null,
    pipelineOperator: null,

    asset: extractAssetName(rawText, primary.publisher),
    installation: extractAssetName(rawText, primary.publisher),
    installationType: firstMatch(text, INSTALLATION_RULES),
    vessel: null,

    wellName: null,
    wellNumber: wellNumberMatch?.[1] ?? null,
    wellType: null,
    wellStatus: null,

    environment,
    waterDepthCategory: null, // never inferred (brief section 21)
    lifecycleStage: firstMatch(text, LIFECYCLE_RULES) ?? 'unknown',
    incidentType,
    secondaryIncidentTypes: secondary.slice(0, 4),

    isWellIntegrityRelated: wellIntegrityVocabulary ? true : null,
    wellIntegrityCategory,
    suspectedFailedComponent: null, // never inferred without an explicit statement
    barrierFunctionImpacted: null,

    isProcessSafetyEvent: processSafetyCategory === null ? null : true,
    processSafetyCategory,

    severity: detectSeverity(casualties, incidentType, text),

    fatalities: casualties.fatalities,
    injuries: casualties.injuries,
    missingPersons: casualties.missing,
    evacuatedPersons: casualties.evacuated,
    hydrocarbonRelease: /\b(hydrocarbon release|gas leak|oil leak|spill|lekkasje|vazamento)\b/.test(text) ? true : null,
    environmentalImpact: /\b(environmental|contamination|sheen|wildlife|soil|farmland)\b/.test(text)
      ? truncate(rawText.slice(Math.max(0, text.indexOf('environmental')), text.indexOf('environmental') + 200), 200)
      : null,
    productionImpact: /\b(production (was |is |remains )?(halted|suspended|shut|reduced)|shut in|throughput)\b/.test(text)
      ? 'Production impact reported by the sources.'
      : null,
    assetDamage: /\bdamage\b/.test(text) ? 'Damage reported by the sources.' : null,
  };

  // Even the rules path goes through the schema: one gate, no exceptions.
  return extractedIncidentSchema.parse(candidate);
}
