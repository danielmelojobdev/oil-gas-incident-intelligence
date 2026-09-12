/**
 * Stage 2-3 of the cost ladder: decide, without spending a single token, whether an
 * article is plausibly about an Oil & Gas incident.
 *
 * The governing rule of the brief (section 4): the isolated presence of "fire",
 * "explosion", "accident" or "leak" is NOT sufficient. An article must carry BOTH an
 * event signal AND an industry signal (or come from an inherently Oil & Gas source such
 * as a regulator feed), and must survive the hard exclusion list.
 */
import { ALL_EVENT_TERMS, ALL_INDUSTRY_TERMS, ALL_STRONG_PHRASES, ALL_WELL_TERMS } from '../glossary';
import type { OilGasSector } from '../taxonomy';
import { foldCase } from '../text/normalise';
import { evaluateExclusions, hasOilGasAnchor, type ExclusionVerdict } from './exclusions';

export interface HeuristicInput {
  readonly title: string;
  readonly excerpt?: string | null;
  readonly publisher?: string | null;
  /** Source tier from the source catalogue; tier 1 sources get an industry anchor for free. */
  readonly sourceTier?: number;
  /** True when the article came from a feed that only ever publishes Oil & Gas content. */
  readonly sourceIsOilGasDedicated?: boolean;
  /** User-configured keyword filters. */
  readonly includeKeywords?: readonly string[];
  readonly excludeKeywords?: readonly string[];
}

export interface HeuristicVerdict {
  /** Whether the candidate may continue down the pipeline. */
  readonly passed: boolean;
  /** 0-100 heuristic relevance, fed into the final relevance score. */
  readonly score: number;
  readonly hasEventSignal: boolean;
  readonly hasIndustrySignal: boolean;
  readonly hasStrongPhrase: boolean;
  readonly hasWellSignal: boolean;
  readonly matchedEventTerms: readonly string[];
  readonly matchedIndustryTerms: readonly string[];
  readonly matchedStrongPhrases: readonly string[];
  readonly exclusion: ExclusionVerdict;
  readonly sectorHint: OilGasSector;
  readonly reason: string;
}

const UPSTREAM_HINTS = [
  'platform', 'rig', 'drill', 'well', 'offshore', 'subsea', 'fpso', 'fso', 'wellhead',
  'blowout', 'bop', 'workover', 'completion', 'p&a', 'field', 'exploration', 'production platform',
  'plataforma', 'poco', 'sonda', 'perfuracao', 'oljeplattform', 'borerigg', 'bronn',
];
const MIDSTREAM_HINTS = [
  'pipeline', 'terminal', 'storage', 'compressor', 'lng carrier', 'gathering', 'tank farm',
  'transport', 'gasoduto', 'oleoduto', 'duto', 'gasoducto', 'oleoducto', 'rorledning',
];
const DOWNSTREAM_HINTS = [
  'refinery', 'refineries', 'refining', 'petrochemical', 'gas processing', 'lng plant',
  'fuel storage', 'fuel depot', 'refinaria', 'petroquimica', 'refineria', 'raffineri', 'raffinerie',
];

/** Counts and returns which of `terms` appear as whole words / phrases in `text`. */
function matchTerms(text: string, terms: readonly string[], limit = 8): string[] {
  const found: string[] = [];
  for (const term of terms) {
    if (found.length >= limit) break;
    if (text.includes(term)) found.push(term);
  }
  return found;
}

function detectSector(text: string): OilGasSector {
  const upstream = UPSTREAM_HINTS.filter((hint) => text.includes(hint)).length;
  const midstream = MIDSTREAM_HINTS.filter((hint) => text.includes(hint)).length;
  const downstream = DOWNSTREAM_HINTS.filter((hint) => text.includes(hint)).length;
  const max = Math.max(upstream, midstream, downstream);
  if (max === 0) return 'unknown';
  const leaders = [
    upstream === max ? 'upstream' : null,
    midstream === max ? 'midstream' : null,
    downstream === max ? 'downstream' : null,
  ].filter((value): value is OilGasSector => value !== null);
  return leaders.length === 1 ? (leaders[0] ?? 'unknown') : 'integrated';
}

/**
 * Deterministic Oil & Gas relevance heuristic.
 * Runs before any AI call and rejects the overwhelming majority of noise for free.
 */
