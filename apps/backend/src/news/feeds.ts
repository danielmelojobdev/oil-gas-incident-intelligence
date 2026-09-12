/**
 * The source catalogue used when the database is not available (mock/memory mode) and
 * as the seed for `news_sources`. Mirrors supabase/migrations/0003_seed_sources.sql.
 *
 * Only feeds that are publicly published for syndication are listed.
 *
 * Every non-null `feedUrl` here has been verified to return a parseable feed. Most
 * regulators do not publish RSS at all (their "obvious" endpoints 404 or redirect into
 * nothing), so they carry `feedUrl: null` and are reached through a search provider
 * using `siteFilter`. Run `npm run -w @ogii/backend health` to re-check.
 */
import type { LanguageCode, SourceTier } from '@ogii/domain';

export interface SourceCatalogueEntry {
  readonly slug: string;
  readonly name: string;
  readonly homepage: string | null;
  readonly feedUrl: string | null;
  readonly tier: SourceTier;
  readonly country: string | null;
  readonly language: LanguageCode;
  readonly isOfficial: boolean;
  readonly isOilGasDedicated: boolean;
  /** Optional site filter used to target this publisher through a search provider. */
  readonly siteFilter: string | null;
}

export const SOURCE_CATALOGUE: readonly SourceCatalogueEntry[] = [
  // --- Tier 1: regulators and government investigation bodies ---------------
  { slug: 'uk-hse', name: 'UK Health and Safety Executive', homepage: 'https://www.hse.gov.uk', feedUrl: 'https://press.hse.gov.uk/feed/', tier: 1, country: 'United Kingdom', language: 'en', isOfficial: true, isOilGasDedicated: false, siteFilter: 'hse.gov.uk' },
  { slug: 'uk-hse-offshore', name: 'UK HSE - Offshore Major Accident Regulator', homepage: 'https://www.hse.gov.uk/offshore', feedUrl: null, tier: 1, country: 'United Kingdom', language: 'en', isOfficial: true, isOilGasDedicated: true, siteFilter: 'hse.gov.uk/offshore' },
  { slug: 'uk-nsta', name: 'North Sea Transition Authority', homepage: 'https://www.nstauthority.co.uk', feedUrl: null, tier: 1, country: 'United Kingdom', language: 'en', isOfficial: true, isOilGasDedicated: true, siteFilter: 'nstauthority.co.uk' },
  { slug: 'no-havtil', name: 'Havtil (Norwegian Ocean Industry Authority)', homepage: 'https://www.havtil.no', feedUrl: null, tier: 1, country: 'Norway', language: 'no', isOfficial: true, isOilGasDedicated: true, siteFilter: 'havtil.no' },
  { slug: 'no-sodir', name: 'Norwegian Offshore Directorate', homepage: 'https://www.sodir.no', feedUrl: null, tier: 1, country: 'Norway', language: 'no', isOfficial: true, isOilGasDedicated: true, siteFilter: 'sodir.no' },
  { slug: 'br-anp', name: 'ANP - Agencia Nacional do Petroleo', homepage: 'https://www.gov.br/anp', feedUrl: null, tier: 1, country: 'Brazil', language: 'pt', isOfficial: true, isOilGasDedicated: true, siteFilter: 'gov.br/anp' },
  { slug: 'us-bsee', name: 'BSEE', homepage: 'https://www.bsee.gov', feedUrl: null, tier: 1, country: 'United States', language: 'en', isOfficial: true, isOilGasDedicated: true, siteFilter: 'bsee.gov' },
  { slug: 'us-phmsa', name: 'PHMSA', homepage: 'https://www.phmsa.dot.gov', feedUrl: null, tier: 1, country: 'United States', language: 'en', isOfficial: true, isOilGasDedicated: true, siteFilter: 'phmsa.dot.gov' },
  { slug: 'us-csb', name: 'US Chemical Safety Board', homepage: 'https://www.csb.gov', feedUrl: null, tier: 1, country: 'United States', language: 'en', isOfficial: true, isOilGasDedicated: false, siteFilter: 'csb.gov' },
  { slug: 'au-nopsema', name: 'NOPSEMA', homepage: 'https://www.nopsema.gov.au', feedUrl: null, tier: 1, country: 'Australia', language: 'en', isOfficial: true, isOilGasDedicated: true, siteFilter: 'nopsema.gov.au' },
  { slug: 'ca-tsb', name: 'Transportation Safety Board of Canada', homepage: 'https://www.tsb.gc.ca', feedUrl: null, tier: 1, country: 'Canada', language: 'en', isOfficial: true, isOilGasDedicated: false, siteFilter: 'tsb.gc.ca' },

  // --- Tier 2: major international news -------------------------------------
  { slug: 'reuters-energy', name: 'Reuters - Energy', homepage: 'https://www.reuters.com/business/energy/', feedUrl: null, tier: 2, country: null, language: 'en', isOfficial: false, isOilGasDedicated: false, siteFilter: 'reuters.com' },
  { slug: 'bloomberg-energy', name: 'Bloomberg - Energy', homepage: 'https://www.bloomberg.com/energy', feedUrl: null, tier: 2, country: null, language: 'en', isOfficial: false, isOilGasDedicated: false, siteFilter: 'bloomberg.com' },
  { slug: 'bbc-business', name: 'BBC News - Business', homepage: 'https://www.bbc.co.uk/news/business', feedUrl: 'https://feeds.bbci.co.uk/news/business/rss.xml', tier: 2, country: 'United Kingdom', language: 'en', isOfficial: false, isOilGasDedicated: false, siteFilter: 'bbc.co.uk' },
  { slug: 'ap-news', name: 'Associated Press', homepage: 'https://apnews.com', feedUrl: null, tier: 2, country: null, language: 'en', isOfficial: false, isOilGasDedicated: false, siteFilter: 'apnews.com' },

  // --- Tier 3: recognised Oil & Gas publications -----------------------------
  { slug: 'offshore-energy', name: 'Offshore Energy', homepage: 'https://www.offshore-energy.biz', feedUrl: 'https://www.offshore-energy.biz/feed/', tier: 3, country: null, language: 'en', isOfficial: false, isOilGasDedicated: true, siteFilter: 'offshore-energy.biz' },
  { slug: 'offshore-magazine', name: 'Offshore Magazine', homepage: 'https://www.offshore-mag.com', feedUrl: null, tier: 3, country: null, language: 'en', isOfficial: false, isOilGasDedicated: true, siteFilter: 'offshore-mag.com' },
  { slug: 'upstream-online', name: 'Upstream', homepage: 'https://www.upstreamonline.com', feedUrl: null, tier: 3, country: null, language: 'en', isOfficial: false, isOilGasDedicated: true, siteFilter: 'upstreamonline.com' },
  { slug: 'energy-voice', name: 'Energy Voice', homepage: 'https://www.energyvoice.com', feedUrl: 'https://www.energyvoice.com/feed/', tier: 3, country: null, language: 'en', isOfficial: false, isOilGasDedicated: true, siteFilter: 'energyvoice.com' },
  { slug: 'world-oil', name: 'World Oil', homepage: 'https://www.worldoil.com', feedUrl: 'https://worldoil.com/rss?feed=news', tier: 3, country: null, language: 'en', isOfficial: false, isOilGasDedicated: true, siteFilter: 'worldoil.com' },
  { slug: 'ogj', name: 'Oil & Gas Journal', homepage: 'https://www.ogj.com', feedUrl: null, tier: 3, country: null, language: 'en', isOfficial: false, isOilGasDedicated: true, siteFilter: 'ogj.com' },
  { slug: 'rigzone', name: 'Rigzone', homepage: 'https://www.rigzone.com', feedUrl: 'https://www.rigzone.com/news/rss/rigzone_latest.aspx', tier: 3, country: null, language: 'en', isOfficial: false, isOilGasDedicated: true, siteFilter: 'rigzone.com' },
  { slug: 'spglobal-ci', name: 'S&P Global Commodity Insights', homepage: 'https://www.spglobal.com/commodityinsights', feedUrl: null, tier: 3, country: null, language: 'en', isOfficial: false, isOilGasDedicated: true, siteFilter: 'spglobal.com' },
  { slug: 'petronoticias', name: 'Petronoticias', homepage: 'https://petronoticias.com.br', feedUrl: null, tier: 3, country: 'Brazil', language: 'pt', isOfficial: false, isOilGasDedicated: true, siteFilter: 'petronoticias.com.br' },
  { slug: 'epbr', name: 'agencia epbr', homepage: 'https://epbr.com.br', feedUrl: null, tier: 3, country: 'Brazil', language: 'pt', isOfficial: false, isOilGasDedicated: true, siteFilter: 'epbr.com.br' },
];

