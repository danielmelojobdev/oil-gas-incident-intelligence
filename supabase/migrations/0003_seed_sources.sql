-- =============================================================================
-- Seed: providers and the priority source catalogue (brief sections 7 and 8).
--
-- Only sources that publish a public RSS/Atom feed or a documented public API are
-- listed. Nothing here scrapes a site, bypasses a paywall or ignores robots.txt.
-- Feed URLs marked NULL are reachable through a search provider rather than a feed.
-- =============================================================================

insert into public.source_providers (id, name, kind, requires_api_key, default_tier, notes) values
  ('mock',            'Mock Provider',                'mock',      false, 3, 'Deterministic fictional data for Mock Mode.'),
  ('rss',             'RSS / Atom feeds',             'feed',      false, 3, 'Publisher and regulator feeds from news_sources.'),
  ('google-news-rss', 'Google News RSS',              'search',    false, 4, 'Public RSS search endpoint. Results are links to publishers.'),
  ('gdelt',           'GDELT 2.0 Doc API',            'search',    false, 4, 'Free global news index; generous but rate limited.'),
  ('bing-news',       'Bing News Search API',         'search',    true,  4, 'Requires BING_API_KEY.'),
  ('google-cse',      'Google Programmable Search',   'search',    true,  4, 'Requires GOOGLE_SEARCH_API_KEY and engine id.'),
  ('newsapi',         'NewsAPI.org',                  'search',    true,  4, 'Requires NEWS_API_KEY.')
on conflict (id) do update set
  name = excluded.name, kind = excluded.kind,
  requires_api_key = excluded.requires_api_key, default_tier = excluded.default_tier,
  notes = excluded.notes;

-- ----------------------------------------------------------------------------
-- Tier 1 — regulators, government investigation bodies, official statements
-- ----------------------------------------------------------------------------
insert into public.news_sources
  (slug, name, homepage, feed_url, provider_id, kind, tier, country, language, is_official, is_oil_gas_dedicated)
values
  ('uk-hse',        'UK Health and Safety Executive',                 'https://www.hse.gov.uk',            'https://www.hse.gov.uk/news/rss/news.xml',  'rss', 'regulator', 1, 'United Kingdom', 'en', true,  false),
  ('uk-hse-offshore','UK HSE — Offshore Major Accident Regulator',    'https://www.hse.gov.uk/offshore',   null,                                         'rss', 'regulator', 1, 'United Kingdom', 'en', true,  true),
  ('uk-nsta',       'North Sea Transition Authority',                 'https://www.nstauthority.co.uk',    null,                                         'rss', 'regulator', 1, 'United Kingdom', 'en', true,  true),
  ('no-havtil',     'Havtil (Norwegian Ocean Industry Authority)',    'https://www.havtil.no',             null,                                         'rss', 'regulator', 1, 'Norway',         'no', true,  true),
  ('no-sodir',      'Norwegian Offshore Directorate',                 'https://www.sodir.no',              null,                                         'rss', 'regulator', 1, 'Norway',         'no', true,  true),
  ('br-anp',        'ANP — Agencia Nacional do Petroleo (Brazil)',    'https://www.gov.br/anp',            null,                                         'rss', 'regulator', 1, 'Brazil',         'pt', true,  true),
  ('us-bsee',       'BSEE — Bureau of Safety and Environmental Enforcement', 'https://www.bsee.gov',       null,                                         'rss', 'regulator', 1, 'United States',  'en', true,  true),
  ('us-phmsa',      'PHMSA — Pipeline and Hazardous Materials Safety Administration', 'https://www.phmsa.dot.gov', null,                                 'rss', 'regulator', 1, 'United States',  'en', true,  true),
  ('us-csb',        'US Chemical Safety Board',                       'https://www.csb.gov',               null,                                         'rss', 'regulator', 1, 'United States',  'en', true,  false),
  ('au-nopsema',    'NOPSEMA',                                        'https://www.nopsema.gov.au',        null,                                         'rss', 'regulator', 1, 'Australia',      'en', true,  true),
  ('ca-tsb',        'Transportation Safety Board of Canada',          'https://www.tsb.gc.ca',             null,                                         'rss', 'regulator', 1, 'Canada',         'en', true,  false)
