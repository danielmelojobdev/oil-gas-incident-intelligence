# Supabase / Postgres

## What is here

| File | Purpose |
|---|---|
| `migrations/0001_init.sql` | Schema: 21 tables, constraints, indexes, full-text search, `updated_at` triggers |
| `migrations/0002_rls.sql` | Row Level Security policies + GDPR erasure/export functions |
| `migrations/0003_seed_sources.sql` | Provider registry and the Tier 1–3 source catalogue |

## Apply them

### With the Supabase CLI

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

### With plain psql (local Postgres, or the Supabase connection string)

```bash
psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql
psql "$DATABASE_URL" -f supabase/migrations/0002_rls.sql
psql "$DATABASE_URL" -f supabase/migrations/0003_seed_sources.sql
```

`0002_rls.sql` references `auth.uid()`, which only exists on Supabase. On vanilla
Postgres, skip it (or define a stub `auth.uid()`), and rely on the backend to scope
queries — the backend always filters by `user_id` regardless of RLS.

## Linking `public.users` to Supabase Auth

`public.users` is standalone so the schema runs anywhere. On Supabase, link it:

```sql
alter table public.users
  add constraint users_auth_fk foreign key (id) references auth.users(id) on delete cascade;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  insert into public.user_preferences (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

## Notes

* Enum-like columns are `text` + `CHECK` (decision D11). The authoritative lists live in
  `packages/domain/src/taxonomy.ts`; keep the two in sync when adding a value.
* `articles.normalized_url` is `UNIQUE`. That constraint is what guarantees the same
  article can never be ingested twice, even if the deduplication code has a bug.
* `notifications (user_id, incident_id, update_fingerprint)` is `UNIQUE`. That is what
  guarantees a republished story cannot ring the same phone twice.
* `latitude`/`longitude` exist from day one so the future World Incident Map needs no
  migration. If you enable PostGIS later, add a generated `geography` column and a GIST
  index; nothing else has to change.
