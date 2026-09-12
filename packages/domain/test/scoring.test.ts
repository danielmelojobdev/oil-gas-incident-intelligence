import { describe, expect, it } from 'vitest';
import {
  computeConfidence,
  computeRelevanceScore,
  computeSeverity,
  crossSourceAgreement,
  dataCompleteness,
  severityFromScore,
} from '../src';

const baseSeverity = {
  fatalities: null,
  injuries: null,
  missingPersons: null,
  evacuatedPersons: null,
  incidentType: 'gas_leak' as const,
  isWellIntegrityRelated: null,
  wellIntegrityCategory: null,
  isProcessSafetyEvent: null,
  hydrocarbonRelease: null,
  environmentalImpact: null,
  productionImpact: null,
  shutdown: null,
  fire: null,
  explosion: null,
  spill: null,
};

describe('severity', () => {
  it('rates a minor leak with no consequences as low', () => {
    const result = computeSeverity(baseSeverity);
    expect(result.severity).toBe('low');
    expect(result.isSystemAssessed).toBe(true);
  });

  it('rates multiple fatalities as critical', () => {
    const result = computeSeverity({ ...baseSeverity, fatalities: 3, incidentType: 'explosion', explosion: true });
    expect(result.severity).toBe('critical');
    expect(result.factors.some((factor) => factor.includes('fatalities'))).toBe(true);
  });

  it('escalates a blowout with multiple barrier failure', () => {
    const result = computeSeverity({
      ...baseSeverity,
      incidentType: 'blowout',
      isWellIntegrityRelated: true,
      wellIntegrityCategory: 'multiple_barrier_failure',
      fire: true,
      evacuatedPersons: 320,
    });
    expect(['high', 'critical']).toContain(result.severity);
  });

  it('does not treat an unreported casualty count as zero', () => {
    const withNull = computeSeverity({ ...baseSeverity, fatalities: null });
    const withZero = computeSeverity({ ...baseSeverity, fatalities: 0 });
    expect(withNull.score).toBe(withZero.score); // 0 adds nothing, null adds nothing
    expect(withNull.factors).not.toContain('0 fatalities reported');
  });

  it('blends the model opinion at 25% and never lets it dominate', () => {
    const rulesOnly = computeSeverity(baseSeverity);
    const withAi = computeSeverity({ ...baseSeverity, aiSeverity: 'critical' });
    expect(withAi.score).toBeGreaterThan(rulesOnly.score);
    expect(withAi.score).toBeLessThan(90);
    expect(withAi.ruleScore).toBe(rulesOnly.ruleScore);
  });

  it('maps scores to bands', () => {
    expect(severityFromScore(10)).toBe('low');
    expect(severityFromScore(40)).toBe('moderate');
    expect(severityFromScore(65)).toBe('high');
    expect(severityFromScore(95)).toBe('critical');
  });
});

describe('confidence', () => {
  it('rates a single tier-5 source as low', () => {
    const result = computeConfidence({
      sourceTiers: [5],
      distinctPublishers: 1,
      crossSourceAgreement: null,
      dataCompleteness: 0.2,
      aiConfidence: 0.5,
      hasEvidence: false,
    });
    expect(result.confidence).toBe('low');
    expect(result.hasOfficialSource).toBe(false);
  });

  it('rates a regulator plus three corroborating sources as high', () => {
    const result = computeConfidence({
      sourceTiers: [1, 2, 3, 4],
      distinctPublishers: 4,
      crossSourceAgreement: 0.9,
      dataCompleteness: 0.85,
      aiConfidence: 0.9,
      hasEvidence: true,
    });
    expect(result.confidence).toBe('high');
    expect(result.hasOfficialSource).toBe(true);
    expect(result.bestTier).toBe(1);
  });

  it('penalises disagreement between sources', () => {
    const agree = computeConfidence({
      sourceTiers: [2, 3],
      distinctPublishers: 2,
      crossSourceAgreement: 0.95,
      dataCompleteness: 0.6,
      aiConfidence: 0.7,
      hasEvidence: false,
    });
    const disagree = computeConfidence({
      sourceTiers: [2, 3],
      distinctPublishers: 2,
      crossSourceAgreement: 0.2,
      dataCompleteness: 0.6,
      aiConfidence: 0.7,
      hasEvidence: false,
    });
    expect(disagree.score).toBeLessThan(agree.score);
  });

  it('measures cross-source agreement', () => {
    expect(
      crossSourceAgreement(
        [
          { operator: 'Acme', country: 'UK' },
          { operator: 'Acme', country: 'UK' },
        ],
        ['operator', 'country'],
      ),
    ).toBe(1);
    expect(
      crossSourceAgreement(
        [
          { operator: 'Acme', country: 'UK' },
          { operator: 'Other', country: 'UK' },
        ],
        ['operator', 'country'],
      ),
    ).toBe(0.5);
    expect(crossSourceAgreement([{ operator: 'Acme' }], ['operator'])).toBeNull();
  });
});

describe('relevance score', () => {
  const input = {
    heuristicScore: 85,
    aiConfidence: 0.92,
    aiSaysRelated: true,
    sector: 'upstream' as const,
    bestSourceTier: 1 as const,
    ageInDays: 2,
    matchesRequestedRegion: true,
    incidentTermHits: 4,
    hasStrongPhrase: true,
  };

  it('sends a strong candidate to the feed', () => {
    const result = computeRelevanceScore(input);
    expect(result.outcome).toBe('feed');
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it('rejects outright when the classifier says it is not Oil & Gas', () => {
    const result = computeRelevanceScore({ ...input, aiSaysRelated: false });
    expect(result.outcome).toBe('reject');
    expect(result.score).toBe(0);
  });

  it('sends a weak but plausible candidate to review', () => {
    const result = computeRelevanceScore({
      ...input,
      heuristicScore: 60,
      aiConfidence: 0.65,
      bestSourceTier: 4,
      sector: 'midstream',
      ageInDays: 20,
      matchesRequestedRegion: false,
      incidentTermHits: 2,
      hasStrongPhrase: false,
    });
    expect(result.outcome).toBe('review');
  });

  it('honours custom thresholds', () => {
    const result = computeRelevanceScore({ ...input, heuristicScore: 50, aiConfidence: 0.5 }, { feed: 95, review: 90 });
    expect(result.outcome).toBe('reject');
  });

  it('measures data completeness', () => {
    expect(dataCompleteness({})).toBe(0);
    expect(
      dataCompleteness({
        incidentDate: '2026-09-10',
        country: 'UK',
        operator: 'Acme',
        asset: 'Alpha',
        incidentType: 'fire',
        environment: 'offshore',
        lifecycleStage: 'production',
        oilGasSector: 'upstream',
        summary: 'text',
      }),
    ).toBe(1);
    expect(dataCompleteness({ environment: 'unknown', country: 'UK' })).toBeCloseTo(1 / 9, 5);
  });
});
