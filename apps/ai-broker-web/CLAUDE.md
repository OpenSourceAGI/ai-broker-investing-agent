# CLAUDE.md — `ai-broker-web`

The only deployed artifact: Next.js (App Router) built with **vinext** and run
on **Cloudflare Workers**. Full notes in
[`../../.claude/architecture/web-app.md`](../../.claude/architecture/web-app.md).

## Keep route handlers thin

`app/api/*` handlers parse, authorize, delegate, serialize. Trading logic lives
in `packages/investing` and `packages/predictos` — if you are writing a decision
rule inside a route handler, it is in the wrong file.

## Things that bite

- **Bindings changed → run `bun run cf-typegen`** and commit the updated
  `cloudflare-env.d.ts`.
- **Adding a cron means two edits**: the schedule in `wrangler.jsonc`
  (`triggers.crons`) *and* the `CRON_ROUTES` map in `worker/index.ts`. An
  unmapped schedule logs a warning and silently does nothing.
- **Never edit an applied migration.** Change `lib/db/schema.ts`, run
  `bun run db:generate`, commit the new file in `migrations/`.
- **Every env var in `env.ts` is optional on purpose** so builds and previews
  never fail validation. Guard at the call site; don't make one required.
- **`/admin` is gated by `ADMIN_EMAILS`** (comma-separated). With neither
  `ADMIN_EMAILS` nor `ADMIN_EMAIL` set, nobody is an admin — that is the safe
  default, keep it.
- **Vitest runs under Node — it does not prove the Worker works.** Use
  `bun run preview` (local miniflare D1) before shipping anything touching the
  Worker entrypoint, bindings, or crons.
- **The Turnstile gate runs first in `worker/index.ts`** (`lib/turnstile`). It
  only ever interrupts a desktop browser's first HTML page view, and it is a
  no-op until `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` are set. Adding a
  path that must answer machines — a webhook, a feed, a health check — outside
  `/api/*` means adding it to the exempt list in
  `lib/turnstile/request-filter.ts`.

## Layout

| Path | Owns |
| --- | --- |
| `app/` | Routes: `dashboard`, `markets`, `stock`, `portfolio`, `predict`, `debate`, `leaders`, `survey`, `legal`, `admin`, `login`, `docs` |
| `app/api/` | Route handlers, including `api/cron/*` and `api/openapi.json` |
| `components/` | App-local UI (shadcn; see `components.json`) |
| `lib/` | `auth/`, `db/`, `ai/`, `alpaca/`, `admin/`, `openapi/`, `fumadocs/`, `email/`, `kyc/` |
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
