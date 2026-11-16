# Third-party trading bots: assessment and integration

`third-party-trading-bots/` holds ten vendored projects in Python, TypeScript
and Rust. None of them is wired into the monorepo build: turbo never fans out
into the folder, and nothing there ships. This note records what each one is,
what it would take to run, and how it connects (or could connect) to
`packages/investing`.

**Integrated in this change:** two bots now run through the per-stock backtest
engine in `packages/investing/src/backtest`:

| Bot | Catalog id | Runs on stocks | How |
| --- | --- | --- | --- |
| ai-hedge-fund (technical analyst) | `hedge-fund-technicals` | Yes | TypeScript port of `src/agents/technicals.py` |
| kalshi-bot-api (momentum example) | `kalshi-momentum` | No, with the reason shown | Adapter over the existing port in `prediction-markets/strategies/kalshi-momentum.ts` |

Both are ports, not wrappers around the vendored code: the app never imports
or starts anything under `third-party-trading-bots/`.

The technicals port reproduces upstream's daily verdicts exactly on the AAPL,
MSFT and SPY fixtures (checked bar by bar against the Python agent run with
pandas). That includes one upstream quirk: `calculate_hurst_exponent` subtracts
two date-indexed pandas slices, which pandas aligns, so every difference is 0
and the exponent is always 0. The stat-arb vote therefore only depends on skew.
The port keeps this so results describe the bot as it actually runs.

## Inventory

| Bot | Kind | Runtime and entry point | Data and credentials | Reuse | Recommended path |
| --- | --- | --- | --- | --- | --- |
| **ai-hedge-fund** | Multi-agent research fund (18 LLM and analytic agents) | Python (Poetry), `src/main.py`; Docker compose; separate web app under `app/` | Financial Datasets API key for prices and fundamentals; one LLM provider key (OpenAI, Anthropic, Groq, Gemini, DeepSeek and others) | The **technical analyst** is pure math over OHLCV: reusable as a strategy. Persona agents need LLMs and fundamentals. | **Done:** technicals ported as `hedge-fund-technicals`. Persona agents could become prompts in `trading-agents` later. |
| **kalshi-bot-api** (PyKalshi) | Python SDK for Kalshi, plus an example momentum bot | Python ≥ 3.9 package `pykalshi`; `examples/momentum_bot.py` | Kalshi API key and private key for anything authenticated | The momentum rules are deterministic and already ported in `prediction-markets/strategies/kalshi-momentum.ts` | **Done:** registered as `kalshi-momentum`, prediction-market only. A live venue needs a Kalshi client in TypeScript. |
| **Kalshi-Vibe-Bot** | Autonomous Kalshi trader: FastAPI + SQLite backend, Vite React dashboard | Python `backend/run.py` and Node `frontend/`; Dockerfiles for both; `start.bat` | Kalshi credentials (it places orders) and Gemini or Grok keys for forecasts | The local pre-filter, event partitioning, Kelly sizing and `strategy_gates.py` guards are reusable as pure functions | Port the gates and sizing as a prediction-market strategy; feed it recorded LLM forecasts for backtests. |
| **Polymarket-BTC-15-Minute-Trading-Bot** | Signal-fusion bot for Polymarket 15-minute BTC markets on NautilusTrader | Python `bot.py` / `15m_bot_runner.py`; Redis, Prometheus and Grafana | Polymarket CLOB keys and funder wallet; Coinbase and Binance feeds; Redis | The spike, sentiment and divergence processors and the weighted fusion are reusable | Port the fusion as a prediction-market strategy over recorded BTC and market-price bars. |
| **Prediction-Markets-Trading-Bot-Toolkits** | Rust execution engine with ten strategies over venue adapters | Rust 2021 crate `polymarket-toolkits`; `config.yaml.example` | Venue keys for Polymarket, Kalshi and five others; Polygon RPC for the whale signal | The venue-adapter design and copy-trade sizing rules; the binary itself does not fit a TypeScript app | Re-implement individual strategies (copy-trade sizing, resolution sniping) as TypeScript strategies. |
| **poly-bot-gabagool** | Hedged YES+NO arbitrage on Polymarket 15-minute markets | Node, `npm start` → `ts-node src/index.ts` | Polygon private key, CLOB API URL, USDC balance | The pair-cost threshold and hedging logic are pure TypeScript | Port the threshold logic as a prediction-market strategy; needs order-book fixtures for backtests. |
| **poly-bot-openclaw** | Agent framework over Hyperliquid, Binance, Bybit, Jupiter, Uniswap and Polymarket | Node, `node agent.js` | EVM private key and RPC, Sidex gateway token, local Ollama model | The survival-posture state machine (risk posture from P&L) | Reuse the posture idea in risk management; the execution pipelines are out of scope. |
| **polymarket-exec-api** (pmxt) | Unified prediction-market API (Python and TypeScript SDKs) | Node monorepo with generated SDKs | Per-venue keys for Polymarket, Kalshi, Limitless and others | The Event → Market → Outcome model and the venue compliance matrix | Use as the reference shape for a venue-neutral prediction-market data layer. |
| **debate-agents** | LangGraph bull-versus-bear debate (TradingAgents pattern) | Python `main.py` | Gemini, OpenAI or xAI keys; optional Finnhub, FMP, EODHD, Alpha Vantage, Tavily; yfinance for prices | Red-flag detector and financial-health checks are deterministic | Port the red-flag checks as an advisory pre-filter for `trading-agents`. |
| **fin-data-api-python** (OpenBB core) | FastAPI data layer with 36 provider extensions | Python `api/`, provider packages under `providers/` | One key per paid provider; yfinance, SEC, FRED and others are free | The provider-fetcher contract is already mirrored by `packages/fin-data-api` | No port needed; keep using `packages/fin-data-api`. |

