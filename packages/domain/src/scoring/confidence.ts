/**
 * Confidence (brief section 31): how much should the reader trust this record?
 *
 * Driven by evidence quality, not by how dramatic the event is.
 */
import type { ConfidenceLevel, SourceTier } from '../taxonomy';

export interface ConfidenceInput {
  /** Tier of every source attached to the incident. */
  readonly sourceTiers: readonly SourceTier[];
  /** How many distinct publishers (not articles) back the incident. */
  readonly distinctPublishers: number;
  /** Agreement between sources on the key facts, 0-1. `null` when only one source exists. */
  readonly crossSourceAgreement: number | null;
  /** Fraction of the key structured fields that are populated, 0-1. */
  readonly dataCompleteness: number;
  /** The model's own confidence in its classification, 0-1. */
  readonly aiConfidence: number | null;
  /** True when at least one field carries per-field provenance. */
  readonly hasEvidence: boolean;
}

export interface ConfidenceResult {
  readonly confidence: ConfidenceLevel;
  readonly score: number;
  readonly factors: readonly string[];
  readonly hasOfficialSource: boolean;
  readonly bestTier: SourceTier;
}

const TIER_POINTS: Readonly<Record<SourceTier, number>> = {
  1: 45,
  2: 32,
  3: 25,
  4: 14,
  5: 5,
};

export function confidenceFromScore(score: number): ConfidenceLevel {
  if (score >= 75) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

export function computeConfidence(input: ConfidenceInput): ConfidenceResult {
  const factors: string[] = [];
  const tiers = input.sourceTiers.length > 0 ? input.sourceTiers : ([5] as const);
  const bestTier = tiers.reduce<SourceTier>((best, tier) => (tier < best ? tier : best), 5);
  const hasOfficialSource = bestTier === 1;

  let score = TIER_POINTS[bestTier];
  factors.push(
    hasOfficialSource
      ? 'Official regulator or operator source present'
      : `Best available source is tier ${bestTier}`,
  );

  // Corroboration.
  const publishers = Math.max(1, input.distinctPublishers);
  if (publishers >= 4) {
    score += 18;
    factors.push(`${publishers} independent publishers`);
  } else if (publishers === 3) {
    score += 13;
    factors.push('3 independent publishers');
  } else if (publishers === 2) {
    score += 8;
    factors.push('2 independent publishers');
  } else {
    score -= 5;
    factors.push('Single source only');
  }

  // A second tier-1/2 source is worth more than a fourth tier-4 source.
  const strongSources = tiers.filter((tier) => tier <= 2).length;
  if (strongSources >= 2) {
    score += 6;
    factors.push('Multiple high-authority sources');
  }

  if (input.crossSourceAgreement !== null) {
    const agreementPoints = Math.round((input.crossSourceAgreement - 0.5) * 24);
    score += agreementPoints;
    if (input.crossSourceAgreement >= 0.8) factors.push('Sources agree on the key facts');
    else if (input.crossSourceAgreement < 0.5) factors.push('Sources disagree on some facts');
  }

  score += Math.round(input.dataCompleteness * 14);
  if (input.dataCompleteness >= 0.7) factors.push('Structured data is largely complete');
  else if (input.dataCompleteness < 0.35) factors.push('Few structured details available');

  if (input.hasEvidence) {
    score += 4;
    factors.push('Per-field provenance recorded');
  }

  if (input.aiConfidence !== null) {
    score += Math.round((input.aiConfidence - 0.5) * 16);
  }

  const finalScore = Math.max(0, Math.min(100, score));
  return {
    confidence: confidenceFromScore(finalScore),
    score: finalScore,
    factors,
    hasOfficialSource,
    bestTier,
  };
}

/** Measures how much two extracted records agree on the facts that matter. */
export function crossSourceAgreement(
  records: readonly Readonly<Record<string, unknown>>[],
  fields: readonly string[],
): number | null {
  if (records.length < 2) return null;
  let comparable = 0;
  let agreeing = 0;
  for (const field of fields) {
    const values = records
      .map((record) => record[field])
      .filter((value) => value !== null && value !== undefined && value !== '');
    if (values.length < 2) continue;
    comparable += 1;
    const normalised = values.map((value) => String(value).trim().toLowerCase());
    const first = normalised[0];
    if (normalised.every((value) => value === first)) agreeing += 1;
  }
  return comparable === 0 ? null : agreeing / comparable;
}
