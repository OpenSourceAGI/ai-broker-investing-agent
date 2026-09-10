# `ai-broker-web`

The deployed application: the UI, the public API, the documentation site, and
the D1 schema. This is the only workspace in the monorepo that ships.

📑 [Documentation](https://docs.autoinvestment.broker/) ·
🚀 [Live app](https://autoinvestment.broker) ·
🔌 [API](https://autoinvestment.broker/api/docs)

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
bun run db:migrate:local   # create the local Miniflare D1
bun run dev                # http://localhost:3000
```

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

## Configuration

Every variable is optional and validated in [`env.ts`](./env.ts), so a missing
key disables one feature rather than failing the build. Put local values in
`apps/ai-broker-web/.env`; put deployed secrets behind
`wrangler secret put <NAME>`.

The full table — Cloudflare, auth, admin, model providers, billing, email, cron,
and app URLs — is in
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

```bash
bun run preview   # the production Worker, locally
bun run deploy
```

The full guide — D1 setup, secrets, Git-connected builds, custom domains, and
rollbacks — is in
[Deployment](https://docs.autoinvestment.broker/docs/deployment).
