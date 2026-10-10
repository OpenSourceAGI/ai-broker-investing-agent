# CLAUDE.md — `investing`

Published to npm. The heart of the repo: everything that decides *what to
trade*. The app renders this package; it does not reimplement it.

Read [`../../architecture/trading.md`](../../architecture/trading.md)
before changing anything that proposes, sizes, or executes a position.

## Public surface

Published consumers normally import from a subpath export. The third-party
integration tests/demo are an explicit source-level exception: current advertised
subpath JavaScript targets are missing and the root dist import fails. Import
source leaves for this assessment, never `src/index.ts` (native module and dotenv
side effects). No app or published-package integration is claimed.

| Entry | What it gives you |
| --- | --- |
| `investing` | The barrel — db schemas, trading agents, Alpaca client, stocks, prediction, prediction-markets, strategies, leaders, correlation |
| `investing/trading-agents` | The analyst agent graph |
| `investing/alpaca` | Broker client |
| `investing/stocks` | Instrument data and name resolution |
| `investing/prediction` | Prediction-market sync, analysis, tables |
| `investing/prediction-markets` | Prediction-market multi-agent analysis, Polymarket/Kalshi clients, cross-platform arbitrage |
| `investing/constants`, `investing/utils` | Shared constants and helpers |
| `investing/data/*` | Raw data files, served unbuilt |

The additive source surface `src/strategy-signals/index.ts` exports normalized
signals, proposal selection, validation/risk/execution contracts, sources,
mappings and mocks. `TradingAgentsGraph` accepts optional fourth-argument
`GraphOptions` (`llm`, `riskReview`, `riskLimits`, `riskPosture`) and optional
per-run context (`instrument`, signals, account, evaluation time, event, sources).
Registered sources are required for executable third-party proposals. Graph and
agents import contract leaves; no demo export or barrel cycle is allowed.

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
| `strategy-signals/` | Pure source adapters, proposal/approval/risk contracts, venue/data mappings and paper mocks. `demo.ts` stays out of barrels. |
| `debate-research/` | Bull vs. Bear — `prompts/`, `memory.js`, `llms.js`, FX normalization, health check. Still plain JS. |
| `algo-stategies/` | `algo-strategies.json` + the TradingView scraper. (The directory name is misspelled upstream; leave it.) |
| `alpaca/` | Broker REST client and the Alpaca MCP client |
| `leaders/` | ZuluTrade and NVSTly copy-trading leaderboards |
| `live-data/` | Dukascopy feed + symbol table. Never call dukascopy-node's `getHistoricalRates`/`getRealTimeRates` directly: their config check compiles with `new Function`, which Cloudflare Workers reject. `dukascopy-client.ts` rebuilds that pipeline from the library's exported pieces. |
| `correlate/` | Time-series correlation / XGBoost prediction statistics |
| `prediction/` | Market sync, analysis, API, and its own D1 tables |
| `prediction-markets/` | Bookmaker / event-analysis / mapper agents, Polymarket order bots, venue clients, arbitrage. MIT — keep its `LICENSE` file. |
| `stocks/`, `stock-names-data/` | Instruments and name resolution |
| `qwksearch/`, `trending-topics/` | News/web research feeding the news analyst |
| `llm/` | Shared provider calls |
| `db/` | Drizzle schema, D1 client, `d1-http` client |

## Commands

For third-party integration work, run every install/check/demo in Docker from
the repository root with `bash devdocs/third-party-integration/harness/run.sh`
and one of `install`, `test`, `test-root`, `tsc`, `build`, `coverage`, `demo`, `pack`.
Never install into or execute against host node_modules. The harness stages a
credential-excluded checkout and checks offline on pinned Bun 1.3.11.

```bash
cd packages/investing
bun run test              # vitest
bun run test:debate       # the debate suite — slow, network-shaped
bun run build             # rebuild before the app can see your change
```

Data-import and sync scripts (`import:leaders`, `import:stocks`,
`sync:high-volume-markets`, `sync:trade-history`) talk to live venues and D1.
Read [`devdocs/sync-scripts.md`](../../../devdocs/sync-scripts.md) and
[`devdocs/HIGH_VOLUME_SYNC_GUIDE.md`](../../../devdocs/HIGH_VOLUME_SYNC_GUIDE.md)
before running one; they are not idempotent no-ops.

## Rules

- Rebuild after editing — the app consumes `dist/`, not `src/`.
- A threshold or position-size change needs a test pinning the new number.
- Treat venue responses, scraped leaderboards and LLM output as untrusted input;
  validate before anything reaches an order path.
- Source time and holdings come from the run context; never assume prior orders
  filled. Execute one approved portfolio leg per run and refresh actual snapshots.
- Strategy prices retain precision; only execution requires whole cents. Weighted
  average holding costs can be fractional. Probability means genuine P(YES).
- BLOCK and malformed judge output force HOLD; REDUCE and Fund Manager quantities
  are binding caps. Red flags are advisory. See the integration overview and
  `devdocs/third-party-integration/skills/integrate-trading-bot/SKILL.md`.
