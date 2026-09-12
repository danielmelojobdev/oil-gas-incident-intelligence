/**
 * Material update detection (brief section 18 + 37).
 *
 * An existing incident being re-reported is normal and must NOT ring the user's phone.
 * Only a genuine change in the facts is material. Rules decide first; the model is a
 * tie-breaker that can add nuance but cannot invent a change that the fields do not show.
 */
import { updateFingerprint } from '../text/hash';

export interface IncidentFactsSnapshot {
  readonly fatalities: number | null;
  readonly injuries: number | null;
  readonly missingPersons: number | null;
  readonly evacuatedPersons: number | null;
  readonly severity: string;
  readonly severityScore: number;
  readonly environmentalImpact: string | null;
  readonly productionImpact: string | null;
  readonly shutdown: boolean | null;
  readonly operator: string | null;
  readonly asset: string | null;
  readonly wellName: string | null;
  readonly isWellIntegrityRelated: boolean | null;
  readonly wellIntegrityCategory: string | null;
  readonly suspectedFailedComponent: string | null;
  readonly barrierFunctionImpacted: string | null;
  readonly isProcessSafetyEvent: boolean | null;
  readonly processSafetyCategory: string | null;
  readonly cause?: string | null;
  /** Whether an official investigation / regulator statement is attached. */
  readonly hasOfficialSource: boolean;
  readonly incidentDate: string | null;
}

export type MaterialChangeType =
  | 'fatalities_confirmed'
  | 'fatalities_increased'
  | 'injuries_changed'
  | 'missing_persons'
  | 'major_escalation'
  | 'environmental_impact'
  | 'official_investigation'
  | 'operator_statement'
  | 'cause_confirmed'
  | 'production_shutdown'
  | 'severity_increased'
  | 'well_integrity_information'
  | 'well_control_development'
  | 'incident_date_established';

export interface MaterialUpdateResult {
  readonly isMaterialUpdate: boolean;
  readonly changes: readonly MaterialChangeType[];
  readonly descriptions: readonly string[];
  /** Stable key: the same set of facts always yields the same fingerprint. */
  readonly fingerprint: string;
  readonly reason: string;
}

function countChanged(before: number | null, after: number | null): 'new' | 'increased' | 'changed' | 'none' {
  if (after === null) return 'none';
  if (before === null) return 'new';
  if (after > before) return 'increased';
  if (after !== before) return 'changed';
  return 'none';
}

/**
 * Compares the previous and incoming facts of an incident.
 *
 * `aiVerdict` may only *confirm* materiality or add a description; it cannot make a
 * change material when no field actually moved, which is what stops the model from
 * generating notification spam out of rewritten prose.
 */
