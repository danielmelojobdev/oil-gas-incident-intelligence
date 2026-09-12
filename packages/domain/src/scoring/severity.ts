/**
 * Severity (brief section 30): rule-based scoring blended with the model's opinion.
 * Never the model alone.
 *
 * The result is always presented in the UI as "System-assessed severity" because it is
 * not an official classification by any regulator.
 */
import type { IncidentType, Severity } from '../taxonomy';

export interface SeverityInput {
  readonly fatalities: number | null;
  readonly injuries: number | null;
  readonly missingPersons: number | null;
  readonly evacuatedPersons: number | null;
  readonly incidentType: IncidentType;
  readonly secondaryIncidentTypes?: readonly IncidentType[];
  readonly isWellIntegrityRelated: boolean | null;
  readonly wellIntegrityCategory: string | null;
  readonly isProcessSafetyEvent: boolean | null;
  readonly hydrocarbonRelease: boolean | null;
  readonly environmentalImpact: string | null;
  readonly productionImpact: string | null;
  readonly shutdown: boolean | null;
  readonly fire: boolean | null;
  readonly explosion: boolean | null;
  readonly spill: boolean | null;
  /** The model's own severity call, blended in at 25% weight. */
  readonly aiSeverity?: Severity | null;
}

export interface SeverityResult {
  readonly severity: Severity;
  readonly score: number;
  readonly ruleScore: number;
  readonly aiScore: number | null;
  readonly factors: readonly string[];
  /** Always true for this system: we never publish an official severity rating. */
  readonly isSystemAssessed: true;
}

const SEVERITY_SCORES: Readonly<Record<Severity, number>> = {
  low: 20,
  moderate: 45,
  high: 70,
  critical: 90,
};

export function severityFromScore(score: number): Severity {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'moderate';
  return 'low';
}

const CRITICAL_TYPES: ReadonlySet<IncidentType> = new Set<IncidentType>([
  'blowout',
  'explosion',
  'well_control',
]);

const HIGH_TYPES: ReadonlySet<IncidentType> = new Set<IncidentType>([
  'fire',
  'loss_of_containment',
  'hydrocarbon_release',
  'toxic_gas_release',
  'pipeline_rupture',
  'oil_spill',
  'well_integrity',
  'structural_failure',
]);

export function computeSeverity(input: SeverityInput): SeverityResult {
  const factors: string[] = [];
  let score = 10;

  // --- Human consequences dominate ---------------------------------------
  const fatalities = input.fatalities ?? 0;
  if (fatalities >= 5) {
    score += 75;
    factors.push(`${fatalities} fatalities reported`);
  } else if (fatalities > 1) {
    score += 60;
    factors.push(`${fatalities} fatalities reported`);
  } else if (fatalities === 1) {
    score += 45;
    factors.push('1 fatality reported');
  }

  const missing = input.missingPersons ?? 0;
  if (missing > 0) {
    score += Math.min(30, 15 + missing * 5);
    factors.push(`${missing} person(s) missing`);
  }

  const injuries = input.injuries ?? 0;
  if (injuries >= 10) {
    score += 28;
    factors.push(`${injuries} injuries reported`);
  } else if (injuries >= 3) {
    score += 18;
    factors.push(`${injuries} injuries reported`);
  } else if (injuries > 0) {
    score += 10;
    factors.push(`${injuries} injury/injuries reported`);
  }

  const evacuated = input.evacuatedPersons ?? 0;
  if (evacuated >= 100) {
    score += 18;
    factors.push(`${evacuated} people evacuated`);
  } else if (evacuated > 0) {
    score += 10;
    factors.push(`${evacuated} people evacuated`);
  }

  // --- Event nature -------------------------------------------------------
  const allTypes: IncidentType[] = [input.incidentType, ...(input.secondaryIncidentTypes ?? [])];
  if (allTypes.some((type) => CRITICAL_TYPES.has(type))) {
    score += 25;
    factors.push('Loss of well control / explosion class event');
  } else if (allTypes.some((type) => HIGH_TYPES.has(type))) {
    score += 15;
    factors.push('Major hazard event class');
  }

  if (input.explosion === true) {
    score += 12;
    factors.push('Explosion confirmed');
  }
  if (input.fire === true) {
    score += 8;
    factors.push('Fire confirmed');
  }
  if (input.hydrocarbonRelease === true) {
    score += 10;
    factors.push('Hydrocarbon release confirmed');
  }
  if (input.spill === true) {
    score += 8;
    factors.push('Spill confirmed');
  }

  // --- Barriers and process safety ---------------------------------------
  if (input.wellIntegrityCategory === 'multiple_barrier_failure') {
    score += 20;
    factors.push('Multiple barrier failure');
  } else if (
    input.wellIntegrityCategory === 'primary_barrier_failure' ||
    input.wellIntegrityCategory === 'secondary_barrier_failure'
  ) {
    score += 12;
    factors.push('Well barrier failure');
  } else if (input.isWellIntegrityRelated === true) {
    score += 8;
    factors.push('Well integrity involved');
  }

  if (input.isProcessSafetyEvent === true) {
    score += 6;
    factors.push('Process safety event');
  }

  // --- Business and environment ------------------------------------------
  if (input.environmentalImpact !== null && input.environmentalImpact.trim().length > 0) {
    const major = /major|significant|large|widespread|severe|thousands|barrels/i.test(input.environmentalImpact);
    score += major ? 14 : 6;
    factors.push(major ? 'Major environmental impact reported' : 'Environmental impact reported');
  }
  if (input.shutdown === true) {
    score += 6;
    factors.push('Shutdown');
  }
  if (input.productionImpact !== null && input.productionImpact.trim().length > 0) {
    score += 4;
    factors.push('Production affected');
  }

  const ruleScore = Math.max(0, Math.min(100, score));

  // --- Blend with the model (25%) -----------------------------------------
  const aiScore = input.aiSeverity == null ? null : SEVERITY_SCORES[input.aiSeverity];
  const blended = aiScore === null ? ruleScore : Math.round(ruleScore * 0.75 + aiScore * 0.25);

  return {
    severity: severityFromScore(blended),
    score: blended,
    ruleScore,
    aiScore,
    factors,
    isSystemAssessed: true,
  };
}
