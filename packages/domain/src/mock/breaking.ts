/**
 * "Breaking" fictional stories that exist ONLY in the mock news corpus, never in the
 * seeded database.
 *
 * Their purpose is to make a manual scan in Mock Mode demonstrate the whole pipeline:
 *   * two brand-new incidents are discovered, grouped from multiple sources and notified;
 *   * one follow-up article lands on an already-known incident and carries a MATERIAL
 *     update (newly confirmed fatalities), which must trigger exactly one alert;
 *   * one follow-up article repeats known facts and must NOT trigger anything.
 *
 * All fictional. All URLs on the reserved example.com documentation domain.
 */
import type { LanguageCode, SourceTier } from '../taxonomy';

export interface BreakingArticle {
  readonly publisher: string;
  readonly title: string;
  readonly slug: string;
  readonly excerpt: string;
  readonly tier: SourceTier;
  readonly language: LanguageCode;
  readonly daysAgo: number;
  readonly domain?: string;
  /** Groups articles that describe the same event; used only to build the corpus. */
  readonly eventKey: string;
}

export const MOCK_BREAKING_ARTICLES: readonly BreakingArticle[] = [
  // --- New incident A: gas release on a jack-up, three independent sources ----
  {
    eventKey: 'breaking-jackup-gas-release',
    publisher: 'Global Energy Wire (fictional)',
    title: 'Gas release forces shutdown on jack-up rig off Denmark, operator says',
    slug: 'gas-release-jackup-denmark',
    excerpt:
      'Solvind Energy AS said a hydrocarbon release was detected on the jack-up drilling rig Nordvind II in the Danish North Sea. The rig was shut down and 42 personnel were evacuated to a standby vessel. No injuries were reported.',
    tier: 2,
    language: 'en',
    daysAgo: 1,
  },
  {
    eventKey: 'breaking-jackup-gas-release',
    publisher: 'Offshore Rig Intelligence (fictional)',
    title: 'Nordvind II drilling halted after hydrocarbon release in Danish North Sea',
    slug: 'nordvind-ii-drilling-halted',
    excerpt:
      'Drilling on the Nordvind II jack-up rig has been suspended following a hydrocarbon release. Solvind Energy AS confirmed an emergency shutdown was initiated and that the well was secured.',
    tier: 3,
    language: 'en',
    daysAgo: 1,
  },
  {
    eventKey: 'breaking-jackup-gas-release',
    publisher: 'Offshore Safety Regulator Bulletin (fictional)',
    title: 'Regulator notified of hydrocarbon release on Nordvind II',
    slug: 'regulator-notified-nordvind-ii',
    excerpt:
      'The offshore safety regulator confirmed it has been notified of a hydrocarbon release on the Nordvind II jack-up rig and has requested a preliminary report from the operator.',
    tier: 1,
    language: 'en',
    daysAgo: 1,
    domain: 'regulator.example.gov',
  },

  // --- New incident B: pipeline fire onshore Mexico, two sources, two languages ---
  {
    eventKey: 'breaking-pipeline-fire',
    publisher: 'Energia Andina (ficticio)',
    title: 'Incendio en oleoducto tras ruptura en Veracruz, Mexico',
    slug: 'incendio-oleoducto-veracruz',
    excerpt:
      'Un oleoducto operado por Costa Fenix Energia S.A. sufrio una ruptura seguida de incendio en Veracruz. La empresa cerro el segmento afectado y reporto dos heridos entre el personal de campo.',
    tier: 3,
    language: 'es',
    daysAgo: 3,
  },
  {
    eventKey: 'breaking-pipeline-fire',
    publisher: 'Global Energy Wire (fictional)',
    title: 'Crude pipeline rupture sparks fire in Mexico, two injured',
    slug: 'crude-pipeline-rupture-fire-mexico',
    excerpt:
      'A crude oil pipeline operated by Costa Fenix Energia S.A. ruptured and caught fire in Veracruz, Mexico. The operator isolated the affected segment and reported two injuries among field personnel.',
    tier: 2,
    language: 'en',
    daysAgo: 3,
  },

  // --- Material update to the seeded North Sea platform fire ------------------
  {
    eventKey: 'update-offshore-fire-northstar',
    publisher: 'Global Energy Wire (fictional)',
    title: 'Operator confirms one fatality following Kestrel Deep Alpha platform fire',
    slug: 'operator-confirms-fatality-kestrel-deep-alpha',
    excerpt:
      'Caledonia Offshore Energy Ltd has confirmed that one worker died of injuries sustained in the fire on the Kestrel Deep Alpha platform in the North Sea. Three people were injured in total. The regulator has opened a formal investigation.',
    tier: 2,
    language: 'en',
    daysAgo: 2,
  },

  // --- Non-material republication of the same known facts --------------------
  {
    eventKey: 'repeat-offshore-fire-northstar',
    publisher: 'Regional Energy Roundup (fictional)',
    title: 'Recap: fire on North Sea platform Kestrel Deep Alpha extinguished',
    slug: 'recap-fire-kestrel-deep-alpha',
    excerpt:
      'A round-up of the week: the fire in the produced-water module of the Kestrel Deep Alpha platform was extinguished by the deluge system and non-essential personnel were down-manned as a precaution.',
    tier: 4,
    language: 'en',
    daysAgo: 2,
  },
];