export function detectMaterialUpdate(
  before: IncidentFactsSnapshot,
  after: IncidentFactsSnapshot,
  aiVerdict?: { isMaterialUpdate: boolean; changeTypes: readonly string[]; reason: string } | null,
): MaterialUpdateResult {
  const changes: MaterialChangeType[] = [];
  const descriptions: string[] = [];

  const fatalities = countChanged(before.fatalities, after.fatalities);
  if (fatalities === 'new' && (after.fatalities ?? 0) > 0) {
    changes.push('fatalities_confirmed');
    descriptions.push(`Fatalities confirmed: ${after.fatalities}.`);
  } else if (fatalities === 'increased') {
    changes.push('fatalities_increased');
    descriptions.push(`Fatalities revised from ${before.fatalities} to ${after.fatalities}.`);
  }

  const injuries = countChanged(before.injuries, after.injuries);
  if (injuries === 'new' || injuries === 'increased' || injuries === 'changed') {
    changes.push('injuries_changed');
    descriptions.push(
      before.injuries === null
        ? `Injuries reported: ${after.injuries}.`
        : `Injuries revised from ${before.injuries} to ${after.injuries}.`,
    );
  }

  const missing = countChanged(before.missingPersons, after.missingPersons);
  if (missing !== 'none' && (after.missingPersons ?? 0) > 0) {
    changes.push('missing_persons');
    descriptions.push(`Missing persons: ${after.missingPersons}.`);
  }

  if (after.severityScore - before.severityScore >= 15) {
    changes.push('severity_increased');
    descriptions.push(`Severity raised from ${before.severity} to ${after.severity}.`);
  }
  if (after.severityScore - before.severityScore >= 30) {
    changes.push('major_escalation');
    descriptions.push('Major escalation reported.');
  }

  if (before.environmentalImpact === null && after.environmentalImpact !== null) {
    changes.push('environmental_impact');
    descriptions.push('Environmental impact reported.');
  }

  if (!before.hasOfficialSource && after.hasOfficialSource) {
    changes.push('official_investigation');
    descriptions.push('An official source or investigation update is now attached.');
  }

  if ((before.cause ?? null) === null && (after.cause ?? null) !== null) {
    changes.push('cause_confirmed');
    descriptions.push('A cause has been reported.');
  }

  if (before.shutdown !== true && after.shutdown === true) {
    changes.push('production_shutdown');
    descriptions.push('Production shutdown reported.');
  } else if (before.productionImpact === null && after.productionImpact !== null) {
    changes.push('production_shutdown');
    descriptions.push('Production impact reported.');
  }

  const wellIntegrityBefore = `${before.isWellIntegrityRelated}|${before.wellIntegrityCategory}|${before.suspectedFailedComponent}|${before.barrierFunctionImpacted}`;
  const wellIntegrityAfter = `${after.isWellIntegrityRelated}|${after.wellIntegrityCategory}|${after.suspectedFailedComponent}|${after.barrierFunctionImpacted}`;
  if (wellIntegrityBefore !== wellIntegrityAfter && after.isWellIntegrityRelated === true) {
    changes.push('well_integrity_information');
    descriptions.push('New well integrity information reported.');
  }

  if (
    before.wellIntegrityCategory !== after.wellIntegrityCategory &&
    (after.wellIntegrityCategory === 'well_control' || after.wellIntegrityCategory === 'multiple_barrier_failure')
  ) {
    changes.push('well_control_development');
    descriptions.push('Significant well control development reported.');
  }

  if (before.incidentDate === null && after.incidentDate !== null) {
    changes.push('incident_date_established');
    descriptions.push(`Incident date established: ${after.incidentDate}.`);
  }

  if ((before.operator === null || before.operator === '') && after.operator !== null) {
    changes.push('operator_statement');
    descriptions.push(`Operator identified: ${after.operator}.`);
  }

  const fingerprint = updateFingerprint([
    after.fatalities,
    after.injuries,
    after.missingPersons,
    after.evacuatedPersons,
    after.severity,
    after.environmentalImpact,
    after.productionImpact,
    after.shutdown,
    after.operator,
    after.asset,
    after.wellName,
    after.isWellIntegrityRelated,
    after.wellIntegrityCategory,
    after.suspectedFailedComponent,
    after.barrierFunctionImpacted,
    after.isProcessSafetyEvent,
    after.processSafetyCategory,
    after.cause ?? null,
    after.hasOfficialSource,
    after.incidentDate,
  ]);

  const ruleMaterial = changes.length > 0;

  // The model may only add colour to a change the rules already found.
  if (ruleMaterial && aiVerdict != null && aiVerdict.isMaterialUpdate && aiVerdict.reason.length > 0) {
    descriptions.push(aiVerdict.reason);
  }

  return {
    isMaterialUpdate: ruleMaterial,
    changes: [...new Set(changes)],
    descriptions,
    fingerprint,
    reason: ruleMaterial
      ? `Material update: ${[...new Set(changes)].join(', ')}.`
      : 'No change in the reported facts — treated as a republication (no notification).',
  };
}
