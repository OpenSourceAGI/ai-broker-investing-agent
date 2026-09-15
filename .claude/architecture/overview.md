# Architecture Overview

One deployed app, five libraries, and a pile of vendored prior art. Almost every
behaviour that decides *what to trade* lives in a `packages/*` library and is
merely *wired up* by the app that renders it. Finding the owning package is the
first step of nearly every task here.

## The product

A multi-agent investment research desk with three halves:

- **Research** — LLM analyst agents (fundamentals, news, technical, risk) that
  independently research a ticker and then argue it out in a Bull vs. Bear
  debate before a position is proposed.
- **Signals** — algorithmic entry/exit strategies, technical indicators,
  time-series correlation, and copy-trading leaderboards scraped from ZuluTrade
  and NVSTly.
- **Prediction markets** — Polymarket and Kalshi order books, event analysis
  agents, and cross-venue arbitrage.

## Request path, end to end

```
browser  ·  Google Play wrapper  ·  MCP client
        │
        ▼
apps/ai-broker-web            Next.js on Cloudflare Workers (via vinext)
  app/api/*                   route handlers — thin
        │
        ├─► packages/investing         agents, strategies, market data, brokers
        │       ├─ trading-agents/     the analyst graph and its tools
        │       ├─ debate-research/    Bull vs. Bear prompts, memory, LLM fan-out
        │       ├─ algo-stategies/     entry/exit strategy definitions
        │       ├─ alpaca/             broker client (+ MCP client)
        │       ├─ leaders/            ZuluTrade + NVSTly copy-trading leaders
        │       ├─ live-data/          Dukascopy FX/price feed
        │       ├─ correlate/          time-series correlation
        │       └─ prediction/         market sync, analysis, its own D1 tables
        │
        ├─► packages/predictos         prediction-market "super intelligence"
        │       ├─ agents/             bookmaker, event analysis, mapper, order bots
        │       ├─ clients/            Polymarket, Polyfactual, x402
        │       ├─ data/               Polymarket + Kalshi market data
        │       └─ arbitrage.ts        cross-platform arbitrage
        │
        └─► packages/fin-data-api      Congress.gov, Seeking Alpha, CFTC providers
        │
        ▼
  D1 (Drizzle) · Workers AI · SEND_EMAIL binding · better-auth
```

`packages/investing` is deliberately runtime-agnostic: it runs both inside
workerd and in plain Node scripts, so it reads the D1 binding off `globalThis`
(`__CLOUDFLARE_ENV__`, set in `worker/index.ts`) rather than importing
`cloudflare:workers`. Keep it that way — importing `cloudflare:workers` there
breaks both the Node scripts and the client bundle.

## Apps

| App | Stack | Owns |
| --- | --- | --- |
| `ai-broker-web` | Next.js + vinext → Cloudflare Workers, D1 via Drizzle | The deployed product: routes, `/api`, auth, admin, docs, DB schema and migrations. See [web-app.md](web-app.md). |

Route groups under `app/`: `dashboard`, `markets`, `stock`, `portfolio`,
`predict`, `debate`, `leaders`, `survey`, `legal`, `admin` (gated by
`ADMIN_EMAILS`), `login`, and `docs` (Fumadocs).

## Packages

| Package | Published | What it owns |
| --- | --- | --- |
| `investing` | npm | Trading agents, debate research, algo strategies, Alpaca, leaderboards, live data, correlation, prediction-market sync. The heart of the repo. |
| `predictos` | npm | Prediction-market multi-agent analysis, Polymarket/Kalshi clients, cross-platform arbitrage. Adapted from PredictionXBT/PredictOS (MIT). |
| `fin-data-api` | — | TypeScript port of OpenBB finance APIs: Congress, earnings calendars, CFTC. Zod-validated, Scalar OpenAPI docs. The one Jest workspace. |
| `ai-broker-api-client` | private | Typed client **generated** from the OpenAPI spec with `@hey-api/openapi-ts`. Do not hand-edit `*.gen.ts`. |
| `mcp-server` | — | MCP server **generated** from the same OpenAPI spec (33 tools) via `mcp-use`. |

## Not part of the build

- **`third-party-trading-bots/`** — vendored open-source bots kept as prior art
  for position sizing, LLM batching, and venue normalization. Outside the
  workspace globs; turbo never fans out into it; nothing here deploys. Each
  subdirectory keeps its own upstream license. Read it, don't edit it, don't
  import from it.
- **`devdocs/`** — internal engineering notes, runbooks and decision records.
  User-facing docs go in `apps/ai-broker-web/content/docs` instead.
