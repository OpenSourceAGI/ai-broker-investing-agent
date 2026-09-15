# `ai-broker-web`

The deployed application: the UI, the public API, the documentation site, and
the D1 schema. This is the only workspace in the monorepo that ships.

📑 [Documentation](https://docs.autoinvestment.broker/) ·
🚀 [Live app](https://autoinvestment.broker) ·
🔌 [API](https://autoinvestment.broker/api/docs)

## What it does

| Area | Route | What you get |
| --- | --- | --- |
| Agent debate | `/debate`, `/stock/[symbol]` | Several LLM analyst agents argue a position — bull, bear, risk — and return a scored verdict with citations. |
| Markets | `/markets`, `/stock/[symbol]` | Quotes, historical bars and charts from Alpaca and Finnhub, rendered with lightweight-charts. |
| Portfolio | `/portfolio`, `/dashboard` | Positions, entry/exit signals from `packages/investing`, and paper or broker execution through Alpaca. |
| Prediction markets | `/predict` | Cross-venue prices and arbitrage spreads from `packages/predictos` (Polymarket, Kalshi). |
| Copy trading | `/leaders` | Leaderboards of tracked traders and their disclosed positions. |
| Accounts | `/login`, `/legal` | better-auth sign-in (Google, email, SIWE wallet), Stripe subscriptions via the better-auth plugin, Didit KYC at `/api/kyc`. |
| Admin | `/admin` | User and D1 controls, gated on `ADMIN_EMAILS`. |
| Docs | `/docs` | This project's documentation, Fumadocs over `content/docs`. |
| API | `/api/*` | 39 route groups, described by the OpenAPI spec that generates `packages/ai-broker-api-client`. |

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js App Router, built by [vinext](https://github.com/cloudflare/vinext) (Vite) rather than `next build` |
| Runtime | Cloudflare Workers (`workerd`) — in development too |
| Database | Cloudflare D1 via Drizzle ORM |
| Auth | [better-auth](https://better-auth.com) with Google OAuth and SIWE wallets |
| Email | Cloudflare Email Workers (the only mail path) |
| UI | React 19, Tailwind CSS v4, shadcn/ui, Radix |
| Docs | [Fumadocs](https://fumadocs.dev) over MDX in `content/docs` |
| Tests | Vitest |

## Quick start

From the repository root:

```bash
bun install
cp apps/ai-broker-web/.env.example apps/ai-broker-web/.env   # optional — see below
bun run db:migrate:local   # create the local Miniflare D1
bun run dev                # http://localhost:3000
```

No keys are required to boot. An empty `.env` gives you the markets pages, the
docs site and signed-out browsing; each key in
[Environment variables](#environment-variables) switches one more feature on.

The full walkthrough is in
[Quick Start](https://docs.autoinvestment.broker/docs/getting-started).

## Layout

```plaintext
apps/ai-broker-web/
├── app/                 # App Router
│   ├── api/             # 39 route groups — markets, agents, auth, cron, admin…
│   ├── docs/            # The documentation site
│   ├── admin/           # ADMIN_EMAILS-gated user and database controls
│   └── dashboard/ portfolio/ markets/ predict/ stock/ leaders/ debate/ legal/
├── components/          # auth, investing, landing, layout, settings, social, theme, ui
├── content/docs/        # MDX sources for the docs site
├── lib/
│   ├── db/schema.ts     # Drizzle schema — source of truth for migrations
│   ├── auth/            # better-auth configuration
│   ├── fumadocs/        # Docs source loader and configuration
│   ├── ai/              # Prompts, model providers, agent tools
│   └── alpaca/ payments/ kyc/ openapi/ lightweight-charts/
├── migrations/          # Generated D1 migrations, applied by Wrangler
├── worker/index.ts      # Worker entry: fetch + scheduled handlers
├── vite.config.ts       # The build (there is no next.config)
├── wrangler.jsonc       # Bindings, cron triggers, Worker settings
└── env.ts               # Typed, validated environment
```

## Scripts

Run these from the repository root so Turborepo builds the workspace packages
first, or from this directory with `bun run <script>`.

| Script | What it does |
| --- | --- |
| `dev` | `vinext dev` on port 3000, with live D1 and email bindings. |
| `build` | `vinext build` → `dist/client` + `dist/server`. |
| `preview` | Builds and serves the production Worker locally. |
| `deploy` | `vinext-cloudflare deploy`. |
| `test` | `vitest run`. |
| `type-check` | `tsc --noEmit`. |
| `cf-typegen` | Regenerates `cloudflare-env.d.ts` from `wrangler.jsonc`. |
| `db:generate` | Generates a Drizzle migration from `lib/db/schema.ts`. |
| `db:migrate:local` / `db:migrate:remote` | Applies migrations with Wrangler. |
| `db:studio` | Drizzle Studio against D1 over the REST API. |
| `docs:generate` | Recompiles the Fumadocs collections into `.source/`. |
| `docs:generate:api` | Regenerates the API reference from the OpenAPI spec. |
| `clean` | Removes `dist`, `.source`, `.turbo`, `.wrangler`, `node_modules`. |

## Environment variables

Every variable is optional and validated in [`env.ts`](./env.ts), so a missing
key disables one feature rather than failing the build. Local values go in
`apps/ai-broker-web/.env` (copy [`.env.example`](./.env.example)); deployed
values go behind `wrangler secret put <NAME>`, except the plain
`NEXT_PUBLIC_*` ones, which belong in `vars` in
[`wrangler.jsonc`](./wrangler.jsonc) because the client bundle inlines them.

Nothing below is required to boot: `bun run db:migrate:local && bun run dev`
gives you a working app with signed-out browsing, the docs site, and the
markets pages. Add keys to switch features on.

### App identity

| Variable | Enables | Where to get it |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Absolute URLs in emails, OAuth callbacks, and the cron dispatcher's origin. | Your own deployed origin, e.g. `http://localhost:3000` in development. |
| `NEXT_PUBLIC_APP_DOMAIN` | Cookie domain and canonical links. | Same as above. |
| `NEXT_PUBLIC_APP_NAME` / `NEXT_PUBLIC_APP_EMAIL` | Branding in the UI and in outbound mail. | Your own values. |

### Database — Cloudflare D1

On Workers, D1 arrives as the `DB` binding declared in `wrangler.jsonc`; there
is no connection string. These three are only read *outside* the Worker — by
`drizzle-kit`, `db:studio`, and maintenance scripts.

| Variable | Enables | Where to get it |
| --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | D1 over the REST API. | [Cloudflare dashboard](https://dash.cloudflare.com) → any zone → the Account ID in the right-hand sidebar. |
| `CLOUDFLARE_D1_TOKEN` | The same, authenticated. Needs the **D1 Edit** permission. | [My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) → Create Token → Custom token. |
| `CLOUDFLARE_DATABASE_ID` | Targets a database other than `ai-broker-db`. | `bunx wrangler d1 list`, or the ID already in `wrangler.jsonc`. |

### Auth

| Variable | Enables | Where to get it |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | Session signing. Without it, nobody can stay signed in. | Generate one: `openssl rand -base64 32`. See [better-auth installation](https://www.better-auth.com/docs/installation). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | The "Sign in with Google" button. | [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) → OAuth client ID (Web application). Authorized redirect URI: `<APP_URL>/api/auth/callback/google`. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | The same client ID, for the browser. | Same value as `GOOGLE_CLIENT_ID`. |
| `ADMIN_EMAILS` (or `ADMIN_EMAIL`) | The `/admin` area, for the comma-separated addresses listed. With neither set, nobody is an admin. | Your own address. |

SIWE wallet sign-in needs no keys — it verifies signatures in the Worker.

### Email — Cloudflare Email Workers

Delivery runs through the `SEND_EMAIL` binding, so there is no API key. Enable
[Email Routing](https://developers.cloudflare.com/email-routing/) on the zone
and verify the sender address there.

| Variable | Enables | Where to get it |
| --- | --- | --- |
| `EMAIL_FROM` | The From address on verification, password-reset, and invitation mail. | An address on a domain with Email Routing enabled. |

### Model providers

At least one is needed for the analyst agents and the debate view to answer.

| Variable | Enables | Where to get it |
| --- | --- | --- |
| `GROQ_API_KEY` | The default provider for the agent debate. | [console.groq.com/keys](https://console.groq.com/keys) |
| `OPENAI_API_KEY` | OpenAI models. | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `GOOGLE_API_KEY` | Gemini models. | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `ANTHROPIC_API_KEY` | Claude models. | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| `XAI_API_KEY` | Grok models. | [console.x.ai](https://console.x.ai) |
| `NEXT_PUBLIC_LLM_PROVIDER`, `NEXT_PUBLIC_GROQ_QUICK_THINK_MODEL`, `NEXT_PUBLIC_GROQ_DEEP_THINK_MODEL` | Which provider and model IDs the client picks by default. | Your own choice of model ID. |

### Market data and brokerage

| Variable | Enables | Where to get it |
| --- | --- | --- |
| `ALPACA_API_KEY` / `ALPACA_SECRET` (aliases: `APCA_API_KEY_ID` / `APCA_API_SECRET_KEY`) | Historical bars, live quote streaming, `/api/stocks/*`. | [Alpaca dashboard](https://app.alpaca.markets/paper/dashboard/overview) → API Keys. Paper keys work. |
| `ALPACA_BASE_URL` | Points the data client somewhere other than `https://data.alpaca.markets`. | — |
| `ALPACA_DATA_FEED` | `iex` (free) vs. `sip` (paid). | Alpaca plan. |
| `ALPACA_BROKER_API_KEY` / `ALPACA_BROKER_SECRET_KEY` / `ALPACA_BROKER_BASE_URL` | The Broker API account endpoints — real accounts, not paper trading. | [Alpaca Broker API](https://alpaca.markets/broker) — requires an approved broker partner account. |
| `FINNHUB_API_KEY` | Supplementary quotes and company data. | [finnhub.io/dashboard](https://finnhub.io/dashboard) |
| `EODHD_API_KEY` | Delisted-symbol lookups. | [eodhd.com](https://eodhd.com/cp/dashboard) |

> Broker credentials move real money. Keep production keys in
> `wrangler secret put`, never in `.env`, and develop against Alpaca paper keys.

### Billing — Stripe

| Variable | Enables | Where to get it |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Checkout and subscription management. | [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys) |
| `STRIPE_WEBHOOK_SECRET` | Verifying the Stripe callbacks better-auth handles under `/api/auth/stripe/webhook`. | [dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks) → your endpoint → Signing secret. Locally, `stripe listen --forward-to localhost:3000/api/auth/stripe/webhook` prints one. |

### Identity verification — Didit

| Variable | Enables | Where to get it |
| --- | --- | --- |
| `DIDIT_API_KEY` / `DIDIT_WORKFLOW_ID` | Starting a KYC session at `/api/kyc/start`. | [business.didit.me](https://business.didit.me) → API keys and the workflow you created. |
| `DIDIT_WEBHOOK_SECRET` | Verifying KYC result callbacks. | The same dashboard, on the webhook. |

### Scheduled triggers

| Variable | Enables | Where to get it |
| --- | --- | --- |
| `CRON_SECRET` | The bearer token `worker/index.ts` sends to `/api/cron/*`, and that those routes require. | Generate one: `openssl rand -hex 32`. |

The schedules live in `triggers.crons` in `wrangler.jsonc` and are mapped to
routes in [`worker/index.ts`](./worker/index.ts) — currently
`/api/cron/sync-markets` daily at 00:00 UTC and `/api/cron/refresh-quotes` at
00:15 UTC. `sync-polymarket` and `sync-zulu` exist as routes but are not yet on
a schedule — add them to both lists together.

### Bot gate — Cloudflare Turnstile

Optional. With both keys unset the gate never runs; set both to challenge a
desktop browser's first HTML page view. Phones, crawlers, `/api/*`, assets and
RSC fetches are never challenged.

| Variable | Enables | Where to get it |
| --- | --- | --- |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | The gate. | [Cloudflare dashboard](https://dash.cloudflare.com) → Turnstile → Add widget (Managed). |
| `TURNSTILE_ENABLED` | `"false"` switches the gate off while keeping the keys. | — |
| `TURNSTILE_TTL_SECONDS` | How long one pass lasts. Default 604800 (7 days), clamped to 5 minutes – 30 days. | — |
| `TURNSTILE_COOKIE_DOMAIN` | Shares one pass across subdomains, e.g. `.autoinvestment.broker`. | — |

The same table, with prose, is in
[Configuration](https://docs.autoinvestment.broker/docs/getting-started/configuration).

## Cloudflare specifics

Three constraints shape most of the server code:

- **No filesystem.** Read bundled JSON through an `import`, never `fs`.
- **No long-lived TCP.** Reach the database through the `DB` binding, not a TCP
  client. There is no Postgres, libsql/Turso, or local SQLite fallback.
- **A 10 MB compressed bundle limit** (3 MB on the free plan). The server bundle
  is around 7 MB gzipped, so measure before adding a large dependency.

Adding either of the first two back is what breaks a deploy that builds cleanly.
See [Troubleshooting](https://docs.autoinvestment.broker/docs/deployment/troubleshooting).

## Documentation site

The docs at `/docs` are Fumadocs over the MDX in [`content/docs`](./content/docs).

- Branding, GitHub links, and nav links: [`lib/fumadocs/customize-docs.ts`](./lib/fumadocs/customize-docs.ts)
- Layout and nav wiring: [`app/layout.config.tsx`](./app/layout.config.tsx), [`app/docs/layout.tsx`](./app/docs/layout.tsx)
- Source loader: [`lib/fumadocs/source.tsx`](./lib/fumadocs/source.tsx)
- MDX pipeline: [`source.config.ts`](./source.config.ts)
- Components available in MDX: [`mdx-components.tsx`](./mdx-components.tsx)

A page's URL follows its path under `content/docs`, and sidebar order comes from
the `pages` array in each folder's `meta.json`. Machine-readable copies of every
page are served at `/docs/llms.mdx/<slug>` and `/docs/llms-full.txt`.

## Tests

```bash
bun run test                                   # everything
bunx vitest run app/api/__tests__/some.test.ts # one file
```

Vitest picks up `lib/**/__tests__/**/*.test.ts` and
`app/**/__tests__/**/*.test.ts`, running in the `node` environment.

## Deploying

The target is Cloudflare Workers. Once, per account:

```bash
bunx wrangler login
bunx wrangler d1 create ai-broker-db          # copy the id into wrangler.jsonc
bun run db:migrate:remote                     # apply migrations/ to the remote D1
```

Then set the secrets. Only `BETTER_AUTH_SECRET` is needed for a usable deploy;
add the rest as you turn features on:

```bash
for NAME in BETTER_AUTH_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET \
            CRON_SECRET GROQ_API_KEY ALPACA_API_KEY ALPACA_SECRET \
            STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET; do
  bunx wrangler secret put "$NAME"
done
```

Public, non-secret values (`NEXT_PUBLIC_APP_URL`, `EMAIL_FROM`) go in `vars` in
[`wrangler.jsonc`](./wrangler.jsonc) — the client bundle inlines them at build
time, so a secret would not reach the browser anyway. `keep_vars: true` stops
Wrangler from deleting variables you set in the dashboard.

Also enable [Email Routing](https://developers.cloudflare.com/email-routing/)
on the zone and verify `EMAIL_FROM` there, or every outbound message fails.

Ship it:

```bash
bun run preview   # the production Worker, locally — do this first
bun run deploy
```

`bun run deploy` runs `vinext-cloudflare deploy`, which builds and uploads the
Worker, its assets, and the cron triggers together. Roll back from the
dashboard under Workers → the Worker → Deployments.

The full guide — Git-connected builds, custom domains, and rollbacks — is in
[Deployment](https://docs.autoinvestment.broker/docs/deployment).
