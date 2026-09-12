#!/usr/bin/env bash
#
# One-command local setup: PostgreSQL, migrations, .env files.
#
#   bash scripts/setup-local.sh
#
# Safe to run more than once. It never overwrites an existing .env.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok()  { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn(){ printf '  \033[33m!\033[0m %s\n' "$1"; }

DB_NAME="${OGII_DB_NAME:-ogii}"
PG_VERSION="${OGII_PG_VERSION:-17}"

say "1/5  PostgreSQL"
if command -v psql >/dev/null 2>&1; then
  ok "psql already on PATH ($(psql --version))"
else
  BREW_PG="/usr/local/opt/postgresql@${PG_VERSION}/bin"
  [ -d "/opt/homebrew/opt/postgresql@${PG_VERSION}/bin" ] && BREW_PG="/opt/homebrew/opt/postgresql@${PG_VERSION}/bin"
  if [ -d "$BREW_PG" ]; then
    export PATH="$BREW_PG:$PATH"
    ok "using Homebrew PostgreSQL at $BREW_PG"
  elif command -v brew >/dev/null 2>&1; then
    warn "installing postgresql@${PG_VERSION} with Homebrew"
    brew install "postgresql@${PG_VERSION}"
    export PATH="$BREW_PG:$PATH"
  else
    echo "  PostgreSQL not found and Homebrew is unavailable. Install PostgreSQL ${PG_VERSION}+ and re-run." >&2
    exit 1
  fi
fi

if ! pg_isready -q 2>/dev/null; then
  warn "starting the PostgreSQL service"
  brew services start "postgresql@${PG_VERSION}" >/dev/null 2>&1 || true
  for _ in $(seq 1 20); do pg_isready -q 2>/dev/null && break; sleep 1; done
fi
pg_isready -q 2>/dev/null && ok "server is accepting connections" || { echo "  PostgreSQL did not start." >&2; exit 1; }

say "2/5  Database \"$DB_NAME\""
if psql -lqt 2>/dev/null | cut -d\| -f1 | grep -qw "$DB_NAME"; then
  ok "already exists"
else
  createdb "$DB_NAME"; ok "created"
fi

say "3/5  Migrations"
# auth.uid() and the `authenticated` role exist on Supabase, not on a local server.
# Stubbing them lets 0002 (row level security) be validated locally too.
psql -d "$DB_NAME" -q -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
SQL
for file in supabase/migrations/*.sql; do
  psql -d "$DB_NAME" -q -v ON_ERROR_STOP=1 -f "$file" >/dev/null 2>&1
  ok "$(basename "$file")"
done
TABLES=$(psql -d "$DB_NAME" -tAc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")
ok "$TABLES tables ready"

say "4/5  Configuration"
DB_URL="postgresql://$(whoami)@localhost:5432/${DB_NAME}"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 127.0.0.1)"

if [ -f .env ]; then
  ok ".env already exists, left untouched"
else
  sed -e "s|^APP_MODE=.*|APP_MODE=full|" \
      -e "s|^DATABASE_DRIVER=.*|DATABASE_DRIVER=postgres|" \
      -e "s|^DATABASE_URL=.*|DATABASE_URL=${DB_URL}|" \
      -e "s|^NEWS_PROVIDERS=.*|NEWS_PROVIDERS=rss,google-news-rss|" \
      .env.example > .env
  ok ".env created (Postgres + real news sources, AI still on the free rules engine)"
fi

if [ -f apps/mobile/.env ]; then
  ok "apps/mobile/.env already exists, left untouched"
else
  printf 'EXPO_PUBLIC_DATA_MODE=api\nEXPO_PUBLIC_API_URL=http://%s:8787\n' "$LAN_IP" > apps/mobile/.env
  ok "apps/mobile/.env created pointing at http://${LAN_IP}:8787"
fi

say "5/5  First scan"
npm run backend:scan --silent || warn "the scan reported problems; see the output above"

say "Done"
cat <<EOF
  Start the backend:  npm run backend:dev
  Start the app:      npm run mobile:start

  Run the Postgres integration tests:
    DATABASE_URL=${DB_URL} npm test
EOF
