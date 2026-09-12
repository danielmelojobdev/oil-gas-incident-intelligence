/**
 * Relevance score 0-100 (brief section 32) — the gate that decides feed vs review vs reject.
 *
 *   >= 70  feed
 *   50-69  review / low confidence (never notifies)
 *   <  50  reject
 *
 * Thresholds live in `config/thresholds.ts` and are configurable per scan.
 */
import type { OilGasSector, SourceTier } from '../taxonomy';

export interface RelevanceInput {
  /** 0-100 from the deterministic heuristic. */
  readonly heuristicScore: number;
  /** 0-1 from the AI relevance classifier; `null` when AI is unavailable. */
  readonly aiConfidence: number | null;
  readonly aiSaysRelated: boolean | null;
  readonly sector: OilGasSector;
  readonly bestSourceTier: SourceTier;
  /** Days between the incident date and now; `null` when unknown. */
  readonly ageInDays: number | null;
  /** True when the incident's location matches a region the user asked for. */
  readonly matchesRequestedRegion: boolean;
  /** Count of distinct incident-terminology hits. */
  readonly incidentTermHits: number;
  readonly hasStrongPhrase: boolean;
}

export type RelevanceOutcome = 'feed' | 'review' | 'reject';

export interface RelevanceResult {
  readonly score: number;
  readonly outcome: RelevanceOutcome;
  readonly components: Readonly<Record<string, number>>;
  readonly reason: string;
}

export interface RelevanceThresholds {
  readonly feed: number;
  readonly review: number;
}

export const DEFAULT_RELEVANCE_THRESHOLDS: RelevanceThresholds = { feed: 70, review: 50 };

export function computeRelevanceScore(
  input: RelevanceInput,
  thresholds: RelevanceThresholds = DEFAULT_RELEVANCE_THRESHOLDS,
): RelevanceResult {
  // A hard "no" from the classifier is decisive — section 4 requires rejection.
  if (input.aiSaysRelated === false) {
    return {
      score: 0,
      outcome: 'reject',
      components: { aiVeto: 0 },
      reason: 'The Oil & Gas relevance classifier rejected the article.',
    };
  }

  const components: Record<string, number> = {};

  // 1. Oil & Gas relevance (max 35) — the heuristic and the model.
  const heuristicPart = (input.heuristicScore / 100) * 20;
  const aiPart = input.aiConfidence === null ? 8 : input.aiConfidence * 15;
  components['oilGasRelevance'] = heuristicPart + aiPart;

  // 2. Incident terminology (max 15).
  components['incidentTerminology'] =
    Math.min(input.incidentTermHits, 4) * 2.5 + (input.hasStrongPhrase ? 5 : 0);

  // 3. Sector clarity (max 10).
  components['sectorRelevance'] =
    input.sector === 'unknown' ? 2 : input.sector === 'integrated' ? 7 : 10;

  // 4. Source quality (max 20).
  const tierPoints: Readonly<Record<SourceTier, number>> = { 1: 20, 2: 16, 3: 14, 4: 8, 5: 4 };
  components['sourceQuality'] = tierPoints[input.bestSourceTier];

  // 5. Recency (max 12) — recent events matter more, but old ones are not rejected here.
  components['recency'] =
    input.ageInDays === null
      ? 5
      : input.ageInDays <= 1
        ? 12
        : input.ageInDays <= 7
          ? 10
          : input.ageInDays <= 14
            ? 8
            : input.ageInDays <= 30
              ? 6
              : 2;

  // 6. Location relevance (max 8).
  components['locationRelevance'] = input.matchesRequestedRegion ? 8 : 4;

  const score = Math.max(
    0,
    Math.min(100, Math.round(Object.values(components).reduce((sum, value) => sum + value, 0))),
  );

  const outcome: RelevanceOutcome =
    score >= thresholds.feed ? 'feed' : score >= thresholds.review ? 'review' : 'reject';

  const top = Object.entries(components)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([key, value]) => `${key}=${value.toFixed(0)}`)
    .join(', ');

  return {
    score,
    outcome,
    components,
    reason: `Relevance ${score}/100 (${top}) -> ${outcome}.`,
  };
}

/** Fraction of the key structured fields that were successfully extracted. */
export function dataCompleteness(record: Readonly<Record<string, unknown>>): number {
  const keyFields = [
    'incidentDate',
    'country',
    'operator',
    'asset',
    'incidentType',
    'environment',
    'lifecycleStage',
    'oilGasSector',
    'summary',
  ];
  const present = keyFields.filter((field) => {
    const value = record[field];
    return value !== null && value !== undefined && value !== '' && value !== 'unknown';
  }).length;
  return present / keyFields.length;
}