## How the backtest integration works

```
Algo Strategies tab  →  /api/backtest-technical (validate, load bars)  →  packages/investing/src/backtest
                                                                             ├─ catalog: indicatorts (24), hedge-fund-technicals, kalshi-momentum
                                                                             ├─ checkAvailability: unsupported asset / insufficient history / unknown id
                                                                             ├─ simulate: long-only, fee + slippage + position size
                                                                             └─ runBacktests: one result per strategy, failures isolated
```

- Each result is `ok` (metrics, trades, latest BUY/SELL/HOLD signal), `unavailable` (with a reason), or `failed` (with the error). Nothing is omitted, and unsupported strategies never get made-up metrics.
- `latestSignal` uses the BUY/SELL/HOLD vocabulary the trading agents already use, so a backtest result can feed the agent pipeline as-is.
- Backtests never import a broker client or read broker credentials.

## Local setup

| Step | Command | Notes |
| --- | --- | --- |
| Install | `bun install` | The repo pins `bun@1.3.11` and commits no lockfile. `npm install` is not supported. |
| Investing tests | `bunx turbo run test --filter=investing` | `test/prediction-markets-exports.test.ts` fails to load on Windows: the native `xgboost_node` module does not install there. This is unrelated to backtesting. |
| Backtest tests only | `cd packages/investing && bun run vitest run test/backtest` | No network or keys. |
| Web route tests | `cd apps/ai-broker-web && bun run vitest run app/api/backtest-technical` | Yahoo Finance is mocked. |
| Web app | `cd apps/ai-broker-web && bun run dev` | `packages/investing` has no `dev` script, so `turbo run dev --filter=investing` starts nothing. The first request to each route compiles slowly in dev. |
| Offline demo | Turn on **Demo data** in the Algo Strategies tab, or set `BACKTEST_DEMO=1` | Recorded daily bars for AAPL, MSFT and SPY, 2022–2024. Re-record with `bun scripts/record-backtest-fixtures.ts` in `packages/investing`. |

No API keys are needed for backtesting: live mode reads Yahoo Finance without
a key. The web app's `.env.example` keys (Cloudflare D1, Google OAuth, Stripe,
model providers) cover login, payments and the AI agents. Without a migrated
local D1 database the quote cache logs failed inserts; run
`bun run db:migrate:local` in `apps/ai-broker-web` to silence them.

## Adding another bot

1. Port its decision logic to a pure function in `packages/investing/src/backtest/strategies/<id>.ts` that returns one action per bar and only reads bars up to the current one.
2. Export a `BacktestStrategy` with `provider: "third-party"`, a `source` (repo, file, license), the asset classes it supports and, for others, an `unsupportedReason`.
3. Add it to `BACKTEST_CATALOG` in `catalog.ts` and write tests for its signals and availability.
