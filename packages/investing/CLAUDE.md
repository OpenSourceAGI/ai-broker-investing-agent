# CLAUDE.md — `investing`

Published to npm. The heart of the repo: everything that decides *what to
trade*. The app renders this package; it does not reimplement it.

Read [`../../.claude/architecture/trading.md`](../../.claude/architecture/trading.md)
before changing anything that proposes, sizes, or executes a position.

## Public surface

Import from a subpath export, never from `src/`:

| Entry | What it gives you |
| --- | --- |
| `investing` | The barrel — db schemas, trading agents, Alpaca client, stocks, prediction, predictos, strategies, leaders, correlation |
| `investing/trading-agents` | The analyst agent graph |
| `investing/alpaca` | Broker client |
| `investing/stocks` | Instrument data and name resolution |
| `investing/prediction` | Prediction-market sync, analysis, tables |
| `investing/predictos` | Re-export of the PredictOS core |
| `investing/constants`, `investing/utils` | Shared constants and helpers |
| `investing/data/*` | Raw data files, served unbuilt |

Adding a new subsystem means adding a subpath export — do not let consumers
deep-import.

## Runtime constraint

This package runs **both** on Cloudflare Workers and in plain Node scripts. It
therefore reads the D1 binding off `globalThis.__CLOUDFLARE_ENV__` (set by the
app's `worker/index.ts`) rather than importing `cloudflare:workers`, which only
resolves inside workerd and would break both the Node scripts and the client
bundle. **Do not import `cloudflare:workers` here.**

`drizzle-orm` is a peer dependency — the `db` exports are optional by design.

## Layout

| Directory | Owns |
| --- | --- |
| `trading-agents/` | Agent graph: `agents/`, `tools/`, `graph/`. Has its own `README.md` and `IMPROVEMENTS.md`. |
| `debate-research/` | Bull vs. Bear — `prompts/`, `memory.js`, `llms.js`, FX normalization, health check. Still plain JS. |
| `algo-stategies/` | `algo-strategies.json` + the TradingView scraper. (The directory name is misspelled upstream; leave it.) |
| `alpaca/` | Broker REST client and the Alpaca MCP client |
| `leaders/` | ZuluTrade and NVSTly copy-trading leaderboards |
| `live-data/` | Dukascopy feed + symbol table |
| `correlate/` | Time-series correlation / XGBoost prediction statistics |
| `prediction/` | Market sync, analysis, API, and its own D1 tables |
| `stocks/`, `stock-names-data/` | Instruments and name resolution |
| `qwksearch/`, `trending-topics/` | News/web research feeding the news analyst |
| `llm/` | Shared provider calls |
| `db/` | Drizzle schema, D1 client, `d1-http` client |

## Commands

```bash
cd packages/investing
bun run test              # vitest
bun run test:debate       # the debate suite — slow, network-shaped
bun run build             # rebuild before the app can see your change
```

Data-import and sync scripts (`import:leaders`, `import:stocks`,
`sync:high-volume-markets`, `sync:trade-history`) talk to live venues and D1.
Read [`devdocs/sync-scripts.md`](../../devdocs/sync-scripts.md) and
[`devdocs/HIGH_VOLUME_SYNC_GUIDE.md`](../../devdocs/HIGH_VOLUME_SYNC_GUIDE.md)
before running one; they are not idempotent no-ops.

## Rules

- Rebuild after editing — the app consumes `dist/`, not `src/`.
- A threshold or position-size change needs a test pinning the new number.
- Treat venue responses, scraped leaderboards and LLM output as untrusted input;
  validate before anything reaches an order path.
