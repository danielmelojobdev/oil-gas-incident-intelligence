# Oil & Gas Incident Intelligence

A mobile platform that monitors public sources for **accidents, incidents and safety events in
the Oil & Gas industry**, rejects everything outside that industry, groups the reports that
describe the same event into a single incident record, and turns them into structured,
source-attributed intelligence.

It is not a news aggregator. The unit of the product is the **incident**, not the article.

```
many Articles (evidence)  ──grouping──▶  one Incident (fact)  ──▶  Feed · Detail · PDF · Alerts
```

---

## Table of contents

1. [Project overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Requirements](#3-requirements)
4. [Installation](#4-installation)
5. [Running it (Mock Mode in 60 seconds)](#5-running-it-mock-mode-in-60-seconds)
6. [Mobile setup](#6-mobile-setup)
7. [Backend setup](#7-backend-setup)
8. [Supabase / database setup](#8-supabase--database-setup)
9. [Environment variables](#9-environment-variables)
10. [News providers](#10-news-providers)
11. [AI providers](#11-ai-providers)
12. [The scheduled scanner](#12-the-scheduled-scanner)
13. [Notifications](#13-notifications)
14. [PDF export](#14-pdf-export)
15. [Testing](#15-testing)
16. [Mock Mode](#16-mock-mode)
17. [Deployment](#17-deployment)
18. [Security](#18-security)
19. [Adding a new news provider](#19-adding-a-new-news-provider)
20. [Adding a new AI provider](#20-adding-a-new-ai-provider)
21. [Legal and sourcing policy](#21-legal-and-sourcing-policy)
22. [Project status](#22-project-status)

---

## 1. Project overview

For every event it finds, the system tries to answer: *what happened, when, where, which operator,
which asset, which field, which well, upstream/midstream/downstream, offshore/onshore/subsea, which
life-cycle stage, what type of incident, was well integrity involved, was there a barrier failure,
was there loss of containment, were there casualties, was there environmental impact, was
production affected, which sources confirm it, is this new or an update, and how confident are we.*

| Capability | Where |
|---|---|
| Monitors multiple public sources in 5 languages | `apps/backend/src/news/*` |
| Rejects non–Oil & Gas news before spending anything | `packages/domain/src/filtering/*` |
| Never ingests the same article twice | `packages/domain/src/dedup/article-dedup.ts` |
| Groups several publishers into one incident | `packages/domain/src/dedup/incident-grouping.ts` |
| Extracts structured fields with AI, validated by Zod | `apps/backend/src/ai/*` |
| Severity, confidence and relevance scoring | `packages/domain/src/scoring/*` |
| Alerts only on genuinely new information | `packages/domain/src/updates/material-update.ts` |
| Feed, detail, search, saved, dashboard, settings | `apps/mobile/app/*` |
| Professional PDF report | `packages/domain/src/report/*` + `apps/mobile/src/pdf/*` |

## 2. Architecture

Read [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full picture and the Mermaid diagrams, and
[`docs/DECISIONS.md`](docs/DECISIONS.md) for why each significant choice was made.

```
.
├── apps/
│   ├── backend/          Node 20+ · Fastify · the scanner and the read API
│   └── mobile/           Expo · React Native · TypeScript · Expo Router
├── packages/
│   └── domain/           Pure, I/O-free core: taxonomy, schemas, glossary, rules, mock data
├── supabase/
│   └── migrations/       PostgreSQL schema, RLS and seed data
└── docs/                 Decision log, provider guides, edge-function proxy
```

Every external dependency sits behind a port with a working Mock implementation:

| Port | Adapters |
|---|---|
| `NewsSourceProvider` | mock · rss · google-news-rss · gdelt · bing-news · google-cse · newsapi |
| `AIProvider` | mock (rules engine) · openai · anthropic · gemini |
| `Database` | memory · postgres |
| `PushProvider` | mock · expo |

## 3. Requirements

* **Node.js 20.11+** (22 or 24 recommended) and npm 10+
* For the mobile app: the **Expo Go** app on a phone, or Xcode / Android Studio for simulators
* *Optional*: PostgreSQL 15+ or a Supabase project (the app runs without one)
* *Optional*: an API key for OpenAI, Anthropic or Gemini (the app runs without one)

## 4. Installation

```bash
git clone <your-repo-url>
cd "oil-gas-incident-intelligence"
npm install
```

This installs all three workspaces. No further setup is needed to run in Mock Mode.

## 5. Running it (Mock Mode in 60 seconds)

Two terminals, zero credentials, zero cost.

```bash
npm run backend:dev
```

```bash
npm run mobile:start
```

Scan the QR code with Expo Go, or press `i` / `a` / `w` for iOS simulator, Android emulator or web.

The app starts in Mock Mode: 15 fictional incidents, a persistent `MOCK DATA` banner, and a
**Scan Now** button that runs the real pipeline stages against a synthetic corpus.

To watch the scanner work in a terminal instead:

```bash
npm run backend:scan
```

```
  Scan complete.

  1 sources searched
  79 articles analysed
  8 potential incidents
  5 rejected
  67 duplicates
  2 new incidents
  5 updated incidents
```

## 6. Mobile setup

```bash
cd apps/mobile
cp .env.example .env      # optional; the defaults are Mock Mode
npm run start
```

| Variable | Meaning |
|---|---|
| `EXPO_PUBLIC_DATA_MODE` | `mock` (on-device data) or `api` (talk to the backend) |
| `EXPO_PUBLIC_API_URL` | Backend base URL when `DATA_MODE=api` |
| `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | Optional, for Supabase Auth |

> `EXPO_PUBLIC_*` values are compiled into the app bundle. Only ever put public values there.

Useful scripts:

```bash
npm run -w @ogii/mobile typecheck          # strict TypeScript
npm run -w @ogii/mobile report:sample -- out.html   # preview the PDF layout in a browser
```

## 7. Backend setup

```bash
cp .env.example .env
npm run backend:dev
```

| Script | What it does |
|---|---|
| `npm run backend:dev` | Fastify + scheduler with hot reload |
| `npm run backend:scan` | Runs one scan to completion and prints the summary |
| `npm run backend:build` | Bundles to `apps/backend/dist/index.js` |

### API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | – | Liveness, provider health, scheduler state |
| GET | `/v1/meta` | – | Mode, mock banner, disclaimers |
| GET | `/v1/incidents` | user | Feed with filters and pagination |
| GET | `/v1/incidents/:id` | user | Incident + articles + highlights + evidence |
| GET | `/v1/incidents/:id/report` | user | The PDF report model |
| POST | `/v1/incidents/:id/state` | user | read / saved / archived / monitoring |
| GET | `/v1/search` | user | Full-text + structured search |
| GET | `/v1/dashboard` | user | Aggregated counters |
| GET | `/v1/sources` | user | Monitored sources and tiers |
| GET | `/v1/scans/latest` | user | Last run + next scheduled run |
| POST | `/v1/scans` | user (cooldown) or admin token | Scan Now (async) |
| GET | `/v1/scans/:id` | user | Live scan progress |
| POST | `/v1/devices` | user | Register an Expo push token |
| GET/PUT | `/v1/preferences` | user | User preferences |
| GET | `/v1/me/export` · DELETE `/v1/me` | user | GDPR export / erasure |

```bash
curl -s localhost:8787/health | jq
curl -s "localhost:8787/v1/incidents?period=last_7_days&filter=well_integrity" | jq '.total'
curl -s -X POST localhost:8787/v1/scans -H "x-device-id: my-device-1234" | jq   # user-triggered
curl -s -X POST localhost:8787/v1/scans -H "x-admin-token: $ADMIN_API_TOKEN" | jq  # bypasses the cooldown
```

## 8. Supabase / database setup

The backend runs on an in-memory store by default. To persist:

```bash
export DATABASE_DRIVER=postgres
export DATABASE_URL="postgresql://user:pass@host:5432/db"
psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql
psql "$DATABASE_URL" -f supabase/migrations/0002_rls.sql   # Supabase only (uses auth.uid())
psql "$DATABASE_URL" -f supabase/migrations/0003_seed_sources.sql
```

With the Supabase CLI: `supabase link --project-ref <ref> && supabase db push`.

See [`supabase/README.md`](supabase/README.md) for the auth linkage and the schema notes.

## 9. Environment variables

Full annotated list in [`.env.example`](.env.example). The ones that matter most:

| Variable | Default | Notes |
|---|---|---|
| `APP_MODE` | `mock` | `mock` forces mock providers everywhere |
| `DATABASE_DRIVER` | `memory` | `postgres` requires `DATABASE_URL` |
| `AI_PROVIDER` | `mock` | `openai` / `anthropic` / `gemini` need their key |
| `NEWS_PROVIDERS` | `mock` | comma-separated adapter ids |
| `SCAN_SCHEDULE` | `every-6-hours` | `hourly`, `every-3-hours`, `every-6-hours`, `daily`, `off` |
| `SCAN_MAX_AI_EXTRACTIONS` | `40` | Hard per-run spend cap |
| `SCAN_MANUAL_COOLDOWN_SECONDS` | `300` | Gap between user-triggered scans; admin bypasses |
| `ADMIN_API_TOKEN` | `dev-admin-token` | **Must** be changed in production |

The environment is validated with Zod at boot: a bad configuration fails immediately with a
readable message instead of halfway through a scan.

## 10. News providers

| Id | Key required | Notes |
|---|---|---|
| `mock` | no | Synthetic corpus including deliberate noise and duplicates |
| `rss` | no | Public RSS/Atom feeds from the source catalogue (regulators, major outlets) |
| `google-news-rss` | no | Public RSS search endpoint; links to the publisher |
| `gdelt` | no | GDELT 2.0 Doc API — excellent multilingual breadth |
| `bing-news` | `BING_API_KEY` | Bing News Search API |
| `google-cse` | `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_ENGINE_ID` | Programmable Search |
| `newsapi` | `NEWS_API_KEY` | NewsAPI.org |

A realistic no-key production setup:

```bash
NEWS_PROVIDERS=rss,google-news-rss,gdelt
```

Source tiers (which drive the confidence score) are in
[`apps/backend/src/news/feeds.ts`](apps/backend/src/news/feeds.ts) and mirrored in
`supabase/migrations/0003_seed_sources.sql`: Tier 1 regulators (HSE, NSTA, Havtil, Norwegian
Offshore Directorate, ANP, BSEE, PHMSA, CSB, NOPSEMA, TSB Canada), Tier 2 major news,
Tier 3 industry press (Upstream, Energy Voice, Offshore Energy, World Oil, OGJ, Rigzone,
S&P Global), Tier 4 regional, Tier 5 unverified.

## 11. AI providers

```bash
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
AI_CLASSIFY_MODEL=claude-haiku-4-5-20251001   # cheap: stage-6 relevance
AI_EXTRACT_MODEL=claude-sonnet-5              # stronger: stage-7 extraction
```

Two model tiers are used on purpose: a cheap model screens, a stronger model extracts, and only
for candidates that survived the free deterministic filters.

**Anti-hallucination is enforced in code, not in the prompt.** Every response goes through
`parseAiJson` → Zod. Unknown facts become `null`; `0` is reserved for "a source said zero". If a
response fails validation twice, the candidate is dropped rather than guessed at.

If the AI provider is unavailable the scanner does **not** stop: it degrades to the rules-only
extractor (`apps/backend/src/ai/heuristic-extraction.ts`) and records lower confidence.

## 12. The scheduled scanner

Scanning runs on the backend, not in the app, so it works while the phone is asleep.

```bash
SCAN_SCHEDULE=every-6-hours
SCAN_ENABLED=true
```

The pipeline, in order: load config → resolve window → generate queries → query providers in
parallel → normalise → date filter → keyword/rule filter → Oil & Gas heuristics → known-URL check
→ article deduplication → incident similarity → AI relevance → AI extraction → relevance/severity/
confidence scoring → create or update → highlights → sources → material-update check → feed →
notify. Every run is recorded in `scan_runs` with per-provider results.

**Cost control**: ~90% of raw results are removed by free filters before any token is spent; a
24-hour content-hash cache sits in front of the model; `SCAN_MAX_AI_EXTRACTIONS` caps each run; and
**Scan Now** is behind `SCAN_MANUAL_COOLDOWN_SECONDS` for ordinary users, because a scan is global
and one impatient tap must not be able to run the budget down. The admin token bypasses it.

If you prefer to schedule from Supabase (`pg_cron`) instead, set `SCAN_SCHEDULE=off` and follow
[`docs/EDGE_FUNCTION_PROXY.md`](docs/EDGE_FUNCTION_PROXY.md).

## 13. Notifications

Expo Push. A notification is sent only when **all three** gates pass:

1. **Quality** — relevance in the feed band and confidence above the floor.
2. **Preference** — severity, category, country, well-integrity and well-control switches.
3. **Novelty** — `(user, incident, update_fingerprint)` has never fired before. This is enforced
   by a `UNIQUE` constraint in the database as well as in code, and updates are coalesced to one
   alert per incident per scan.

An existing incident only re-alerts on a **material update**: confirmed fatalities, changed
injuries, missing persons, escalation, environmental impact, an official investigation, an
operator statement, a confirmed cause, a shutdown, higher severity, or significant new well
integrity / well control information. A republished story with no new facts is silent.

Tapping a notification deep-links to `ogii://incident/<id>`.

## 14. PDF export

Incident → **Export PDF**. The report *model* is built in the shared domain package, so the
disclaimer, the "system-assessed severity" labelling and the "Not reported" handling cannot be
dropped by editing a template. `expo-print` renders it, `expo-sharing` hands it to the native
share sheet (AirDrop, Mail, Files, Drive, Teams — that is the "send to computer" path).

Preview the layout in a browser without building the app:

```bash
npm run -w @ogii/mobile report:sample -- /tmp/report.html
open /tmp/report.html
```

## 15. Testing

```bash
npm test           # 198 tests
npm run typecheck  # tsc --build, strict, no `any`
npm run lint       # eslint, `no-explicit-any` is an error
npm run verify     # all three
```

| Suite | Covers |
|---|---|
| `packages/domain/test/relevance` | Oil & Gas classification, the false-positive exclusion list, 5 languages |
| `packages/domain/test/url-dedup` | URL normalisation, hashing, five deduplication signals |
| `packages/domain/test/grouping` | Incident grouping, country/date vetoes, the LLM review band |
| `packages/domain/test/scoring` | Severity, confidence, relevance, thresholds |
| `packages/domain/test/periods-queries` | Date windows, incident-date-vs-publication-date, query generation |
| `packages/domain/test/material-update` | Material vs non-material updates, fingerprint stability |
| `packages/domain/test/mock-report` | Mock dataset integrity, PDF report model |
| `apps/backend/test/pipeline` | Full pipeline, noise rejection, grouping, idempotency, alert suppression |
| `apps/backend/test/ai-json` | Model JSON repair, Zod validation, null-vs-zero |
| `apps/backend/test/providers` | Feed parsing, source tiers, provider normalisation |
| `apps/backend/test/api` | Every HTTP endpoint, auth, scan cooldown, validation, GDPR |
| `apps/backend/test/extraction` | Rules-only extraction: country precedence, assets, casualty counts |
| `apps/mobile/test/*` | PDF HTML rendering and escaping, deep links, formatting, filter store |

## 16. Mock Mode

Mock Mode is a **runtime**, not a set of fixtures. `MockNewsProvider` and `MockAiProvider` are
real implementations of their ports, so the same pipeline code runs.

* 15 fictional incidents covering offshore fire, well control, well integrity, BOP failure,
  pipeline rupture, refinery explosion, gas leak, LNG release, oil spill, platform evacuation,
  onshore blowout, helicopter ditching, dropped object, H2S release and vessel contact.
* Deliberate **noise** (a restaurant fire, a coal mine collapse, a wind farm explosion, a train
  derailment, oil price news) that the pipeline must reject.
* Deliberate **duplicates** and syndicated copies that deduplication must catch.
* "Breaking" stories that exist only in the news corpus, so **Scan Now** visibly discovers new
  incidents, groups three publishers into one, and fires exactly one material-update alert.

All operators, assets, wells and publishers are invented, every URL is on the reserved
`example.com` documentation domain, and every record carries `isMock: true` so the UI can show the
`MOCK DATA` banner. Mock data can never be mistaken for a real event.

## 17. Deployment

**Backend** — any container host (Fly.io, Railway, Render, ECS, Cloud Run):

```bash
npm run backend:build
node apps/backend/dist/index.js
```

Set `NODE_ENV=production`, a real `ADMIN_API_TOKEN`, `DATABASE_DRIVER=postgres`, your
`DATABASE_URL`, the provider keys, and `CORS_ORIGINS` to your app's origin.

**Mobile** — EAS Build:

```bash
npx eas build --platform ios
npx eas build --platform android
```

Set the `EXPO_PUBLIC_*` values as EAS secrets, and replace the placeholder `extra.eas.projectId`
in `apps/mobile/app.json`.

**Database** — run the three migrations against your Supabase project.

## 18. Security

* **No secret ever reaches the device.** Service-role key, AI keys and news API keys exist only in
  the backend process. The app holds at most the Supabase *anon* key, which is designed to be
  public and is guarded by RLS.
* Supabase Auth issues the JWT; the backend derives `user_id` from it. Privileged endpoints
  additionally require `ADMIN_API_TOKEN`.
* Zod validates every HTTP request, every provider response and every AI response.
* URLs are allow-listed to `http(s)` with no embedded credentials — `javascript:` and `data:` can
  never be opened. Deep links are parsed, never evaluated.
* Per-IP rate limiting; structured logs redact `authorization`, `*_key`, `*_token`, `*secret*`.
* Row Level Security scopes every user-owned table to `auth.uid()`.
* GDPR: `Settings → Data & Privacy` exports everything personal as JSON and deletes it, backed by
  `delete_user_data()` / `export_user_data()` in the database.

## 19. Adding a new news provider

See [`docs/ADDING_A_NEWS_PROVIDER.md`](docs/ADDING_A_NEWS_PROVIDER.md). In short: implement
`NewsSourceProvider`, add one line to `apps/backend/src/news/registry.ts`, and add the source to
the catalogue with its tier.

## 20. Adding a new AI provider

See [`docs/ADDING_AN_AI_PROVIDER.md`](docs/ADDING_AN_AI_PROVIDER.md). In short: extend
`BaseAiProvider` and implement one method, `complete()`. Prompting, JSON repair, Zod validation,
caching and usage accounting are inherited.

## 21. Legal and sourcing policy

* Public RSS/Atom feeds, official regulator publications and documented search APIs **only**.
* No scraping that would violate `robots.txt` or a site's terms; no paywall circumvention.
* We store **metadata** (headline, the excerpt as published, publisher, author, language, dates,
  URLs) plus **our own generated summary** — never a copy of a protected article body.
* Every incident links to every source behind it, and the publisher is never hidden.

## 22. Project status

**MVP complete and runnable.** 198 automated tests, strict TypeScript with `no-explicit-any`
enforced, clean lint.

Prepared for, but deliberately not built yet: the world incident map (the schema already carries
`latitude`/`longitude`/`basin`/`block`), heat maps, trend analytics, operator/asset/well
watchlists, daily and weekly digests, email/Teams/Slack delivery (a new `PushProvider` adapter),
regulatory intelligence, and multi-user organisations.

---

Built for Oil & Gas safety professionals. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the
engineering detail.
