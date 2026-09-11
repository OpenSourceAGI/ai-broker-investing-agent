# The Web App — `apps/ai-broker-web`

The only deployed artifact. Next.js (App Router) built by **vinext** and run on
**Cloudflare Workers**. Cloudflare is the only platform this app targets.

## Shape

```
apps/ai-broker-web/
  app/            routes + route handlers (app/api/*)
  components/     app-local UI (shadcn; components.json)
  lib/            auth, db, ai, alpaca, admin, openapi, fumadocs, email, kyc…
  content/docs/   the published user documentation (Fumadocs MDX)
  migrations/     D1 migrations, applied by wrangler
  worker/index.ts the Workers entrypoint — wraps vinext, adds cron routing
  wrangler.jsonc  bindings, crons, vars
  env.ts          typed env (@t3-oss/env-nextjs + zod)
```

Route handlers under `app/api/` are meant to stay **thin** — parse, authorize,
delegate to `packages/investing` or `packages/predictos`, serialize. Trading
logic does not belong in a route.

## Bindings

| Binding | What it is |
| --- | --- |
| `DB` | D1 database `ai-broker-db`, `migrations_dir: migrations` |
| `ASSETS` | Client bundle from `dist/client`; `not_found_handling: "none"` so vinext routes unmatched paths through the Worker |
| `SEND_EMAIL` | Cloudflare Email Workers — the **only** outbound mail path (auth verification, password reset, team invitations). Needs Email Routing on the zone and a verified sender domain. |

`compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"]`.
Page-level ISR runs through the vinext CDN cache adapter (`"cache": {"enabled": true}`).

## Scheduled work

Workers cron triggers replace the old Vercel crons. `wrangler.jsonc` declares
the schedules and `worker/index.ts` maps each one to an API route, dispatched
through the same fetch handler with the `CRON_SECRET` bearer token the routes
already expect:

| Schedule | Route |
| --- | --- |
| `0 0 * * *` | `/api/cron/sync-markets` |
| `15 0 * * *` | `/api/cron/refresh-quotes` |

**Adding a cron means editing two places** — the `triggers.crons` array *and*
the `CRON_ROUTES` map in `worker/index.ts`. A schedule with no mapped route just
logs a warning and does nothing. Other routes exist under `app/api/cron/`
(`sync-polymarket`, `sync-zulu`) and are invoked directly rather than scheduled.

## Database

Drizzle + D1 (SQLite dialect, `d1-http` driver). Schema: `lib/db/schema.ts`.
`packages/investing/src/prediction/db` carries the prediction-market tables.

```bash
bun run db:generate        # drizzle-kit generate — schema only, no credentials needed
bun run db:push            # talks to D1, needs credentials
bun run db:studio          # persistent
bun run db:migrate:local   # local miniflare D1 used by vinext dev/preview
bun run db:migrate:remote  # production D1
```

`db:push` and `db:studio` need `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_D1_TOKEN` (or `CLOUDFLARE_API_TOKEN`). A local `.env` wins over the
monorepo-root `.env`.

**Never edit an applied migration.** Change `lib/db/schema.ts`, run
`db:generate`, and commit the new migration file.

## Auth

better-auth (`lib/auth/`), email/password plus Google OAuth, sessions in D1.
`/admin` is gated by a comma-separated `ADMIN_EMAILS` allowlist — with neither
`ADMIN_EMAILS` nor `ADMIN_EMAIL` set, **nobody** is an admin
(`lib/auth/admin.ts`). Operational notes on cookies and the OAuth callback
origin are in [`devdocs/AUTH_CONFIGURATION.md`](../../devdocs/AUTH_CONFIGURATION.md).

## Environment

`env.ts` validates with zod, and **everything is optional** so builds and
preview environments never fail validation — call sites keep their own runtime
guards. Do not make a variable required to "catch" a misconfiguration; guard at
the call site instead.

Secrets are Worker secrets, set with `wrangler secret put <NAME>`:
`BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`. Broker and LLM
keys go the same way. Never commit any of them.

## Deploy

```bash
bun run build     # turbo build; then scripts/write-root-deploy-config.mjs
bun run deploy    # vinext-cloudflare deploy
bun run cf-typegen  # regenerate cloudflare-env.d.ts after changing bindings
```

Change a binding in `wrangler.jsonc` → run `cf-typegen` → commit the updated
`cloudflare-env.d.ts`.

## Testing against Workers

Tests run under Node with Vitest. **Passing tests do not prove the code runs on
a Worker.** Node APIs outside `nodejs_compat`, anything that assumes a
filesystem, and long-running CPU work will pass locally and fail in production.
Exercise the real thing with `bun run preview` (local miniflare D1) before
deploying anything that touches the Worker entrypoint, bindings, or crons.
