# CLAUDE.md — `ai-broker-web`

The only deployed artifact: Next.js (App Router) built with **vinext** and run
on **Cloudflare Workers**. Full notes in
[`../../architecture/web-app.md`](../../architecture/web-app.md).

## Keep route handlers thin

`app/api/*` handlers parse, authorize, delegate, serialize. Trading logic lives
in `packages/investing` — if you are writing a decision
rule inside a route handler, it is in the wrong file.

## Things that bite

- **Bindings changed → run `bun run cf-typegen`** and commit the updated
  `cloudflare-env.d.ts`.
- **Adding a cron means two edits**: the schedule in `wrangler.jsonc`
  (`triggers.crons`) *and* the `CRON_ROUTES` map in `worker/index.ts`. An
  unmapped schedule logs a warning and silently does nothing.
- **Never edit an applied migration.** Change `lib/db/schema.ts`, run
  `bun run db:generate`, commit the new file in `migrations/` — *and*
  `migrations/meta/`, which is what `db:generate` diffs against. A schema
  column that no migration creates breaks the whole table: Drizzle names every
  column in its `INSERT`, so the first write fails with `no such column`.
  `lib/db/__tests__/migrations.test.ts` guards this.
- **Every env var in `env.ts` is optional on purpose** so builds and previews
  never fail validation. Guard at the call site; don't make one required.
- **`/admin` is gated by `ADMIN_EMAILS`** (comma-separated). With neither
  `ADMIN_EMAILS` nor `ADMIN_EMAIL` set, nobody is an admin — that is the safe
  default, keep it.
- **Admin sections** (`app/admin/*`, sidebar in `AdminNav.tsx`, modelled on
  debate-ai's `debate-webview-admin`): Users, Prediction markets, Stocks, Top
  traders, Database. Their APIs live under `app/api/admin/*` behind
  `assertAdmin()`, with the query logic in `lib/admin/` (`listings.ts`,
  `traders.ts`, `trader-sync.ts`) taking the drizzle handle as an argument so
  tests run it on in-memory SQLite.
- **Publishing lives in `listing_controls`, never on synced tables.** A row
  per `pm-market:<id>` or `stock:<SYMBOL>`; no row means published. Market
  syncs upsert `polymarket_markets` and must not reset admin decisions. The
  public market queries (`packages/investing` `getMarkets`/`searchMarketsInDB`)
  exclude unpublished markets; `/api/stocks/{trending,gainers,screener}` drop
  hidden stocks; `/api/stocks/featured` lists featured ones.
- **Cron routes check the secret with `isCronRequest()`** (`lib/auth/cron.ts`),
  which reads `CRON_SECRET` through `serverEnv`. `process.env.CRON_SECRET` is
  undefined on Workers, so scheduled runs were 401s.
- **Vitest runs under Node — it does not prove the Worker works.** Use
  `bun run preview` (local miniflare D1) before shipping anything touching the
  Worker entrypoint, bindings, or crons.
- **The Turnstile gate runs first in `worker/index.ts`** (`lib/turnstile`). It
  only ever interrupts a desktop browser's first HTML page view, and it is a
  no-op until `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` are set. Adding a
  path that must answer machines — a webhook, a feed, a health check — outside
  `/api/*` means adding it to the exempt list in
  `lib/turnstile/request-filter.ts`.

- **The Research Agent (`/research`) is research-agent-ui from npm**, wired the
  way debate-ai.com wires it: `components/qwksearch/base-url.ts` must stay the
  first import of every entry that touches the package (its api-client
  captures the base URL at module load), and `GrabBaseScope` scopes grab-url's
  base URL to qwksearch.com only while the agent is mounted. "Sign in with
  QwkSearch" (`app/api/qwksearch/*`, `lib/qwksearch/`) stores the user's
  QwkSearch API key, profile and plan in `qwksearch_connections`, separate
  from `user_settings`; the same row holds the agent's client-side settings
  (`preferences`). A new origin for this app must be added to qwksearch-web's
  connect allowlist (`apps/qwksearch-web/lib/auth/connect.ts`) or sign-in
  fails there.
- **`/research` mounts the full workspace** (`research-agent-ui/workspace`:
  chat tabs, the REASON docs editor and its files sidebar). The editor keeps
  documents in `localStorage` and syncs them through `grab("doc/documents")`;
  `components/qwksearch/doc-storage.ts` reroutes those calls from qwksearch.com
  to this app's `/api/doc/documents` (table `research_documents`, keyed by
  user + the editor's own id, PUT is an upsert) and, because the editor never
  loads from the server itself, seeds `localStorage` from the account before
  mounting. `/api/doc/uploads` forwards file uploads to QwkSearch with the
  linked key.
- **Amplitude is one integration: the Unified SDK** (`@amplitude/unified`,
  analytics + Session Replay). Don't add `@amplitude/analytics-browser` or the
  replay plugin alongside it. All calls go through `lib/analytics/amplitude.ts`
  (`initializeAnalytics`, `identifyUser`, `trackEvent`, `clearUser`), which
  calls `initAll` once and no-ops when `NEXT_PUBLIC_AMPLITUDE_API_KEY` is unset.
  `app/amplitude.tsx` waits for the better-auth session, then sets the user ID
  to `user.id` (never email); sign-out resets it. Replay masks inputs
  (`defaultMaskLevel: 'medium'`); sample rate comes from
  `NEXT_PUBLIC_AMPLITUDE_REPLAY_SAMPLE_RATE` (default 1).

## Layout

| Path | Owns |
| --- | --- |
| `app/` | Routes: `dashboard`, `markets`, `stock`, `portfolio`, `predict`, `debate`, `leaders`, `research`, `survey`, `legal`, `admin`, `login`, `docs` |
| `app/api/` | Route handlers, including `api/cron/*` and `api/openapi.json` |
| `components/` | App-local UI (shadcn; see `components.json`) |
| `lib/` | `auth/`, `db/`, `ai/`, `alpaca/`, `admin/`, `openapi/`, `fumadocs/`, `email/`, `kyc/`, `qwksearch/` |
| `content/docs/` | The **published** user documentation (docs.autoinvestment.broker) |
| `migrations/` | D1 migrations, applied by wrangler |
| `worker/index.ts` | Workers entrypoint: wraps vinext, routes crons, sets `__CLOUDFLARE_ENV__` |

## Commands

```bash
bun run dev              # vinext dev
bun run preview          # build + vite preview against local miniflare D1
bun run test             # vitest
bun run type-check
bun run db:generate      # after editing lib/db/schema.ts
bun run db:migrate:local
bun run deploy           # vinext-cloudflare deploy
```
