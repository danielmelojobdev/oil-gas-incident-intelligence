-- =============================================================================
-- Oil & Gas Incident Intelligence — initial schema
--
-- Target: PostgreSQL 15+ (Supabase). Runs unmodified on vanilla Postgres.
--
-- Conventions
--   * Enum-like columns are text + CHECK (decision D11): taxonomies evolve, and
--     `ALTER TYPE ... ADD VALUE` cannot run inside a transaction.
--     The canonical lists live in packages/domain/src/taxonomy.ts.
--   * Every optional fact is genuinely NULL-able. NULL means "not reported";
--     0 means "a source explicitly said zero". They are never interchangeable.
--   * created_at / updated_at on every table, updated_at maintained by trigger.
-- =============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";    -- fuzzy title matching
create extension if not exists "unaccent";   -- multilingual search

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at honest
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =============================================================================
-- Users and preferences
-- =============================================================================

-- On Supabase this mirrors auth.users. On vanilla Postgres it stands alone.
-- To link it on Supabase, add:
--   alter table public.users add constraint users_auth_fk
--     foreign key (id) references auth.users(id) on delete cascade;
create table if not exists public.users (
  id              uuid primary key default gen_random_uuid(),
  email           text unique,
  display_name    text,
  locale          text not null default 'en',
  is_active       boolean not null default true,
  -- GDPR: set when the user requests deletion; a retention job hard-deletes later.
  deletion_requested_at timestamptz,
  last_seen_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id               uuid primary key references public.users(id) on delete cascade,
  theme                 text not null default 'system' check (theme in ('system','light','dark')),
  default_period        text not null default 'last_30_days'
                          check (default_period in ('today','last_7_days','last_14_days','last_30_days','all_time')),
  default_date_axis     text not null default 'incident_date'
                          check (default_date_axis in ('incident_date','published_at')),
  regions               text[] not null default array['worldwide'],
  custom_countries      text[] not null default array[]::text[],
  languages             text[] not null default array['en'],
  notifications_enabled boolean not null default true,
  notifications_sound   boolean not null default true,
  critical_only         boolean not null default false,
  min_severity          text not null default 'moderate' check (min_severity in ('low','moderate','high','critical')),
  notify_severities     text[] not null default array[]::text[],
  notify_incident_types text[] not null default array[]::text[],
  notify_countries      text[] not null default array[]::text[],
  well_integrity_alerts boolean not null default true,
  well_control_alerts   boolean not null default true,
  quiet_hours_start     time,
  quiet_hours_end       time,
  data_retention_days   integer not null default 730 check (data_retention_days between 30 and 3650),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- A named, reusable set of search settings (brief section 11).
create table if not exists public.search_profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references public.users(id) on delete cascade,
  name                text not null,
  is_default          boolean not null default false,
  period              text not null default 'last_30_days'
                        check (period in ('today','last_7_days','last_14_days','last_30_days','all_time')),
  date_axis           text not null default 'incident_date' check (date_axis in ('incident_date','published_at')),
  regions             text[] not null default array['worldwide'],
  custom_countries    text[] not null default array[]::text[],
  languages           text[] not null default array['en'],
  min_relevance_score integer not null default 70 check (min_relevance_score between 0 and 100),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.keywords (
  id                uuid primary key default gen_random_uuid(),
  search_profile_id uuid not null references public.search_profiles(id) on delete cascade,
  term              text not null,
  language          text check (language in ('en','pt','es','fr','no')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (search_profile_id, term)
);

create table if not exists public.excluded_keywords (
  id                uuid primary key default gen_random_uuid(),
  search_profile_id uuid not null references public.search_profiles(id) on delete cascade,
  term              text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (search_profile_id, term)
);

-- =============================================================================
-- Sources
-- =============================================================================

create table if not exists public.source_providers (
  id               text primary key,                -- 'rss' | 'gdelt' | 'bing-news' | ...
  name             text not null,
  kind             text not null check (kind in ('search','feed','regulator','mock')),
  enabled          boolean not null default true,
  requires_api_key boolean not null default false,
  default_tier     smallint not null default 5 check (default_tier between 1 and 5),
  rate_limit_per_minute integer,
  notes            text,
  last_health_check_at timestamptz,
  last_health_ok   boolean,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.news_sources (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  name             text not null,
  homepage         text,
  feed_url         text,
  provider_id      text references public.source_providers(id) on delete set null,
  kind             text not null default 'feed' check (kind in ('search','feed','regulator','mock')),
  -- Tier 1 official ... Tier 5 unverified (brief section 8)
  tier             smallint not null default 5 check (tier between 1 and 5),
  country          text,
  language         text check (language in ('en','pt','es','fr','no')),
  is_official      boolean not null default false,
  -- True when the outlet publishes only Oil & Gas content (grants an industry anchor).
  is_oil_gas_dedicated boolean not null default false,
  enabled          boolean not null default true,
  last_fetched_at  timestamptz,
  last_status      text,
  consecutive_failures integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists news_sources_enabled_idx on public.news_sources (enabled, tier);

-- =============================================================================
-- Scan runs  (written before incidents so articles can reference them)
-- =============================================================================

create table if not exists public.scan_runs (
  id                  uuid primary key default gen_random_uuid(),
  trigger             text not null default 'scheduled' check (trigger in ('scheduled','manual','backfill')),
  status              text not null default 'queued'
                        check (status in ('queued','running','completed','failed','partial')),
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  duration_ms         integer,
  provider_count      integer not null default 0,
  queries_generated   integer not null default 0,
  results_found       integer not null default 0,
  results_rejected    integer not null default 0,
  articles_processed  integer not null default 0,
  duplicates_found    integer not null default 0,
  new_incidents       integer not null default 0,
  updated_incidents   integer not null default 0,
  notifications_sent  integer not null default 0,
  ai_calls            integer not null default 0,
  ai_tokens_estimated integer not null default 0,
  errors              text[] not null default array[]::text[],
  stage               text,
  progress            numeric(4,3) not null default 0 check (progress between 0 and 1),
  config              jsonb not null default '{}'::jsonb,
  is_mock             boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists scan_runs_started_idx on public.scan_runs (started_at desc);
create index if not exists scan_runs_status_idx on public.scan_runs (status, started_at desc);

create table if not exists public.scan_run_provider_results (
  id               uuid primary key default gen_random_uuid(),
  scan_run_id      uuid not null references public.scan_runs(id) on delete cascade,
  provider_id      text not null,
  queries_executed integer not null default 0,
  results_found    integer not null default 0,
  duration_ms      integer not null default 0,
  error_count      integer not null default 0,
  retry_count      integer not null default 0,
  healthy          boolean not null default true,
  error_message    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (scan_run_id, provider_id)
);

-- =============================================================================
-- Incidents  (brief section 46)
-- =============================================================================

create table if not exists public.incidents (
  id                          uuid primary key default gen_random_uuid(),

  -- Identification
  title                       text not null,
  summary                     text,
  incident_date               date,
  incident_time               time,
  incident_date_is_estimated  boolean not null default false,
  detected_at                 timestamptz not null default now(),
  last_updated_at             timestamptz not null default now(),

  -- Location  (lat/lon present from day one for the future incident map)
  country                     text,
  country_code                char(2),
  region                      text,
  city                        text,
  basin                       text,
  block                       text,
  field                       text,
  latitude                    double precision check (latitude between -90 and 90),
  longitude                   double precision check (longitude between -180 and 180),

  -- Organisation
  operator                    text,
  operator_normalized         text,
  company                     text,
  licence_holder              text,
  drilling_contractor         text,
  service_company             text,
  pipeline_operator           text,

  -- Asset
  asset                       text,
  asset_normalized            text,
  installation                text,
  installation_type           text check (installation_type in (
                                'fixed_platform','jack_up','semi_submersible','drillship','fpso','fso','tlp','spar',
                                'wellhead_platform','subsea_installation','refinery','pipeline','terminal',
                                'lng_facility','gas_processing_plant','compressor_station','storage_facility','unknown')),
  vessel                      text,

  -- Well
  well_name                   text,
  well_number                 text,
  well_type                   text check (well_type in (
                                'producer','injector','exploration','appraisal','development','disposal',
                                'gas_storage','unknown')),
  well_status                 text check (well_status in (
                                'drilling','completion','production','injection','intervention','workover',
                                'suspended','abandoned','p_and_a','unknown')),

  -- Classification
  oil_gas_sector              text not null default 'unknown'
                                check (oil_gas_sector in ('upstream','midstream','downstream','integrated','unknown')),
  environment                 text not null default 'unknown'
                                check (environment in ('offshore','onshore','subsea','unknown')),
  water_depth_category        text check (water_depth_category in
                                ('shallow_water','deepwater','ultra_deepwater','unknown')),
  lifecycle_stage             text not null default 'unknown'
                                check (lifecycle_stage in ('design','drilling','completion','commissioning','production',
                                'injection','intervention','workover','suspension','p_and_a','unknown')),
  incident_type               text not null default 'other',
  secondary_incident_types    text[] not null default array[]::text[],

  -- Well integrity (brief section 23) — NULL when there is no evidence
  is_well_integrity_related   boolean,
  well_integrity_category     text check (well_integrity_category in (
                                'primary_barrier_failure','secondary_barrier_failure','multiple_barrier_failure',
                                'well_control','bop','wellhead','christmas_tree','tubing','casing','cement','packer',
                                'annulus','dhsv_scssv','subsea_safety_system','integrity_monitoring',
                                'loss_of_containment','structural_integrity','unknown')),
  suspected_failed_component  text,
  barrier_function_impacted   text check (barrier_function_impacted in ('primary','secondary','both','unknown')),

  -- Process safety (brief section 24)
  is_process_safety_event     boolean,
  process_safety_category     text check (process_safety_category in (
                                'loss_of_primary_containment','hydrocarbon_release','fire','explosion',
                                'toxic_gas_release','spill','overpressure','emergency_shutdown',
                                'structural_failure','unknown')),

  -- Assessment (system-assessed, never official)
  severity                    text not null default 'low' check (severity in ('low','moderate','high','critical')),
  severity_score              integer not null default 0 check (severity_score between 0 and 100),
  confidence                  text not null default 'low' check (confidence in ('low','medium','high')),
  confidence_score            integer not null default 0 check (confidence_score between 0 and 100),
  relevance_score             integer not null default 0 check (relevance_score between 0 and 100),

  -- Consequences: NULL = not reported. 0 = a source said zero.
  fatalities                  integer check (fatalities >= 0),
  injuries                    integer check (injuries >= 0),
  missing_persons             integer check (missing_persons >= 0),
  evacuated_persons           integer check (evacuated_persons >= 0),
  hydrocarbon_release         boolean,
  environmental_impact        text,
  production_impact           text,
  production_interruption     boolean,
  shutdown                    boolean,
  asset_damage                text,
  fire                        boolean,
  explosion                   boolean,
  spill                       boolean,
  leak                        boolean,
  well_control_event          boolean,

  -- Lifecycle
  status                      text not null default 'new'
                                check (status in ('new','updated','monitoring','under_review','archived')),
  source_count                integer not null default 0,
  highest_source_tier         smallint not null default 5 check (highest_source_tier between 1 and 5),
  has_official_source         boolean not null default false,
  is_mock                     boolean not null default false,
  first_scan_run_id           uuid references public.scan_runs(id) on delete set null,
  grouping_signature          text,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- Feed / history query paths
create index if not exists incidents_incident_date_idx on public.incidents (incident_date desc nulls last);
create index if not exists incidents_detected_at_idx  on public.incidents (detected_at desc);
create index if not exists incidents_severity_idx     on public.incidents (severity, incident_date desc);
create index if not exists incidents_country_idx      on public.incidents (country_code, incident_date desc);
create index if not exists incidents_operator_idx     on public.incidents (operator_normalized);
create index if not exists incidents_sector_idx       on public.incidents (oil_gas_sector, environment);
create index if not exists incidents_type_idx         on public.incidents (incident_type);
create index if not exists incidents_relevance_idx    on public.incidents (relevance_score desc);
create index if not exists incidents_well_integrity_idx
  on public.incidents (is_well_integrity_related) where is_well_integrity_related is true;
create index if not exists incidents_mock_idx on public.incidents (is_mock);
-- Grouping lookups: candidates are fetched by date window + country.
create index if not exists incidents_grouping_idx on public.incidents (incident_date, country_code);
-- Future world map: cheap bounding-box filter without requiring PostGIS.
create index if not exists incidents_geo_idx on public.incidents (latitude, longitude)
  where latitude is not null and longitude is not null;

-- Full-text search over the fields the user actually searches (brief section 38)
alter table public.incidents
  add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple',
      coalesce(operator, '') || ' ' || coalesce(company, '') || ' ' || coalesce(asset, '') || ' ' ||
      coalesce(installation, '') || ' ' || coalesce(field, '') || ' ' || coalesce(well_name, '') || ' ' ||
      coalesce(country, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(summary, '')), 'C')
  ) stored;

create index if not exists incidents_search_idx on public.incidents using gin (search_vector);
create index if not exists incidents_title_trgm_idx on public.incidents using gin (title gin_trgm_ops);

-- =============================================================================
-- Articles  (brief section 47)
-- =============================================================================

create table if not exists public.articles (
  id             uuid primary key default gen_random_uuid(),
  incident_id    uuid references public.incidents(id) on delete set null,
  source_id      uuid references public.news_sources(id) on delete set null,
  scan_run_id    uuid references public.scan_runs(id) on delete set null,
  provider       text not null,
  publisher      text not null,
  title          text not null,
  original_url   text not null,
  canonical_url  text,
  -- The deduplication key. UNIQUE is what guarantees "never the same article twice".
  normalized_url text not null,
  published_at   timestamptz,
  author         text,
  language       text check (language in ('en','pt','es','fr','no')),
  -- Metadata only (decision D7): excerpt as published, never the full body.
  excerpt        text,
  source_tier    smallint not null default 5 check (source_tier between 1 and 5),
  title_hash     text not null,
  content_hash   text not null,
  relevance_score integer check (relevance_score between 0 and 100),
  rejected_reason text,
  processed_at   timestamptz,
  is_mock        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint articles_normalized_url_key unique (normalized_url)
);

create index if not exists articles_incident_idx    on public.articles (incident_id);
create index if not exists articles_published_idx   on public.articles (published_at desc nulls last);
create index if not exists articles_title_hash_idx  on public.articles (title_hash);
create index if not exists articles_content_hash_idx on public.articles (content_hash);
create index if not exists articles_canonical_idx   on public.articles (canonical_url) where canonical_url is not null;
create index if not exists articles_publisher_idx   on public.articles (publisher, published_at desc);
create index if not exists articles_title_trgm_idx  on public.articles using gin (title gin_trgm_ops);

-- Explicit many-to-many so an article can, in principle, evidence more than one
-- incident (e.g. a round-up piece), and so the link itself can carry metadata.
create table if not exists public.incident_articles (
  incident_id   uuid not null references public.incidents(id) on delete cascade,
  article_id    uuid not null references public.articles(id) on delete cascade,
  is_primary    boolean not null default false,
  match_score   numeric(4,3),
  match_reason  text,
  matched_by    text not null default 'rules' check (matched_by in ('rules','ai','manual')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (incident_id, article_id)
);

create index if not exists incident_articles_article_idx on public.incident_articles (article_id);

-- =============================================================================
-- Incident enrichment
-- =============================================================================

create table if not exists public.incident_highlights (
  id                uuid primary key default gen_random_uuid(),
  incident_id       uuid not null references public.incidents(id) on delete cascade,
  text              text not null,
  position          integer not null default 0,
  source_article_id uuid references public.articles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (incident_id, position)
);

create table if not exists public.incident_entities (
  id                uuid primary key default gen_random_uuid(),
  incident_id       uuid not null references public.incidents(id) on delete cascade,
  entity_type       text not null check (entity_type in (
                      'operator','company','licence_holder','drilling_contractor','service_company',
                      'pipeline_operator','asset','installation','field','well','vessel','regulator','location')),
  name              text not null,
  normalized_name   text not null,
  source_article_id uuid references public.articles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (incident_id, entity_type, normalized_name)
);

create index if not exists incident_entities_lookup_idx on public.incident_entities (entity_type, normalized_name);

-- Per-field provenance (brief section 27): which article supports which value.
create table if not exists public.incident_evidence (
  id                uuid primary key default gen_random_uuid(),
  incident_id       uuid not null references public.incidents(id) on delete cascade,
  field             text not null,
  value             text,
  source_article_id uuid references public.articles(id) on delete set null,
  quote             text,
  confidence        numeric(4,3) check (confidence between 0 and 1),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (incident_id, field, source_article_id)
);

create table if not exists public.material_updates (
  id                 uuid primary key default gen_random_uuid(),
  incident_id        uuid not null references public.incidents(id) on delete cascade,
  article_id         uuid references public.articles(id) on delete set null,
  scan_run_id        uuid references public.scan_runs(id) on delete set null,
  is_material        boolean not null,
  change_types       text[] not null default array[]::text[],
  descriptions       text[] not null default array[]::text[],
  -- Same facts always produce the same fingerprint; this is what stops repeat alerts.
  update_fingerprint text not null,
  reason             text,
  decided_by         text not null default 'rules' check (decided_by in ('rules','rules+ai')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (incident_id, update_fingerprint)
);

create index if not exists material_updates_incident_idx on public.material_updates (incident_id, created_at desc);

-- =============================================================================
-- User interaction
-- =============================================================================

create table if not exists public.user_incident_state (
  user_id     uuid not null references public.users(id) on delete cascade,
  incident_id uuid not null references public.incidents(id) on delete cascade,
  state       text not null default 'new' check (state in ('new','read','saved','archived','monitoring')),
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, incident_id)
);

create index if not exists user_incident_state_state_idx on public.user_incident_state (user_id, state);

create table if not exists public.saved_incidents (
  user_id     uuid not null references public.users(id) on delete cascade,
  incident_id uuid not null references public.incidents(id) on delete cascade,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, incident_id)
);

create table if not exists public.devices (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.users(id) on delete cascade,
  expo_push_token text not null unique,
  platform        text check (platform in ('ios','android','web')),
  app_version     text,
  enabled         boolean not null default true,
  last_seen_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.notifications (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references public.users(id) on delete cascade,
  incident_id        uuid not null references public.incidents(id) on delete cascade,
  material_update_id uuid references public.material_updates(id) on delete set null,
  kind               text not null default 'new_incident'
                       check (kind in ('new_incident','material_update','digest')),
  title              text not null,
  body               text not null,
  -- Suppression key: (user, incident, fingerprint) can only ever fire once.
  update_fingerprint text not null,
  sent_at            timestamptz,
  delivery_status    text not null default 'queued'
                       check (delivery_status in ('queued','sent','failed','suppressed')),
  error_message      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, incident_id, update_fingerprint)
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

create table if not exists public.export_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete cascade,
  incident_id uuid references public.incidents(id) on delete set null,
  format      text not null default 'pdf' check (format in ('pdf','json','csv')),
  file_name   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists export_history_user_idx on public.export_history (user_id, created_at desc);

-- =============================================================================
-- updated_at triggers
-- =============================================================================
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'users','user_preferences','search_profiles','keywords','excluded_keywords',
    'source_providers','news_sources','scan_runs','scan_run_provider_results',
    'incidents','articles','incident_articles','incident_highlights','incident_entities',
    'incident_evidence','material_updates','user_incident_state','saved_incidents',
    'devices','notifications','export_history'
  ]
  loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I; ' ||
      'create trigger set_updated_at before update on public.%I ' ||
      'for each row execute function public.set_updated_at();',
      target_table, target_table
    );
  end loop;
end;
$$;
