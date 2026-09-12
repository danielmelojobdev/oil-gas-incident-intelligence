/**
 * Incident grouping (brief section 17): do these articles describe the SAME event?
 *
 * Rules first, model second (decision D5). A weighted evidence score decides outright
 * in the clear cases; only the ambiguous middle band is escalated to the LLM, and the
 * LLM can never override the country or date veto.
 */
import { daysBetween } from '../time/periods';
import { headlineSimilarity, levenshteinSimilarity } from '../text/similarity';
import { normaliseAssetName, normaliseOrganisationName } from '../text/normalise';
import type { IncidentType } from '../taxonomy';

export interface GroupingCandidate {
  readonly id?: string;
  readonly title: string;
  readonly incidentDate: string | null;
  readonly country: string | null;
  readonly operator: string | null;
  readonly company?: string | null;
  readonly asset: string | null;
  readonly installation?: string | null;
  readonly field: string | null;
  readonly wellName?: string | null;
  readonly incidentType: IncidentType | null;
  readonly entities?: readonly string[];
}

export const GROUPING_WEIGHTS = {
  date: 0.2,
  country: 0.15,
  operator: 0.2,
  asset: 0.2,
  incidentType: 0.1,
  headline: 0.1,
  entities: 0.05,
} as const;

/** score >= this: definitely the same incident. */
export const GROUPING_MATCH_THRESHOLD = 0.72;
/** score >= this (but below match): ask the model. */
export const GROUPING_REVIEW_THRESHOLD = 0.55;
/** Beyond this many days apart, two reports cannot be the same event. */
export const GROUPING_MAX_DATE_GAP_DAYS = 7;
/**
 * Minimum share of the total evidence weight that must be observable before the score
 * is taken at face value.
 *
 * Without this, two sparse records ("a fire on a North Sea platform", no operator, no
 * asset) would renormalise over the two or three weak signals they do share and score
 * as a confident match. Dividing by at least this coverage means missing identity
 * evidence lowers the score instead of being ignored.
 */
export const GROUPING_MIN_EVIDENCE_COVERAGE = 0.75;

export type GroupingDecision = 'same' | 'review' | 'different';

export interface GroupingScore {
  readonly score: number;
  readonly decision: GroupingDecision;
  readonly signals: Readonly<Record<string, number>>;
  readonly vetoed: boolean;
  readonly vetoReason: string | null;
  readonly reason: string;
}

function nameSimilarity(a: string | null | undefined, b: string | null | undefined, organisation: boolean): number | null {
  if (a === null || a === undefined || a === '' || b === null || b === undefined || b === '') return null;
  const left = organisation ? normaliseOrganisationName(a) : normaliseAssetName(a);
  const right = organisation ? normaliseOrganisationName(b) : normaliseAssetName(b);
  if (left.length === 0 || right.length === 0) return null;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.9;
  return levenshteinSimilarity(left, right);
}

function bestAssetSimilarity(a: GroupingCandidate, b: GroupingCandidate): number | null {
  const pairs: [string | null | undefined, string | null | undefined][] = [
    [a.wellName, b.wellName],
    [a.asset, b.asset],
    [a.installation, b.installation],
    [a.field, b.field],
    [a.asset, b.installation],
    [a.installation, b.asset],
  ];
  const scores = pairs
    .map(([left, right]) => nameSimilarity(left, right, false))
    .filter((score): score is number => score !== null);
  return scores.length === 0 ? null : Math.max(...scores);
}

/**
 * Deterministic similarity between an extracted candidate and an existing incident.
 *
 * Signals that are unknown on either side are skipped and the weights renormalised, so
 * a sparse regulator notice is not punished for being sparse.
 */
