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

/**
 * Regression cases captured from the first real scan against live RSS and Google News.
 *
 * Every headline here was actually returned by a provider. The false positives all
 * scored highly before the fixes: substring matching ("oil" inside "soil"), bare
 * "blowout" acting as an Oil & Gas anchor, and market-research reports having no
 * exclusion rule at all.
 */
describe('real-world headlines from the first live scan', () => {
  const accepted = (title: string, excerpt?: string): boolean =>
    evaluateOilGasHeuristics({ title, excerpt: excerpt ?? null }).passed;

  it.each([
    ['salon blowout (hair care, not a well)', 'How to make your salon blowout last for days: Products, tips and more'],
    ['jobs blowout (macro news)', 'Jobs blowout meets Oil shock: Bonds sell off as Fed remains between a rock and hard place'],
    ['"oil" inside "soil"', 'Two companies and an individual sentenced after worker crushed by two tonnes of soil in trench collapse'],
    ['vendor market report', 'Blowout Preventer Market Growth Accelerates As Industry Expected To Reach 45 Billion By 2030'],
    ['fish processing prosecution', 'Six-figure fine for fish processing company after supervisor suffered life-threatening injuries'],
  ])('rejects %s', (_name, title) => {
    expect(accepted(title)).toBe(false);
  });

  it.each([
    ['onshore well blowout', 'Kilgore Fire Department monitoring oil well blowout on CR 173 in Rusk County'],
    ['offshore spill', 'Alaska officials respond to mystery spill near idled Cook Inlet oil platform'],
    ['operator prosecuted for hydrocarbon leaks', 'Six-figure fine for ExxonMobil after five leaks of extremely flammable hydrocarbons at Fife chemical plant'],
    ['platform design / hydrocarbon release', 'Shell advised to change unsuitable North Sea platform design over six years before hydrocarbon release'],
    ['fatal well explosion', 'Lawsuit: Companies ignored safety warnings before well explosion killed two, burned survivor'],
    ['fracking flowback release', 'DEP: An Estimated 336,000 Gallons Of Fracking Flowback Water Was Released During An Uncontrolled Shale Gas Well Release'],
  ])('accepts %s', (_name, title) => {
    expect(accepted(title)).toBe(true);
  });

  it('matches plural forms of glossary terms', () => {
    // A word-boundary matcher that ignored plurals silently rejected real incidents.
    expect(accepted('Multiple gas leaks reported at the refinery')).toBe(true);
    expect(accepted('Hydrocarbons released from an offshore platform')).toBe(true);
  });

  it('does not match a glossary term embedded inside another word', () => {
    const verdict = evaluateOilGasHeuristics({
      title: 'Worker crushed by soil in a trench collapse at a building site',
    });
    expect(verdict.matchedIndustryTerms).not.toContain('oil');
    expect(verdict.passed).toBe(false);
  });

  it('lets an anchor rescue an event domain but never a market report', () => {
    // Aviation is overridable: a crash ferrying crew to a platform is in scope.
    expect(
      evaluateExclusions('helicopter crash while flying crew to an offshore oil platform').excluded,
    ).toBe(false);
    // Market news is not: anchors are exactly what a vendor report is full of.
    expect(
      evaluateExclusions('blowout preventer market size forecast expected to reach 45 billion by 2030').excluded,
    ).toBe(true);
  });
});
