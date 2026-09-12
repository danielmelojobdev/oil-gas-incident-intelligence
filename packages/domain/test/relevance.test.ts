import { describe, expect, it } from 'vitest';
import { evaluateExclusions, evaluateOilGasHeuristics, hasOilGasAnchor } from '../src';

describe('Oil & Gas relevance heuristics', () => {
  it('accepts a clear offshore platform fire', () => {
    const verdict = evaluateOilGasHeuristics({
      title: 'Fire breaks out on North Sea oil platform, crew evacuated',
      excerpt: 'The operator said the fire on the production platform was extinguished.',
    });
    expect(verdict.passed).toBe(true);
    expect(verdict.hasEventSignal).toBe(true);
    expect(verdict.hasIndustrySignal).toBe(true);
    expect(verdict.score).toBeGreaterThanOrEqual(60);
  });

  it('rejects a generic fire with no Oil & Gas relation (brief section 4)', () => {
    const verdict = evaluateOilGasHeuristics({
      title: 'Fire destroys city centre restaurant',
      excerpt: 'Firefighters spent four hours tackling the blaze.',
    });
    expect(verdict.passed).toBe(false);
  });

  it('rejects a coal mine accident', () => {
    const verdict = evaluateOilGasHeuristics({
      title: 'Twelve trapped after coal mine collapse',
      excerpt: 'Rescue teams are working at the mining accident site.',
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.exclusion.domain).toBe('mining');
  });

  it.each([
    ['Boeing 737 passenger jet makes emergency landing after engine fire', 'aviation'],
    ['Three killed in motorway pile-up as lorry crash closes road', 'road'],
    ['Train derailment injures 20 near level crossing', 'rail'],
    ['Apartment fire forces residents to evacuate tower block', 'residential'],
    ['Explosion reported at wind turbine in offshore wind farm', 'renewables-nuclear'],
    ['Nuclear reactor shutdown after cooling failure at nuclear plant', 'renewables-nuclear'],
    ['Fire at pharmaceutical plant halts drug manufacturing', 'pharma-food'],
    ['Cruise ship collision leaves passengers stranded', 'unrelated-marine'],
  ])('rejects out-of-scope headline: %s', (title, domain) => {
    const verdict = evaluateOilGasHeuristics({ title, excerpt: null });
    expect(verdict.passed).toBe(false);
    expect(verdict.exclusion.domain).toBe(domain);
  });

  it('rejects oil market news that is not an incident', () => {
    const verdict = evaluateOilGasHeuristics({
      title: 'Oil prices rise as Brent crude futures climb on supply concerns',
      excerpt: 'Analysts raised their price target for the quarter.',
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.exclusion.domain).toBe('market-news');
  });

  it('keeps an in-scope helicopter crash serving an offshore platform', () => {
    const verdict = evaluateOilGasHeuristics({
      title: 'Helicopter carrying crew to offshore oil platform ditches in North Sea',
      excerpt: 'All 13 occupants were recovered by the standby vessel.',
    });
    expect(verdict.passed).toBe(true);
    expect(verdict.exclusion.excluded).toBe(false);
  });

  it('accepts Portuguese, Spanish and Norwegian headlines', () => {
    expect(
      evaluateOilGasHeuristics({ title: 'Incendio atinge plataforma de petroleo na Bacia de Campos' }).passed,
    ).toBe(true);
    expect(
      evaluateOilGasHeuristics({ title: 'Explosion en refineria deja varios heridos, confirma la empresa' }).passed,
    ).toBe(true);
    expect(
      evaluateOilGasHeuristics({ title: 'Gasslekkasje pa oljeplattform forte til nedstengning' }).passed,
    ).toBe(true);
  });

  it('honours user exclude keywords', () => {
    const verdict = evaluateOilGasHeuristics({
      title: 'Fire on North Sea oil platform operated by Example Energy',
      excludeKeywords: ['Example Energy'],
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.exclusion.domain).toBe('user-keyword');
  });

  it('boosts a dedicated Oil & Gas source without an explicit industry term', () => {
    const verdict = evaluateOilGasHeuristics({
      title: 'Operator reports loss of containment during maintenance',
      sourceIsOilGasDedicated: true,
      sourceTier: 1,
    });
    expect(verdict.passed).toBe(true);
  });

  it('detects an Oil & Gas anchor', () => {
    expect(hasOilGasAnchor('a fire at the refinery in port alder')).toBe(true);
    expect(hasOilGasAnchor('a fire at the bakery in port alder')).toBe(false);
  });

  it('lets an Oil & Gas anchor override an exclusion domain', () => {
    const verdict = evaluateExclusions(
      'helicopter crash while transporting workers to an offshore oil platform',
    );
    expect(verdict.excluded).toBe(false);
    expect(verdict.overriddenByAnchor).toBe(true);
  });
});