export function scoreIncidentSimilarity(a: GroupingCandidate, b: GroupingCandidate): GroupingScore {
  const signals: Record<string, number> = {};
  let weightedSum = 0;
  let weightTotal = 0;

  const contribute = (key: keyof typeof GROUPING_WEIGHTS, value: number | null): void => {
    if (value === null) return;
    signals[key] = value;
    weightedSum += value * GROUPING_WEIGHTS[key];
    weightTotal += GROUPING_WEIGHTS[key];
  };

  // --- Vetoes -------------------------------------------------------------
  const gap = a.incidentDate !== null && b.incidentDate !== null ? daysBetween(a.incidentDate, b.incidentDate) : null;
  if (gap !== null && Math.abs(gap) > GROUPING_MAX_DATE_GAP_DAYS) {
    return {
      score: 0,
      decision: 'different',
      signals: { date: 0 },
      vetoed: true,
      vetoReason: `Incident dates are ${Math.abs(gap)} days apart (max ${GROUPING_MAX_DATE_GAP_DAYS}).`,
      reason: 'Rejected by the date veto.',
    };
  }

  const countryA = a.country === null ? null : normaliseAssetName(a.country);
  const countryB = b.country === null ? null : normaliseAssetName(b.country);
  if (countryA !== null && countryB !== null && countryA !== countryB) {
    return {
      score: 0,
      decision: 'different',
      signals: { country: 0 },
      vetoed: true,
      vetoReason: `Different countries: "${a.country}" vs "${b.country}".`,
      reason: 'Rejected by the country veto.',
    };
  }

  // --- Weighted evidence --------------------------------------------------
  if (gap !== null) {
    const absGap = Math.abs(gap);
    contribute('date', absGap === 0 ? 1 : absGap <= 2 ? 0.85 : absGap <= 4 ? 0.55 : 0.3);
  }
  if (countryA !== null && countryB !== null) contribute('country', 1);

  const operatorScore = Math.max(
    nameSimilarity(a.operator, b.operator, true) ?? -1,
    nameSimilarity(a.operator ?? a.company, b.operator ?? b.company, true) ?? -1,
  );
  contribute('operator', operatorScore >= 0 ? operatorScore : null);

  contribute('asset', bestAssetSimilarity(a, b));

  if (a.incidentType !== null && b.incidentType !== null) {
    contribute('incidentType', a.incidentType === b.incidentType ? 1 : 0.2);
  }

  contribute('headline', headlineSimilarity(a.title, b.title));

  if (a.entities !== undefined && b.entities !== undefined && a.entities.length > 0 && b.entities.length > 0) {
    const setB = new Set(b.entities.map((entity) => normaliseAssetName(entity)));
    const overlap = a.entities.filter((entity) => setB.has(normaliseAssetName(entity))).length;
    contribute('entities', overlap / Math.min(a.entities.length, b.entities.length));
  }

  const score = weightTotal === 0 ? 0 : weightedSum / Math.max(weightTotal, GROUPING_MIN_EVIDENCE_COVERAGE);

  // A strong asset/well match with a compatible date is conclusive on its own.
  const assetSignal = signals['asset'] ?? 0;
  const dateSignal = signals['date'] ?? 0;
  const conclusive = assetSignal >= 0.95 && dateSignal >= 0.85;

  const decision: GroupingDecision =
    conclusive || score >= GROUPING_MATCH_THRESHOLD
      ? 'same'
      : score >= GROUPING_REVIEW_THRESHOLD
        ? 'review'
        : 'different';

  const topSignals = Object.entries(signals)
    .sort(([, x], [, y]) => y - x)
    .slice(0, 3)
    .map(([key, value]) => `${key}=${value.toFixed(2)}`)
    .join(', ');

  return {
    score,
    decision,
    signals,
    vetoed: false,
    vetoReason: null,
    reason: conclusive
      ? `Conclusive asset/well match on a compatible date (${topSignals}).`
      : `Weighted evidence ${score.toFixed(2)} (${topSignals}).`,
  };
}

export interface GroupingMatch<T extends GroupingCandidate> {
  readonly incident: T;
  readonly score: GroupingScore;
}

/** Finds the best existing incident for a candidate, if any. */
export function findBestIncidentMatch<T extends GroupingCandidate>(
  candidate: GroupingCandidate,
  existing: readonly T[],
): GroupingMatch<T> | null {
  let best: GroupingMatch<T> | null = null;
  for (const incident of existing) {
    const score = scoreIncidentSimilarity(candidate, incident);
    if (score.decision === 'different' && score.score === 0) continue;
    if (best === null || score.score > best.score.score) best = { incident, score };
  }
  return best;
}
