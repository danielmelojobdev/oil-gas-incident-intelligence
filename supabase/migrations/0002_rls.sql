-- =============================================================================
-- Row Level Security
--
-- Model:
--   * Incident intelligence (incidents, articles, highlights, entities, evidence,
--     sources, scan runs) is readable by ANY authenticated user, and writable only
--     by the service role — the scanner backend.
--   * Everything user-owned is readable and writable only by that user.
--
-- The service role bypasses RLS by design, so no explicit write policies are needed
-- for it; the absence of a write policy is what locks ordinary users out.
-- =============================================================================

alter table public.users                     enable row level security;
alter table public.user_preferences          enable row level security;
alter table public.search_profiles           enable row level security;
alter table public.keywords                  enable row level security;
alter table public.excluded_keywords         enable row level security;
alter table public.user_incident_state       enable row level security;
alter table public.saved_incidents           enable row level security;
alter table public.devices                   enable row level security;
alter table public.notifications             enable row level security;
alter table public.export_history            enable row level security;

alter table public.incidents                 enable row level security;
alter table public.articles                  enable row level security;
alter table public.incident_articles         enable row level security;
alter table public.incident_highlights       enable row level security;
alter table public.incident_entities         enable row level security;
alter table public.incident_evidence         enable row level security;
alter table public.material_updates          enable row level security;
alter table public.news_sources              enable row level security;
alter table public.source_providers          enable row level security;
alter table public.scan_runs                 enable row level security;
alter table public.scan_run_provider_results enable row level security;

-- -----------------------------------------------------------------------------
-- Shared intelligence: read-only for authenticated users
-- -----------------------------------------------------------------------------
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'incidents','articles','incident_articles','incident_highlights','incident_entities',
    'incident_evidence','material_updates','news_sources','source_providers',
    'scan_runs','scan_run_provider_results'
  ]
  loop
    execute format('drop policy if exists "read_for_authenticated" on public.%I;', target_table);
    execute format(
      'create policy "read_for_authenticated" on public.%I for select to authenticated using (true);',
      target_table
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- User-owned rows: full access, own rows only
-- -----------------------------------------------------------------------------
drop policy if exists "own_row" on public.users;
create policy "own_row" on public.users
  for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'user_preferences','user_incident_state','saved_incidents','devices',
    'notifications','export_history','search_profiles'
  ]
  loop
    execute format('drop policy if exists "own_rows" on public.%I;', target_table);
    execute format(
      'create policy "own_rows" on public.%I for all to authenticated ' ||
      'using (user_id = auth.uid()) with check (user_id = auth.uid());',
      target_table
    );
  end loop;
end;
$$;

-- Keywords are owned transitively through the search profile.
drop policy if exists "own_profile_keywords" on public.keywords;
create policy "own_profile_keywords" on public.keywords
  for all to authenticated
  using (exists (
    select 1 from public.search_profiles p
    where p.id = keywords.search_profile_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.search_profiles p
    where p.id = keywords.search_profile_id and p.user_id = auth.uid()
  ));

drop policy if exists "own_profile_excluded_keywords" on public.excluded_keywords;
create policy "own_profile_excluded_keywords" on public.excluded_keywords
  for all to authenticated
  using (exists (
    select 1 from public.search_profiles p
    where p.id = excluded_keywords.search_profile_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.search_profiles p
    where p.id = excluded_keywords.search_profile_id and p.user_id = auth.uid()
  ));

-- =============================================================================
-- GDPR helper: erase everything personal for one user (brief section 59).
-- Content the user did not author (incidents, articles) is shared intelligence and
-- is not user data, so it is intentionally left intact.
-- =============================================================================
create or replace function public.delete_user_data(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications      where user_id = target_user;
  delete from public.export_history     where user_id = target_user;
  delete from public.saved_incidents    where user_id = target_user;
  delete from public.user_incident_state where user_id = target_user;
  delete from public.devices            where user_id = target_user;
  delete from public.keywords           where search_profile_id in
    (select id from public.search_profiles where user_id = target_user);
  delete from public.excluded_keywords  where search_profile_id in
    (select id from public.search_profiles where user_id = target_user);
  delete from public.search_profiles    where user_id = target_user;
  delete from public.user_preferences   where user_id = target_user;
  delete from public.users              where id = target_user;
end;
$$;

comment on function public.delete_user_data(uuid) is
  'GDPR erasure for one user. Shared incident intelligence is not personal data and is retained.';

-- Export everything personal we hold about one user, as a single JSON document.
create or replace function public.export_user_data(target_user uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'user',              (select to_jsonb(u) from public.users u where u.id = target_user),
    'preferences',       (select to_jsonb(p) from public.user_preferences p where p.user_id = target_user),
    'search_profiles',   (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
                            from public.search_profiles s where s.user_id = target_user),
    'saved_incidents',   (select coalesce(jsonb_agg(to_jsonb(si)), '[]'::jsonb)
                            from public.saved_incidents si where si.user_id = target_user),
    'incident_state',    (select coalesce(jsonb_agg(to_jsonb(us)), '[]'::jsonb)
                            from public.user_incident_state us where us.user_id = target_user),
    'devices',           (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb)
                            from public.devices d where d.user_id = target_user),
    'notifications',     (select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb)
                            from public.notifications n where n.user_id = target_user),
    'exports',           (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
                            from public.export_history e where e.user_id = target_user)
  );
$$;
