import { describe, expect, it } from 'vitest';
import { findBestIncidentMatch, scoreIncidentSimilarity, type GroupingCandidate } from '../src';

const northSeaFire: GroupingCandidate = {
  id: 'inc-1',
  title: 'Fire on Kestrel Deep Alpha platform in the North Sea',
  incidentDate: '2026-09-10',
  country: 'United Kingdom',
  operator: 'Caledonia Offshore Energy Ltd',
  asset: 'Kestrel Deep Alpha',
  field: 'Kestrel Deep',
  incidentType: 'fire',
};

describe('incident grouping', () => {
  it('groups two reports of the same event from different publishers', () => {
    const score = scoreIncidentSimilarity(northSeaFire, {
      title: 'Blaze on North Sea platform Kestrel Deep Alpha forces down-manning',
      incidentDate: '2026-09-10',
      country: 'United Kingdom',
      operator: 'Caledonia Offshore Energy',
      asset: 'Kestrel Deep Alpha',
      field: null,
      incidentType: 'fire',
    });
    expect(score.decision).toBe('same');
    expect(score.score).toBeGreaterThan(0.72);
  });

  it('tolerates a one-day reporting difference', () => {
    const score = scoreIncidentSimilarity(northSeaFire, {
      ...northSeaFire,
      id: 'inc-2',
      incidentDate: '2026-09-11',
      title: 'Operator confirms fire on Kestrel Deep Alpha',
    });
    expect(score.decision).toBe('same');
  });

  it('vetoes different countries outright', () => {
    const score = scoreIncidentSimilarity(northSeaFire, {
      ...northSeaFire,
      id: 'inc-3',
      country: 'Norway',
    });
    expect(score.vetoed).toBe(true);
    expect(score.decision).toBe('different');
    expect(score.vetoReason).toContain('Different countries');
  });

  it('vetoes events more than a week apart', () => {
    const score = scoreIncidentSimilarity(northSeaFire, {
      ...northSeaFire,
      id: 'inc-4',
      incidentDate: '2026-08-01',
    });
    expect(score.vetoed).toBe(true);
  });

  it('does not group two different events in the same country', () => {
    const score = scoreIncidentSimilarity(northSeaFire, {
      id: 'inc-5',
      title: 'Gas leak triggers shutdown at Firthside gas processing plant',
      incidentDate: '2026-09-10',
      country: 'United Kingdom',
      operator: 'Granite Basin Resources plc',
      asset: 'Firthside Gas Processing Plant',
      field: null,
      incidentType: 'gas_leak',
    });
    expect(score.decision).not.toBe('same');
  });

  it('escalates the ambiguous middle band for model review', () => {
    const score = scoreIncidentSimilarity(northSeaFire, {
      id: 'inc-6',
      title: 'Fire reported on a North Sea production platform',
      incidentDate: '2026-09-11',
      country: 'United Kingdom',
      operator: null,
      asset: null,
      field: null,
      incidentType: 'fire',
    });
    expect(score.decision).toBe('review');
  });

  it('treats an exact well match on the same day as conclusive', () => {
    const score = scoreIncidentSimilarity(
      {
        title: 'Well control event',
        incidentDate: '2026-09-07',
        country: 'Brazil',
        operator: null,
        asset: null,
        field: null,
        wellName: '3-MPS-14D',
        incidentType: null,
      },
      {
        title: 'Influx detected during drilling',
        incidentDate: '2026-09-07',
        country: 'Brazil',
        operator: 'Mariana Petroleo',
        asset: null,
        field: null,
        wellName: '3-MPS-14D',
        incidentType: 'well_control',
      },
    );
    expect(score.decision).toBe('same');
  });

  it('finds the best match among existing incidents', () => {
    const match = findBestIncidentMatch(
      {
        title: 'North Sea platform fire: operator confirms two treated for smoke inhalation',
        incidentDate: '2026-09-10',
        country: 'United Kingdom',
        operator: 'Caledonia Offshore Energy Ltd',
        asset: 'Kestrel Deep Alpha',
        field: null,
        incidentType: 'fire',
      },
      [
        northSeaFire,
        {
          id: 'inc-other',
          title: 'Refinery explosion in Texas',
          incidentDate: '2026-09-09',
          country: 'United States',
          operator: 'Helios Refining Company',
          asset: 'Port Alder Refinery',
          field: null,
          incidentType: 'explosion',
        },
      ],
    );
    expect(match?.incident.id).toBe('inc-1');
    expect(match?.score.decision).toBe('same');
  });
});
