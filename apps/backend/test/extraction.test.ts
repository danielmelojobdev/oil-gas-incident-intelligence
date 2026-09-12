import { describe, expect, it } from 'vitest';
import { extractIncidentHeuristically } from '../src/ai/heuristic-extraction';
import type { ArticleForAi } from '../src/ai/ai-provider';

function article(title: string, excerpt: string | null = null): ArticleForAi {
  return {
    id: 'a1',
    title,
    excerpt,
    publisher: 'Test Wire (fictional)',
    publishedAt: '2026-09-11T08:00:00.000Z',
    url: 'https://example.com/a',
    language: 'en',
    sourceTier: 3,
  };
}

describe('rules-only extraction (Mock Mode engine and AI-outage fallback)', () => {
  it('prefers an explicit country over regional shorthand', () => {
    const result = extractIncidentHeuristically([
      article(
        'Nordvind II drilling halted after hydrocarbon release in Danish North Sea',
        'Solvind Energy AS confirmed an emergency shutdown on the jack-up rig Nordvind II.',
      ),
    ]);
    expect(result.country).toBe('Denmark');
    expect(result.countryCode).toBe('DK');
  });

  it('falls back to regional shorthand when no country is named', () => {
    const result = extractIncidentHeuristically([
      article('Fire on North Sea production platform', 'The operator reported a fire on the platform.'),
    ]);
    expect(result.country).toBe('United Kingdom');
  });

  it('extracts a named asset in either word order', () => {
    expect(
      extractIncidentHeuristically([article('Blaze on the drilling rig Crest Explorer II')]).asset,
    ).toBe('Crest Explorer II');
    expect(
      extractIncidentHeuristically([article('Crest Explorer II semi-submersible rig suspends drilling')]).asset,
    ).toBe('Crest Explorer II');
  });

  it('does not mistake a company name for an asset', () => {
    const result = extractIncidentHeuristically([
      article('Helios Refining Company refinery reports unit shutdown'),
    ]);
    expect(result.asset).not.toBe('Helios Refining Company');
  });

  it('extracts an operator only when a corporate marker is present', () => {
    expect(
      extractIncidentHeuristically([article('Caledonia Offshore Energy Ltd confirms platform fire')]).operator,
    ).toBe('Caledonia Offshore Energy Ltd');
    expect(extractIncidentHeuristically([article('Fire reported on a platform')]).operator).toBeNull();
  });

  it('reads casualty counts written as words or digits', () => {
    expect(extractIncidentHeuristically([article('Two workers injured in refinery blast')]).injuries).toBe(2);
    expect(extractIncidentHeuristically([article('7 people were injured at the gas plant')]).injuries).toBe(7);
  });

  it('distinguishes "no fatalities reported" (0) from silence (null)', () => {
    expect(
      extractIncidentHeuristically([article('Platform fire extinguished', 'No fatalities were reported.')]).fatalities,
    ).toBe(0);
    expect(extractIncidentHeuristically([article('Platform fire extinguished')]).fatalities).toBeNull();
  });

  it('never invents a water depth or a failed component', () => {
    const result = extractIncidentHeuristically([
      article('Deepwater platform fire in the Gulf of Mexico', 'A fire broke out on the platform.'),
    ]);
    expect(result.waterDepthCategory).toBeNull();
    expect(result.suspectedFailedComponent).toBeNull();
  });

  it('classifies well integrity vocabulary', () => {
    const result = extractIncidentHeuristically([
      article('Sustained casing pressure found on subsea producer', 'Annulus pressure was detected on the A-annulus.'),
    ]);
    expect(result.isWellIntegrityRelated).toBe(true);
    expect(result.wellIntegrityCategory).toBe('annulus');
  });

  it('recognises a pipeline rupture in Spanish', () => {
    const result = extractIncidentHeuristically([
      article('Incendio en oleoducto tras ruptura en Veracruz, Mexico', 'Costa Fenix Energia S.A. cerro el segmento.'),
    ]);
    expect(result.country).toBe('Mexico');
    expect(['pipeline_rupture', 'fire']).toContain(result.incidentType);
  });

  it('caps its own confidence: rules are never as sure as a model', () => {
    const result = extractIncidentHeuristically([
      article('Explosion and fire at refinery alkylation unit kills one', 'One worker died and seven were injured.'),
    ]);
    expect(result.confidence).toBeLessThanOrEqual(0.75);
  });
});
