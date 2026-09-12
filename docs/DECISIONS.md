# Decision log

Format: context → decision → consequences. Decisions are numbered and referenced from
`ARCHITECTURE.md`.

---

## D1 — Scanner runs on a Node.js service, not Supabase Edge Functions

**Context.** The brief prefers Supabase Edge Functions and allows a separate Node.js backend *if the
reason is documented*.

**Decision.** Supabase remains the database (and, when configured, auth + storage). The scanner and
the read API run as a single Node.js/Fastify service.

**Reasons.**
1. **Wall-clock.** A full scan issues 20–40 provider queries and up to `SCAN_MAX_AI_EXTRACTIONS`
   model calls. Edge Functions are designed for short request/response work; a scan is a batch job
   that legitimately runs for minutes.
2. **Code sharing.** Mobile, backend and the test suite all import `@ogii/domain`. With a Deno edge
   runtime the same logic would have to be duplicated or published separately — and the
   classification logic is the product, so duplicating it is the single most expensive mistake
   available.
3. **Operational control.** Retries with exponential backoff, per-provider circuit breakers, a
   concurrency limiter and an in-process response cache are natural in a long-lived process and
   awkward in a per-invocation one.
4. **Local development.** The whole system runs with `npm run backend:dev` — no Deno toolchain, no
   Supabase CLI, no Docker required. (Neither was available on the development machine.)

**Consequences.** One more deployable unit (any container host: Fly.io, Railway, Render, ECS…).
Teams that want a single host can keep the Node service private and put a ~30-line Supabase Edge
Function in front of `POST /v1/scans` — documented in `docs/EDGE_FUNCTION_PROXY.md`.

---

## D2 — `packages/domain` is pure and I/O-free

**Decision.** No `fetch`, no `fs`, no `process.env`, no date-of-now reads without an injected clock
inside the domain package.

**Consequences.** Every rule is unit-testable in milliseconds; the same code runs in Hermes
(React Native) and Node. Anything needing I/O lives in an adapter.

---

## D3 — Ports and adapters for every external dependency

**Decision.** `NewsSourceProvider`, `AIProvider`, `Database`, `PushProvider`. Each has a Mock
implementation that is a real implementation of the port, not a stub.

**Consequences.** `APP_MODE=mock` runs the true pipeline end to end with zero keys and zero spend,
which is also how the integration tests run in CI.

---

## D4 — Incident ≠ Article

**Decision.** Two aggregates joined by `incident_articles`. The feed lists incidents. Articles are
evidence attached to an incident and are never shown as separate feed entries.

**Consequences.** Grouping becomes an explicit, testable pipeline stage with its own metrics, and
"4 sources" on a card is a real count, not a rendering trick.

---

## D5 — Rules first, model second

**Decision.** Severity, confidence, relevance and material-update each have a deterministic rule
score. The model contributes a second opinion that is blended, bounded and logged.

**Consequences.** Reproducible behaviour, testable thresholds, and graceful degradation when the AI
provider is unavailable (the pipeline continues in rules-only mode and marks affected incidents with
lower confidence).

---

## D6 — Zod at every trust boundary

**Decision.** HTTP input, provider output, AI output and database rows are all parsed with Zod.
`unknown` is never cast with `as`.

**Consequences.** A malformed model response produces a logged, retried, and finally skipped
candidate — never a corrupt incident.

---

## D7 — Metadata-only ingestion

**Decision.** Store title, excerpt (as published in the feed), publisher, author, language, dates,
URLs, plus our own generated summary. Never store article bodies; never bypass paywalls; honour
`robots.txt`; use official feeds and APIs only.

**Consequences.** Copyright-safe. The "Open Original Source" button is mandatory in the UI and the
publisher is never hidden.

---

## D8 — `incident_date` is the primary time axis

**Decision.** Feed windows filter on `incident_date`. When the incident date cannot be established,
the article's `published_at` is used as a clearly-flagged proxy (`incident_date_is_estimated`).

**Consequences.** Retrospective coverage of an old disaster does not pollute "last 30 days". A
future setting switches the axis to publication date without a schema change.

---

## D9 — 8-stage cost ladder

See `ARCHITECTURE.md` §5. Consequence: the expensive extraction model typically sees under 10% of
raw provider results.

---

## D10 — Mock Mode is a runtime, not fixtures

**Decision.** `MockNewsProvider` returns synthetic articles about **fictional companies**;
`MockAIProvider` implements the same contract deterministically; the app shows a persistent
`MOCK DATA` banner.

**Consequences.** Acceptance criterion 33 ("run completely in Mock Mode") is satisfied without a
single credential, and demos can never be mistaken for real events.

---

## D11 — Enum-like columns are `text` + `CHECK`, not Postgres `ENUM`

**Decision.** Taxonomies change (a new well-integrity category, a new installation type). `ALTER
TYPE ... ADD VALUE` cannot run inside a transaction and cannot remove values.

**Consequences.** Migrations stay boring; the canonical list lives in `packages/domain/taxonomy.ts`
and is mirrored by a `CHECK` constraint.

---

## D12 — Hashing uses a pure-TS 128-bit FNV-1a, not `node:crypto`

**Context.** The same hashing must run in React Native (Hermes, no `node:crypto`, no
`crypto.subtle` synchronously) and in Node, and must be deterministic across both.

