import { describe, expect, it } from 'vitest';
import { detectMaterialUpdate, type IncidentFactsSnapshot } from '../src';

const before: IncidentFactsSnapshot = {
  fatalities: null,
  injuries: 2,
  missingPersons: null,
  evacuatedPersons: 68,
  severity: 'high',
  severityScore: 62,
  environmentalImpact: null,
  productionImpact: null,
  shutdown: null,
  operator: 'Caledonia Offshore Energy Ltd',
  asset: 'Kestrel Deep Alpha',
  wellName: null,
  isWellIntegrityRelated: false,
  wellIntegrityCategory: null,
  suspectedFailedComponent: null,
  barrierFunctionImpacted: null,
  isProcessSafetyEvent: true,
  processSafetyCategory: 'fire',
  cause: null,
  hasOfficialSource: false,
  incidentDate: '2026-09-10',
};

describe('material update detection', () => {
  it('treats an identical republication as non-material (brief section 37)', () => {
    const result = detectMaterialUpdate(before, { ...before });
    expect(result.isMaterialUpdate).toBe(false);
    expect(result.changes).toHaveLength(0);
  });

  it('produces a stable fingerprint for unchanged facts', () => {
    expect(detectMaterialUpdate(before, { ...before }).fingerprint).toBe(
      detectMaterialUpdate(before, { ...before }).fingerprint,
    );
  });

  it('flags newly confirmed fatalities', () => {
    const result = detectMaterialUpdate(before, { ...before, fatalities: 1 });
    expect(result.isMaterialUpdate).toBe(true);
    expect(result.changes).toContain('fatalities_confirmed');
  });

  it('flags a change in the injury count', () => {
    const result = detectMaterialUpdate(before, { ...before, injuries: 7 });
    expect(result.changes).toContain('injuries_changed');
  });

  it('flags an official investigation appearing', () => {
    const result = detectMaterialUpdate(before, { ...before, hasOfficialSource: true });
    expect(result.changes).toContain('official_investigation');
  });

  it('flags a severity escalation', () => {
    const result = detectMaterialUpdate(before, { ...before, severity: 'critical', severityScore: 92 });
    expect(result.changes).toContain('severity_increased');
    expect(result.changes).toContain('major_escalation');
  });

  it('flags new well control information', () => {
    const result = detectMaterialUpdate(before, {
      ...before,
      isWellIntegrityRelated: true,
      wellIntegrityCategory: 'well_control',
    });
    expect(result.changes).toContain('well_integrity_information');
    expect(result.changes).toContain('well_control_development');
  });

  it('does not let the model invent materiality', () => {
    const result = detectMaterialUpdate(before, { ...before }, {
      isMaterialUpdate: true,
      changeTypes: ['dramatic_rewrite'],
      reason: 'The article uses stronger language.',
    });
    expect(result.isMaterialUpdate).toBe(false);
  });

  it('lets the model add colour to a real change', () => {
    const result = detectMaterialUpdate(before, { ...before, fatalities: 2 }, {
      isMaterialUpdate: true,
      changeTypes: ['fatalities_confirmed'],
      reason: 'The operator has now confirmed two fatalities.',
    });
    expect(result.isMaterialUpdate).toBe(true);
    expect(result.descriptions.join(' ')).toContain('confirmed two fatalities');
  });

  it('changes the fingerprint when the facts change', () => {
    expect(detectMaterialUpdate(before, { ...before }).fingerprint).not.toBe(
      detectMaterialUpdate(before, { ...before, fatalities: 1 }).fingerprint,
    );
  });
});
