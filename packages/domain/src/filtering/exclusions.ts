/**
 * Hard exclusions (brief section 4).
 *
 * These are domains that produce a constant stream of "fire / explosion / accident"
 * headlines with no Oil & Gas relevance. A hit here is a veto UNLESS the text also
 * contains an unambiguous Oil & Gas anchor (a refinery genuinely can be next to a
 * chemical plant; a helicopter genuinely can crash on the way to a platform).
 */
import { foldCase } from '../text/normalise';

export interface ExclusionDomain {
  readonly id: string;
  readonly label: string;
  readonly patterns: readonly RegExp[];
  /**
   * Whether an Oil & Gas anchor phrase can rescue an article from this domain.
   *
   * True for domains that describe real events which sometimes belong to our industry
   * (a helicopter crash ferrying crew to a platform). False for domains that are not
   * events at all: a market-research report about blowout preventers mentions every
   * anchor term we have and is still not an incident. Defaults to true.
   */
  readonly overridable?: boolean;
}

export const EXCLUSION_DOMAINS: readonly ExclusionDomain[] = [
  {
    id: 'mining',
    label: 'Mining',
    patterns: [
      /\b(coal|gold|copper|iron ore|diamond|lithium|bauxite)\s+mine\b/i,
      /\bmine\s+(collapse|shaft|workers?)\b/i,
      /\bmining\s+(accident|disaster|company|operation)\b/i,
      /\btailings?\s+dam\b/i,
      /\b(mineracao|mina de carvao|garimpo|barragem de rejeitos)\b/i,
      /\b(mineria|mina de carbon)\b/i,
      /\b(kullgruve|gruvedrift)\b/i,
    ],
  },
  {
    id: 'construction',
    label: 'Civil construction',
    patterns: [
      /\b(building|bridge|tunnel|scaffold(ing)?|crane)\s+collapse\b/i,
      /\bconstruction\s+site\s+(accident|death|collapse)\b/i,
      /\b(obra|canteiro de obras|desabamento de predio)\b/i,
    ],
  },
  {
    id: 'aviation',
    label: 'Commercial aviation',
    patterns: [
      /\b(airliner|passenger (jet|plane|aircraft)|boeing 7\d\d|airbus a3\d\d)\b/i,
      /\bairport\s+(runway|terminal)\b/i,
      /\b(flight\s+\w{2}\d{2,4})\b/i,
      /\bhelicopter\s+(crash|crashed|ditch|ditched|ditches|ditching|down)\b/i,
      /\b(queda de aviao|acidente aereo)\b/i,
      /\b(accidente aereo)\b/i,
      /\b(flyulykke)\b/i,
    ],
  },
  {
    id: 'road',
    label: 'Road traffic',
    patterns: [
      /\b(car|bus|lorry|truck|motorcycle|van)\s+(crash|collision|accident)\b/i,
      /\b(motorway|highway|interstate)\s+(pile-?up|crash|closure)\b/i,
      /\b(road traffic collision|hit and run|drink driving)\b/i,
      /\b(acidente de transito|acidente rodoviario|capotamento)\b/i,
      /\b(trafikkulykke)\b/i,
    ],
  },
  {
    id: 'rail',
    label: 'Rail',
    patterns: [
      /\b(train|rail(way)?|locomotive|metro|tram)\s+(derail(ment|ed)?|crash|collision)\b/i,
      /\blevel crossing\b/i,
      /\b(acidente ferroviario|descarrilamento)\b/i,
      /\b(togulykke)\b/i,
    ],
  },
  {
    id: 'residential',
    label: 'Residential / commercial fires',
    patterns: [
      /\b(house|home|apartment|flat|tower block|residential|bungalow)\s+(fire|blaze)\b/i,
      /\b(shop|store|restaurant|hotel|nightclub|warehouse|shopping (centre|center|mall))\s+(fire|blaze)\b/i,
      /\b(school|hospital|church|mosque|temple)\s+fire\b/i,
      /\b(incendio residencial|incendio em apartamento|incendio em loja)\b/i,
      /\b(boligbrann)\b/i,
    ],
  },
  {
    id: 'agriculture',
    label: 'Agriculture',
    patterns: [
      /\b(farm|barn|silo|tractor|harvest|livestock|poultry|grain elevator)\b.*\b(fire|accident|explosion)\b/i,
      /\b(fertili[sz]er (plant|depot))\b/i,
    ],
  },
  {
    id: 'pharma-food',
    label: 'Pharmaceutical / food industry',
    patterns: [
      /\b(pharmaceutical|drug manufacturing|vaccine)\s+(plant|factory|facility)\b/i,
      /\b(food|dairy|brewery|bakery|meat processing|sugar mill)\s+(plant|factory|processing)\b/i,
      /\b(fish|seafood|poultry|meat)\s+(processing|processor|factory|plant)\b/i,
      /\b(industria farmaceutica|industria alimenticia)\b/i,
    ],
  },
  {
    id: 'renewables-nuclear',
    label: 'Solar / wind / nuclear',
    patterns: [
      /\b(solar (farm|park|panel|plant)|photovoltaic)\b/i,
      /\b(wind (farm|turbine|park)|offshore wind)\b/i,
      /\b(nuclear (plant|reactor|power station)|radioactive|reactor core)\b/i,
      /\b(usina solar|parque eolico|usina nuclear)\b/i,
      /\b(vindpark|vindmolle|atomkraftverk)\b/i,
    ],
  },
  {
    id: 'generic-industry',
    label: 'Generic industry',
    patterns: [
      /\b(steel (mill|plant)|foundry|cement (plant|factory)|paper mill|textile (factory|mill)|car (plant|factory)|semiconductor fab)\b/i,
    ],
  },
  {
    id: 'unrelated-marine',
    label: 'Marine incidents unrelated to Oil & Gas',
    patterns: [
      /\b(ferry|cruise ship|fishing (boat|vessel|trawler)|migrant boat|yacht|container ship|car carrier)\b/i,
      /\bnavy (vessel|ship|submarine)\b/i,
    ],
  },
  {
    id: 'market-news',
    label: 'Market and corporate news (not an incident)',
    // Not overridable: no anchor phrase turns a market report into an event.
    overridable: false,
    patterns: [
      /\b(share price|stock (price|market)|quarterly (results|earnings)|dividend|ipo|merger|acquisition deal|analyst (rating|note)|price target)\b/i,
      /\b(oil prices? (rise|fall|climb|slip|drop|jump|surge|steady))\b/i,
      /\b(brent|wti)\s+(crude\s+)?(futures|price)/i,
      /\b(bolsa de valores|lucro trimestral|acoes da)\b/i,
      // Vendor market-research reports rank highly for technical terms but describe
      // no event: "Blowout Preventer Market Growth ... To Reach $45.02 Billion By 2030".
      /\bmarket\s+(size|growth|share|report|forecast|outlook|research|analysis|trends?|valuation)\b/i,
      /\b(cagr|compound annual growth rate)\b/i,
      /\b(billion|million|trillion)\s+by\s+20\d\d\b/i,
      /\bexpected to (reach|grow|expand)\b/i,
      /\b(industry|market)\s+(report|study)\s+20\d\d\b/i,
      // Macro and rates coverage borrows our vocabulary: "Jobs blowout meets Oil shock".
      /\b(jobs?|sales|revenue|earnings|quarterly|salon|hair)\s+blowout\b/i,
      /\b(bonds?|treasuries|equities|stocks?|shares?)\s+(sell|sold|rally|rout|slump)/i,
      /\bsell[-\s]?off\b/i,
      /\b(the fed|federal reserve|jobs report|payrolls|interest rates?)\b/i,
    ],
  },
];