on conflict (slug) do update set
  name = excluded.name, homepage = excluded.homepage, feed_url = excluded.feed_url,
  tier = excluded.tier, is_official = excluded.is_official,
  is_oil_gas_dedicated = excluded.is_oil_gas_dedicated;

-- ----------------------------------------------------------------------------
-- Tier 2 — major international news organisations
-- Accessed through their public feeds or through a licensed search API.
-- ----------------------------------------------------------------------------
insert into public.news_sources
  (slug, name, homepage, feed_url, provider_id, kind, tier, country, language, is_official, is_oil_gas_dedicated)
values
  ('reuters-energy',   'Reuters — Energy',   'https://www.reuters.com/business/energy/',  null, 'google-news-rss', 'search', 2, null, 'en', false, false),
  ('bloomberg-energy', 'Bloomberg — Energy', 'https://www.bloomberg.com/energy',          null, 'google-news-rss', 'search', 2, null, 'en', false, false),
  ('bbc-business',     'BBC News — Business','https://www.bbc.co.uk/news/business',       'https://feeds.bbci.co.uk/news/business/rss.xml', 'rss', 'feed', 2, 'United Kingdom', 'en', false, false),
  ('ap-news',          'Associated Press',   'https://apnews.com',                        null, 'google-news-rss', 'search', 2, null, 'en', false, false)
on conflict (slug) do update set name = excluded.name, tier = excluded.tier;

-- ----------------------------------------------------------------------------
-- Tier 3 — recognised Oil & Gas publications
-- ----------------------------------------------------------------------------
insert into public.news_sources
  (slug, name, homepage, feed_url, provider_id, kind, tier, country, language, is_official, is_oil_gas_dedicated)
values
  ('offshore-energy',   'Offshore Energy',                  'https://www.offshore-energy.biz',   null, 'google-news-rss', 'search', 3, null, 'en', false, true),
  ('offshore-magazine', 'Offshore Magazine',                'https://www.offshore-mag.com',      null, 'google-news-rss', 'search', 3, null, 'en', false, true),
  ('upstream-online',   'Upstream',                         'https://www.upstreamonline.com',    null, 'google-news-rss', 'search', 3, null, 'en', false, true),
  ('energy-voice',      'Energy Voice',                     'https://www.energyvoice.com',       null, 'google-news-rss', 'search', 3, null, 'en', false, true),
  ('world-oil',         'World Oil',                        'https://www.worldoil.com',          null, 'google-news-rss', 'search', 3, null, 'en', false, true),
  ('ogj',               'Oil & Gas Journal',                'https://www.ogj.com',               null, 'google-news-rss', 'search', 3, null, 'en', false, true),
  ('rigzone',           'Rigzone',                          'https://www.rigzone.com',           null, 'google-news-rss', 'search', 3, null, 'en', false, true),
  ('spglobal-ci',       'S&P Global Commodity Insights',    'https://www.spglobal.com/commodityinsights', null, 'google-news-rss', 'search', 3, null, 'en', false, true),
  ('petronoticias',     'Petronoticias (Brazil)',           'https://petronoticias.com.br',      null, 'google-news-rss', 'search', 3, 'Brazil', 'pt', false, true),
  ('epbr',              'agencia epbr (Brazil)',            'https://epbr.com.br',               null, 'google-news-rss', 'search', 3, 'Brazil', 'pt', false, true)
on conflict (slug) do update set name = excluded.name, tier = excluded.tier,
  is_oil_gas_dedicated = excluded.is_oil_gas_dedicated;