**Decision.** A pure-TS FNV-1a based 128-bit hash for `title_hash` / `content_hash` /
`update_fingerprint`.

**Consequences.** These are *dedup* keys, not security primitives; collision probability at our
volume is negligible. Nothing security-relevant depends on them, and this is asserted in tests.

---

## D13 — Client state vs server state

**Decision.** TanStack Query owns everything that came from the server. Zustand owns only
client-owned state (filter chips, settings draft, theme). No duplication.

---

## D14 — The word "accident" is never trusted on its own

**Decision.** An article must match **an event term AND an Oil & Gas term** (or an explicitly
Oil & Gas source such as a regulator feed) before it is even considered, and then must survive the
hard exclusion list (mining, aviation, road, rail, residential fires, solar, wind, nuclear, …).

**Consequences.** §4 of the brief — "the isolated presence of `fire`/`explosion` is not sufficient"
— is enforced before any spend, and is covered by unit tests with real-world false positives.


---

## D15 — Glossary terms match on word boundaries, with explicit inflections

**Context.** The first scan against live RSS and Google News produced a 33% false
positive rate. The single worst offender was substring matching: `text.includes('oil')`
matched **"s-oil"**, so an HSE prosecution about a worker crushed in a trench collapse
was filed as an Oil & Gas incident with a relevance score of 80.

**Decision.** Glossary terms are compiled to whole-word regexes with an optional plural
suffix. Verb inflections ("released", "leaking", "ruptured") are listed **explicitly**
in the glossary rather than derived with a generic `-ed/-ing` rule.

**Why not a generic suffix rule.** It would turn the event term "fire" into "fired" and
file every executive dismissal at an oil company as a safety event. The explicit list
is longer but auditable, and each entry can be justified.

**Consequences.** Precision improved sharply; the plural allowance had to be added
immediately afterwards, because `\boil\b` alone rejected a genuine ExxonMobil
hydrocarbon-*leaks* prosecution. Both directions are covered by regression tests built
from the real headlines.

---

## D16 — Some exclusion domains cannot be overridden by an Oil & Gas anchor

**Context.** An anchor phrase rescues an article from an exclusion domain, so that a
helicopter crash ferrying crew to a platform survives the "aviation" exclusion. But a
vendor market-research report titled *"Blowout Preventer Market Growth ... Expected To
Reach $45.02 Billion By 2030"* is packed with anchor terms and is still not an event.

**Decision.** `ExclusionDomain.overridable` defaults to true; `market-news` sets it to
false. Domains that describe real-world events stay overridable; domains that are not
events at all do not.

**Consequences.** Market, macro and industry-forecast coverage is rejected outright, no
matter how much of our vocabulary it borrows.

---

## D17 — "blowout" is an event term, never an anchor

**Context.** Bare "blowout" was both an event term and an Oil & Gas anchor, which made
it self-sufficient evidence. *"How to make your salon blowout last for days"* scored 70
and entered the feed.

**Decision.** Only `blowout preventer`, `well blowout` and `oil/gas well blowout` are
anchors. Bare "blowout" contributes an event signal and nothing more, so it still needs
an independent industry signal. The Portuguese glossary's bare `blowout` strong phrase
became `blowout de poço` for the same reason.

---

## D18 — Providers declare their own pacing

**Context.** GDELT publishes a one-request-per-five-seconds rule and answers 429
otherwise. Retries and the circuit breaker do not help: the fan-out itself is the
problem.

**Decision.** `NewsSourceProvider` gained `minRequestIntervalMs` and
`maxQueriesPerScan`. The scanner paces each provider through a per-key
`RateLimiter` that reserves slots synchronously, so concurrent callers queue instead
of firing together. A heavily paced provider receives only the highest-priority queries.

**Consequences.** Well-behaved clients of free public APIs, and a scan whose wall-clock
time is not dominated by the slowest-paced source.

---

## D19 — Every identity is folded into a UUID at the HTTP boundary

**Context.** The app is designed to work before anyone signs in, identifying itself with
an anonymous device id such as `device:ab12cd34`. Supabase Auth, when configured,
supplies a real UUID. All seven user-owned tables type `user_id` as `uuid`.

`MemoryDatabase` used the identity as a plain map key, so the raw string worked
perfectly — and every authenticated read against Postgres returned **HTTP 500**
(`invalid input syntax for type uuid`). Since the app sends the device header on every
request, the entire feed was broken the moment a real database was connected, while
every unit test still passed.

**Decision.** `toUserUuid()` runs in `resolveAuth`, so nothing downstream ever sees a
non-UUID identity. A value that is already a UUID passes through; anything else is
folded deterministically into an RFC-4122-shaped v5 UUID. `PostgresDatabase`
provisions the `users` row on first write, because an anonymous device is a real user
as far as the foreign keys are concerned.

**Consequences.** Anonymous use works against a real database, sign-in later reuses the
same code path, and the failure mode that produced a white screen with a retry button
is covered by an integration test.

**Lesson.** Two of the three defects found on first contact with Postgres
(`detected_at`, and this) existed because the in-memory adapter is *more* permissive
than the real one. A mock that is easier to satisfy than production hides exactly the
bugs it is meant to catch.