const BY_HOST = new Map<string, SourceCatalogueEntry>();
for (const entry of SOURCE_CATALOGUE) {
  if (entry.siteFilter !== null) BY_HOST.set(entry.siteFilter.split('/')[0] ?? entry.siteFilter, entry);
}

/** Looks up the catalogue entry for an article URL, so tier can be assigned from the host. */
export function catalogueEntryForUrl(url: string): SourceCatalogueEntry | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^(www|m|amp)\./, '');
    const direct = BY_HOST.get(host);
    if (direct !== undefined) return direct;
    for (const [key, entry] of BY_HOST) {
      if (host === key || host.endsWith(`.${key}`)) return entry;
    }
    return null;
  } catch {
    return null;
  }
}

/** Tier for an arbitrary URL: catalogue first, then a conservative default. */
export function tierForUrl(url: string, fallback: SourceTier = 5): SourceTier {
  const entry = catalogueEntryForUrl(url);
  if (entry !== null) return entry.tier;
  try {
    const host = new URL(url).hostname.toLowerCase();
    // Government and regulator domains are Tier 1 wherever they appear.
    if (/\.(gov|gov\.[a-z]{2}|mil)$/.test(host) || /\bgov\./.test(host)) return 1;
  } catch {
    return fallback;
  }
  return fallback;
}

export function isOilGasDedicatedUrl(url: string): boolean {
  return catalogueEntryForUrl(url)?.isOilGasDedicated ?? false;
}

export function publisherNameForUrl(url: string, fallback: string): string {
  return catalogueEntryForUrl(url)?.name ?? fallback;
}

/** Feeds that can actually be polled directly. */
export function pollableFeeds(): SourceCatalogueEntry[] {
  return SOURCE_CATALOGUE.filter((entry) => entry.feedUrl !== null);
}