/**
 * Unambiguous Oil & Gas anchors. Their presence cancels an exclusion hit, because
 * "helicopter crash while flying crew to an offshore platform" is in scope.
 */
const OIL_GAS_ANCHORS: readonly RegExp[] = [
  /\b(oil|gas|petroleum|petrochemical|hydrocarbon)s?\s+(platform|rig|field|well|refinery|terminal|pipeline|plant|installation|facility|production|company|major|giant|worker)/i,
  /\b(offshore|onshore|subsea)\s+(platform|rig|installation|oil|gas|drilling|production|well|field)/i,
  /\b(drilling rig|drillship|jack-?up|semi-?submersible|fpso|fso|wellhead|blowout preventer|christmas tree)\b/i,
  /\b(refinery|refineries|lng (plant|terminal|carrier)|gas processing plant|compressor station|oil terminal|tank farm)\b/i,
  // NOTE: bare "blowout" is deliberately NOT an anchor. It is ambiguous in ordinary
  // English ("salon blowout", "jobs blowout", a sporting blowout) and on its own it
  // let a hair-care article through with a relevance score of 73.
  /\b(well (control|integrity|barrier|blowout)|blowout preventer|(oil|gas|water)\s+well\s+blowout|loss of containment|hydrocarbon release)\b/i,
  /\b(oil|gas)\s*(pipeline|duct)|(pipeline)\s+(carrying|transporting)\s+(oil|gas|crude)/i,
  /\b(north sea|gulf of mexico|pre-?sal|permian basin|campos basin|santos basin|norwegian continental shelf)\b/i,
  /\b(petrobras|equinor|exxonmobil|chevron|totalenergies|conocophillips|aramco|adnoc|shell|bp plc|eni|pemex|pdvsa|cnooc|transocean|valaris|seadrill|halliburton|schlumberger|baker hughes)\b/i,
  /\b(plataforma de petroleo|refinaria|gasoduto|oleoduto|poco de petroleo|sonda de perfuracao)\b/i,
  /\b(oljeplattform|borerigg|raffineri|rorledning|bronnkontroll)\b/i,
];

export interface ExclusionVerdict {
  readonly excluded: boolean;
  readonly domain: string | null;
  readonly reason: string | null;
  /** True when an exclusion matched but an Oil & Gas anchor overrode it. */
  readonly overriddenByAnchor: boolean;
}

const NOT_EXCLUDED: ExclusionVerdict = {
  excluded: false,
  domain: null,
  reason: null,
  overriddenByAnchor: false,
};

export function hasOilGasAnchor(text: string): boolean {
  const folded = foldCase(text);
  return OIL_GAS_ANCHORS.some((pattern) => pattern.test(folded));
}

/** Evaluates the hard exclusion list against the article text. */
export function evaluateExclusions(text: string): ExclusionVerdict {
  const folded = foldCase(text);
  for (const domain of EXCLUSION_DOMAINS) {
    const hit = domain.patterns.find((pattern) => pattern.test(folded));
    if (hit === undefined) continue;
    if (domain.overridable !== false && hasOilGasAnchor(folded)) {
      return {
        excluded: false,
        domain: domain.id,
        reason: `Matched exclusion "${domain.label}" but an explicit Oil & Gas anchor is present.`,
        overriddenByAnchor: true,
      };
    }
    return {
      excluded: true,
      domain: domain.id,
      reason: `Excluded: the article is about ${domain.label.toLowerCase()} with no Oil & Gas anchor.`,
      overriddenByAnchor: false,
    };
  }
  return NOT_EXCLUDED;
}