export function evaluateOilGasHeuristics(input: HeuristicInput): HeuristicVerdict {
  const haystack = foldCase(`${input.title} ${input.excerpt ?? ''} ${input.publisher ?? ''}`);

  // User-configured hard exclusions win over everything.
  const userExcluded = (input.excludeKeywords ?? []).find((keyword) => haystack.includes(foldCase(keyword)));
  if (userExcluded !== undefined) {
    return {
      passed: false,
      score: 0,
      hasEventSignal: false,
      hasIndustrySignal: false,
      hasStrongPhrase: false,
      hasWellSignal: false,
      matchedEventTerms: [],
      matchedIndustryTerms: [],
      matchedStrongPhrases: [],
      exclusion: {
        excluded: true,
        domain: 'user-keyword',
        reason: `Blocked by the user exclude keyword "${userExcluded}".`,
        overriddenByAnchor: false,
      },
      sectorHint: 'unknown',
      reason: `Blocked by the user exclude keyword "${userExcluded}".`,
    };
  }

  const matchedStrongPhrases = matchTerms(haystack, ALL_STRONG_PHRASES, 5);
  const matchedEventTerms = matchTerms(haystack, ALL_EVENT_TERMS, 8);
  const matchedIndustryTerms = matchTerms(haystack, ALL_INDUSTRY_TERMS, 8);
  const matchedWellTerms = matchTerms(haystack, ALL_WELL_TERMS, 5);

  const dedicatedSource = input.sourceIsOilGasDedicated === true;
  const hasStrongPhrase = matchedStrongPhrases.length > 0;
  const hasEventSignal = matchedEventTerms.length > 0 || hasStrongPhrase;
  const hasAnchor = hasOilGasAnchor(haystack);
  const hasIndustrySignal = matchedIndustryTerms.length > 0 || hasStrongPhrase || dedicatedSource || hasAnchor;
  const hasWellSignal = matchedWellTerms.length > 0;

  const exclusion = evaluateExclusions(haystack);
  if (exclusion.excluded) {
    return {
      passed: false,
      score: 0,
      hasEventSignal,
      hasIndustrySignal,
      hasStrongPhrase,
      hasWellSignal,
      matchedEventTerms,
      matchedIndustryTerms,
      matchedStrongPhrases,
      exclusion,
      sectorHint: 'unknown',
      reason: exclusion.reason ?? 'Excluded by the hard exclusion list.',
    };
  }

  // The core rule: an event signal alone is never enough.
  const passed = hasEventSignal && hasIndustrySignal;

  let score = 0;
  if (hasEventSignal) score += 18;
  if (hasIndustrySignal) score += 22;
  score += Math.min(matchedStrongPhrases.length, 3) * 12; // up to 36
  score += Math.min(matchedIndustryTerms.length, 4) * 3; //  up to 12
  score += Math.min(matchedEventTerms.length, 4) * 2; //     up to 8
  if (hasWellSignal) score += 6;
  if (dedicatedSource) score += 6;
  // An unambiguous anchor phrase ("oil platform", "refinery", "well control") is much
  // stronger evidence than a bare industry word such as "oil".
  if (hasAnchor) score += 10;
  if (exclusion.overriddenByAnchor) score -= 8; // borderline domain, be a bit more careful
  if ((input.sourceTier ?? 5) <= 2) score += 4;

  // A user include-keyword hit is a strong, explicit signal of interest.
  const includeHit = (input.includeKeywords ?? []).some((keyword) => haystack.includes(foldCase(keyword)));
  if (includeHit) score += 10;

  score = Math.max(0, Math.min(100, score));

  const reason = passed
    ? `Event signal (${matchedEventTerms.slice(0, 3).join(', ') || 'strong phrase'}) combined with an Oil & Gas signal (${
        matchedIndustryTerms.slice(0, 3).join(', ') || (dedicatedSource ? 'dedicated source' : 'anchor phrase')
      }).`
    : !hasEventSignal
      ? 'No incident/event terminology found.'
      : 'Event terminology present but no clear Oil & Gas relation (section 4: "fire"/"explosion" alone is not sufficient).';

  return {
    passed,
    score: passed ? score : Math.min(score, 40),
    hasEventSignal,
    hasIndustrySignal,
    hasStrongPhrase,
    hasWellSignal,
    matchedEventTerms,
    matchedIndustryTerms,
    matchedStrongPhrases,
    exclusion,
    sectorHint: detectSector(haystack),
    reason,
  };
}

/** True when the text contains well-integrity / well-control vocabulary worth flagging. */
export function detectsWellIntegrityVocabulary(text: string): boolean {
  const folded = foldCase(text);
  return ALL_WELL_TERMS.some((term) => folded.includes(term));
}
