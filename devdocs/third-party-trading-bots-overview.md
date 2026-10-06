# Third-party trading bots: assessment and integration

Assessed against the vendored files at commit `b877b41`, on 2026-10-05. All ten folders contribute to `packages/investing`. The runtime integration consists of pure TypeScript sources, mappings and a risk posture. It never imports or starts a vendored bot.

Native assessment and the TypeScript integration are separate results. A successful native assessment below can mean a selected simulation, detector or model import; it does not mean the full live bot ran. All integrated consumers use fixtures, a scripted LLM and paper execution. No live provider, wallet or broker was connected.

## Summary

| Vendored folder | Kind | Native assessment | Operational TypeScript contribution |
|---|---|---|---|
| `kalshi-bot-api` | Python venue SDK and example strategy | `ran`: public model import/construction | Momentum source and separate YES/NO bid/ask mapping |
| `Kalshi-Vibe-Bot` | Forecast-driven strategy service | `ran`: native filter simulation and 11 native tests | Forecast source, Kelly sizing and entry guards; YES and NO paper fills |
| `polymarket-exec-api` | pmxt venue SDK | `unsupported-runtime`: missing generated `pmxt_internal` | Binary market-model adapter; explicitly synthetic fixture quotes consumed by paper venue |
| `poly-bot-gabagool` | Sequential hedge strategy | `no-demo-mode`: safe config import succeeded; live entrypoint excluded | Independent portfolio targets, sequential fills and actual-cost feedback |
| `Polymarket-BTC-15-Minute-Trading-Bot` | Signal fusion and execution service | `unsupported-runtime`: Windows-only dependency; missing NautilusTrader | Independent fusion source and position/exposure guards; bullish and bearish paper fills |
| `Prediction-Markets-Trading-Bot-Toolkits` | Rust bot toolkit | `needs-network`: 5 native sizing tests passed, mock CLI still needs Polygon websocket | Translated copy-trade sizing source; whole-contract paper fill |
| `ai-hedge-fund` | Multi-agent investment framework | `bot-failure`: numeric references ran; backtester stops at interactive model selection | Independent five-group technical recommendation source; stock BUY and SELL |
| `debate-agents` | Analyst/debate framework | `ran`: native red-flag detector fixture | Independent advisory fundamental report; visible to agents, no deterministic veto |
| `poly-bot-openclaw` | Autonomous trading/survival service | `ran`: native SurvivalManager state simulation | Independent posture transitions and documented new size multiplier policy |
| `fin-data-api-python` | OpenBB data platform | `ran`: native historical-price model import/construction | Independent historical-bar mapping and fixture data provider consumed by stock run |

Package-relative paths below start at `packages/investing/`. Full notices and file hashes are in [THIRD_PARTY_NOTICES.md](../packages/investing/THIRD_PARTY_NOTICES.md). Reviewed golden outputs and their provenance live in `test/strategy-signals/golden/`.

## 1. kalshi-bot-api / PyKalshi

- **Format, language and runtime:** installable Python SDK (`pykalshi` 0.3.6), Python >=3.9, with standalone examples.
- **Entry points:** `pykalshi.KalshiClient`, `pykalshi/models.py`, `examples/momentum_bot.py`.
- **Inputs and outputs:** REST/websocket market models, ticker, timestamps and integer-cent YES prices; example outputs directional entry/exit decisions. `MarketModel` exposes separate nullable `yes_bid`, `yes_ask`, `no_bid`, `no_ask`.
- **Providers and APIs:** Kalshi REST and websocket APIs. Live usage needs Kalshi authentication.
- **Environment/services:** `KALSHI_API_KEY_ID`, `KALSHI_PRIVATE_KEY_PATH`; external Kalshi service. The integration needs neither.
- **License:** full MIT notice exists, copyright `(c) 2024` with no holder stated; retained exactly. Momentum and market-model blob hashes are recorded in the package notices.
- **Completeness and tooling clashes:** an SDK rather than an autonomous portfolio manager. Python authentication/network dependencies cannot run as Bun modules or Workers code.
- **Reuse versus adapter:** retain the existing pure momentum core; add `src/strategy-signals/sources/kalshi-momentum.ts` and `venues/kalshi-venue-mapping.ts`. No Python runtime dependency.
- **Assessment:** dependency install and offline public import/model construction succeeded. This did not connect to Kalshi or run the live momentum loop.
- **Integration:** momentum evaluates the latest tick using actual per-run holdings, rather than replaying imagined fills. An unheld account buys 10 YES contracts at 55¢; its actual holdings then enable a SELL at 60¢. The market mapping preserves all four independent quote fields and feeds a filled paper run.

## 2. Kalshi-Vibe-Bot

- **Format, language and runtime:** Python FastAPI backend with frontend, SQLite persistence and a scheduled trading loop.
- **Entry points:** `backend/run.py`, `backend/src/bot/loop.py`; decision helpers under `backend/src/decision_engine/`; assessment script `backend/scripts/simulate_filters.py`.
- **Inputs and outputs:** market quotes in dollars upstream, model forecasts and decisions, persisted positions/trades; the adapter uses decimal cents and genuine P(YES), including complemented NO-side probability.
- **Providers and APIs:** Kalshi REST; Gemini and xAI forecasts.
- **Environment/services:** `KALSHI_API_KEY`, `KALSHI_PRIVATE_KEY_PATH`, `GEMINI_API_KEY`, `XAI_API_KEY`, `XAI_MANAGEMENT_API_KEY`, `TRADING_MODE`, `PAPER_STARTING_BALANCE`, `PORT`; SQLite, live market feeds and hosted models in the full service.
- **License:** complete MIT, copyright `(c) 2026 K-Jeez`; translated sizing and gate math retain that notice.
- **Completeness and tooling clashes:** native paper mode still depends on live data. FastAPI, SQLite, its frontend and scheduler are outside the Bun/Workers source module.
- **Reuse versus adapter:** `src/strategy-signals/sources/kalshi-vibe.ts` and `kalshi-vibe-guards.ts`; recorded forecasts replace external model calls.
- **Assessment:** a staged synthetic closed-trade SQLite fixture ran through the project's own filter simulation; all 11 selected native math/gate tests passed offline. The full trading loop was not run.
- **Integration:** preserves minimum edge 5 points, buy-side forecast minimum 0.6, maximum edge 22, forecast ceiling 0.9, entry floor 26¢ and the 0.75 calibration block for 41–65¢ entries. Full forecast-based Kelly is capped at 5% of current deployable cash, including the small-account fallback. YES and NO demo cases each fill 9 contracts at 55¢. Fees, native stop-loss scheduling, liquidity checks and reconciliation are outside this selected decision core.

## 3. polymarket-exec-api / pmxt

- **Format, language and runtime:** TypeScript/Node monorepo and sidecar, plus generated Python SDK (vendored version 2.17.1); Node >=18, Python >=3.8.
- **Entry points:** `core/src/types.ts`, documented `pmxt.Polymarket`/`pmxt.Kalshi` clients and Python SDK exports.
- **Inputs and outputs:** markets with arbitrary outcome IDs/labels, point prices and decimal tick sizes. A point price is not an executable bid or ask.
- **Providers and APIs:** Polymarket and Kalshi through the pmxt clients/sidecar.
- **Environment/services:** `POLYMARKET_PRIVATE_KEY`, `POLYMARKET_PROXY_ADDRESS`, `KALSHI_API_KEY`, `KALSHI_PRIVATE_KEY`; venue services and the generated SDK/sidecar for native execution.
- **License:** complete MIT, copyright `(c) 2026 pmxt.dev`; notice included for the model reference.
- **Completeness and tooling clashes:** the vendored Python distribution lacks generated `pmxt_internal`. Sidecar/Node execution is unsuitable inside Workers.
- **Reuse versus adapter:** `src/strategy-signals/venues/pmxt-venue-mapping.ts` adapts the MIT public market contract without importing the SDK. Reject non-binary, ambiguous or unsupported markets; preserve outcome IDs, labels and decimal-cent ticks.
- **Assessment:** install succeeded; genuine documented Python import failed with `ModuleNotFoundError` for `pmxt_internal`. This is a runtime artifact failure, not an evidenced network failure.
- **Integration:** missing quotes remain null by default. Only explicit `{ priceAsQuote: true }` fixture/demo calls synthesize bid/ask from a point price; trace names identify them as synthetic. The mapped fixture feeds an approved paper fill. A 0.499-dollar strategy price remains 49.9¢ and is rejected by whole-cent execution.

## 4. poly-bot-gabagool

- **Format, language and runtime:** standalone TypeScript/Node >=18 bot, ts-node entrypoint, timers and on-chain execution.
- **Entry points:** `src/index.ts`, `src/order-builder/copytrade.ts`, `src/config/index.ts`.
- **Inputs and outputs:** YES/NO dollar quotes, current position quantities and average costs; sequential orders building a combined-cost hedge.
- **Providers and APIs:** Polymarket CLOB/Gamma, Polygon RPC and ethers wallet/allowance calls.
- **Environment/services:** `PRIVATE_KEY`, `RPC_URL`, `RPC_TOKEN`, `CLOB_API_URL`, `CHAIN_ID`, and `COPYTRADE_*`/`GABAGOOL_*` configuration; wallet, Polygon and Polymarket for native execution.
- **License:** ISC in package metadata only; no complete copyright/notice. Integration was implemented independently; no upstream code was translated.
- **Completeness and tooling clashes:** no credential-free paper/demo script. Live startup creates credentials and approves token allowances. Node timers, wallet and RPC execution cannot be reused in the pure module.
- **Reuse versus adapter:** independent core `src/prediction-markets/strategies/gabagool.ts`, adapter `src/strategy-signals/sources/gabagool.ts`.
- **Assessment:** dependencies installed and native configuration imported offline. The command intentionally reports `no-demo-mode`; the live entrypoint was not started.
- **Integration:** emits ordered portfolio targets, executes one delta per run, and calculates the next side's limit from the other side's actual average fill cost. Default entry is 49.9¢; combined average-cost ceiling is 98¢. Demo: first YES fill → wait → price rejection with unchanged account → NO fill → satisfied HOLD. A separate REDUCE case and tests cover partial fills and fractional weighted averages. Unfilled legs leave an exposed holding; no atomic pair is promised. Redemption and live allowance handling are excluded.

## 5. Polymarket-BTC-15-Minute-Trading-Bot

- **Format, language and runtime:** Python service with signal processors, NautilusTrader execution and monitoring; dependency file includes platform-specific packages.
- **Entry points:** actual `bot.py`, `15m_bot_runner.py`, `core/strategy_brain/fusion_engine/signal_fusion.py`, `execution/risk_engine.py`. README references `run_bot.py`, absent in the vendored folder.
- **Inputs and outputs:** timestamped processor signals, bullish/bearish direction, confidence and strength; weighted fused direction/score and orders. No independent forecast probability is supplied.
- **Providers and APIs:** Polymarket, Coinbase and Binance; NautilusTrader data/execution.
- **Environment/services:** `POLYMARKET_PK`, `POLYMARKET_API_KEY`, `POLYMARKET_API_SECRET`, `POLYMARKET_API_PASSPHRASE`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`; Redis, Prometheus/Grafana and live feeds in the full service.
- **License:** MIT badge only, no notice or holder, placeholder upstream clone URL. Implemented independently.
- **Completeness and tooling clashes:** Windows-only `pywin32==311` cannot install in the Linux assessment image; missing NautilusTrader blocks the test-mode entrypoint. Python/service infrastructure is not a Bun/Workers library.
- **Reuse versus adapter:** independent `src/prediction-markets/strategies/btc15m-fusion.ts` and `src/strategy-signals/sources/btc15m-fusion.ts`.
- **Assessment:** Python 3.14 install failed on the platform dependency; `bot.py --test-mode` then failed for missing `nautilus_trader`. Outcome `unsupported-runtime`.
- **Integration:** explicit evaluation time replaces the wall clock. Preserve strict age <5 minutes, bullish tie, score >=60 and confidence >=0.6, processor weights and ordered/unique input. Entry guards enforce $1 per position, $10 total exposure and five open positions. Both directions fill in the demo. Native daily-loss/drawdown accounting is outside the selected fusion core; no forecast or Kelly value is invented.

## 6. Prediction-Markets-Trading-Bot-Toolkits

- **Format, language and runtime:** Rust Cargo workspace/application, Tokio async services, CLI and TUI; assessed with Rust 1.90.
- **Entry points:** `src/main.rs`, `src/service/strategy.rs`, `src/bot/copy_trading.rs`.
- **Inputs and outputs:** copied trade dollar notional, percentage/fixed/adaptive sizing configuration; resulting dollar allocation. Adapter converts allocation to whole contracts with floor, without forcing a minimum contract.
- **Providers and APIs:** Polymarket CLOB, Polygon websocket/RPC; copy-trade observation and wallet execution.
- **Environment/services:** `PM_PRIVATE_KEY`, `PM_FUNDER_ADDRESS`, CLOB authentication/optional credentials file and endpoints in config; Polygon and Polymarket services. Assessment uses `enable_trading: false`, `mock_trading: true` and an explicitly nonexistent credential path.
- **License:** complete MIT, copyright `(c) 2025 HarrierOnChain`; translated sizing retains the full notice.
- **Completeness and tooling clashes:** eight of ten advertised bot entries are logging stubs. Rust/Tokio/TUI cannot execute as a Workers module; even its mock CLI connects to Polygon websocket.
- **Reuse versus adapter:** translated pure sizing in `src/prediction-markets/strategies/copy-trade-sizing.ts`, adapter in `src/strategy-signals/sources/copy-trade-sizing.ts`.
- **Assessment:** dependency fetch succeeded; five original Rust sizing tests passed offline. Mock copy-trading CLI then retried DNS/network access until its 40-second bound, exit 124. Combined outcome `needs-network`; no live order path enabled.
- **Integration:** preserves percentage, fixed, multiplier and adaptive sizing plus min/max clamps. A copied $100 trade at 20% sizes $20, yielding 40 contracts at 50¢ in the demo. A sub-one-contract allocation emits no executable order; cash and position caps still apply. Stub strategies were not represented as operational ports.

## 7. ai-hedge-fund

- **Format, language and runtime:** Python/Poetry multi-agent framework and backtester, with a separate frontend; Python >=3.11.
- **Entry points:** `src/main.py`, `src/backtester.py`, `src/backtesting/cli.py`, `src/agents/technicals.py`.
- **Inputs and outputs:** OHLCV history, analyst/model selection and financial data; technical group scores and bullish/bearish/neutral recommendations.
- **Providers and APIs:** FinancialDatasets, hosted LLMs and optional Ollama; LangChain/LangGraph orchestration.
- **Environment/services:** `FINANCIAL_DATASETS_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`; corresponding hosted providers or Ollama.
- **License:** no matching backend notice/revision established in vendored files. Frontend MIT notice applies to the frontend only. Independent implementation of the observed numeric behavior.
- **Completeness and tooling clashes:** the backtester requires interactive model selection even with ticker/analyst/date flags. Python/pandas/model services cannot be imported into the Bun graph or Workers.
- **Reuse versus adapter:** `src/strategy-signals/sources/hedge-fund-technicals.ts` supplies a deterministic recommendation source.
- **Assessment:** dependencies installed; original Python helpers and all five signal groups ran on up/down/flat/short/oscillating fixtures. Backtester then exited 1 with EOF at interactive model selection (`bot-failure`). Numeric reference success does not establish a full backtest.
- **Integration:** pins RSI rolling means, pandas variance/EMA conventions, ADX/ATR, Bollinger and Hurst behavior, including the observed index-alignment quirk. Golden comparisons use the original Python outputs, tolerance 1e-7. Strict combined-score boundaries >0.2 and <-0.2 determine direction. Missing volume is refused. Fixture OpenBB bars produce stock BUY and SELL through the mock broker; no probability is fabricated.

## 8. debate-agents

- **Format, language and runtime:** flat Python analyst/debate application with model, memory and tool dependencies.
- **Entry points:** `main.py`, `graph.py`, `agents.py`, `red_flag_detector.py`.
- **Inputs and outputs:** financial metrics, ticker/sector and reports; red flags such as debt, cash-flow mismatch and weak interest coverage.
- **Providers and APIs:** Gemini, Finnhub, EODHD, FMP, Alpha Vantage, Tavily, LangSmith; optional persistent memory.
- **Environment/services:** `GOOGLE_API_KEY`, `FINNHUB_API_KEY`, `EODHD_API_KEY`, `TAVILY_API_KEY`, `LANGSMITH_API_KEY`, `LLM_PROVIDER`, `DEEP_MODEL`, `QUICK_MODEL`, `ONLINE_TOOLS`, `ENABLE_MEMORY`, `CHROMA_PERSIST_DIR` and selected provider configuration.
- **License:** no license evidence in the vendored folder. Independent rule implementation.
- **Completeness and tooling clashes:** some full-application imports expect absent `src.*` layout. Python/provider/memory services are unsuitable for direct Workers/Bun reuse.
- **Reuse versus adapter:** `src/strategy-signals/sources/red-flags.ts`, an advisory recommendation, not an execution source or gate veto.
- **Assessment:** native `RedFlagDetector.detect_red_flags` ran on a numeric fixture offline. This was not a full debate framework run.
- **Integration:** typed percent/dollar metrics, sector-specific debt/coverage thresholds and earnings/FCF mismatch. The report reaches research, risk and Fund Manager prompts. A flagged stock can still receive an approved BUY; red flags are advisory by design (decided 2026-10-05).

## 9. poly-bot-openclaw

- **Format, language and runtime:** Node ESM autonomous trading service with survival manager and event bus; assessed with Node 22.
- **Entry points:** `agent.js`, setup script, `core/survival/SurvivalManager.js`.
- **Inputs and outputs:** equity/balance relative to starting balance; SURVIVAL/GROWTH/DEFENSIVE/RECOVERY/CRITICAL state changes and events.
- **Providers and APIs:** Sidex, Hyperliquid, Binance, Bybit, Polymarket; x402 and hosted/local LLM services.
- **Environment/services:** `SURVIVAL_START_BALANCE`, `MARKET_SYMBOLS`, `AGENT_INTERVAL_MS`, `LLM_PROVIDER`, `OLLAMA_MODEL`, `LLM_MODEL` and selected venue credentials; venue services/Ollama as configured.
- **License:** ISC metadata only, missing notice. State implementation is independent.
- **Completeness and tooling clashes:** native test script is a placeholder that exits 1. Node service loops, filesystem and wallet integrations are not reused in the pure module.
- **Reuse versus adapter:** `src/strategy-signals/survival-posture.ts` maps independently implemented state transitions to `RiskPosture`.
- **Assessment:** original SurvivalManager/event-bus state simulation ran offline; no live trading service started.
- **Integration:** SURVIVAL initially, three-tick hysteresis, immediate CRITICAL, interrupted-pending reset and recovery transitions. New demo size policy: GROWTH/SURVIVAL 1.0, RECOVERY 0.75, DEFENSIVE 0.5, CRITICAL 0 with entries blocked; valid exits remain possible. Upstream does not define these multipliers. Defensive demo reduces a 10-contract request to five.

## 10. fin-data-api-python / OpenBB

- **Format, language and runtime:** Python data platform with app/provider packages and Pydantic standard models; assessed with Python 3.11 and openbb-core 1.6.0.
- **Entry points:** `app/provider/standard_models/equity_historical.py`, provider packages and their manifests.
- **Inputs and outputs:** provider historical rows with date/datetime and OHLC, nullable volume; normalized `StockData[]` and missing-volume metadata.
- **Providers and APIs:** FMP, Polygon, Alpha Vantage, Intrinio, Tiingo, Tradier, FRED, SEC and yfinance through individual providers.
- **Environment/services:** provider-specific API-key configuration and external data services; no credential is needed for model assessment or fixture mapping, and no new environment variable is added to this integration.
- **License:** no complete matching notice in the vendored copy; independent public-data-contract mapping, no copied code.
- **Completeness and tooling clashes:** root dependency manifest does not fully describe every provider package. Python/provider imports and live data access are unsuitable for direct Workers/Bun reuse.
- **Reuse versus adapter:** `src/strategy-signals/data/openbb-mapping.ts` and `fixture-data-provider.ts`; no Python service at runtime.
- **Assessment:** genuine `EquityHistoricalData` import/construction with null volume succeeded offline. No provider fetch or full platform startup was attempted.
- **Integration:** sort ascending, reject duplicate dates, normalize naive datetime as UTC, map null volume to zero with aggregate and per-bar missing flags. Volume-dependent sources refuse missing data. Mapped bars feed the technical stock BUY/SELL demo and actual mock broker fills.

## Monorepo setup and blockers

Use the harness from the repository root:

```bash
bash devdocs/third-party-integration/harness/run.sh install
bash devdocs/third-party-integration/harness/run.sh test
bash devdocs/third-party-integration/harness/run.sh test-root
bash devdocs/third-party-integration/harness/run.sh tsc
bash devdocs/third-party-integration/harness/run.sh build
bash devdocs/third-party-integration/harness/run.sh coverage
bash devdocs/third-party-integration/harness/run.sh demo
bash devdocs/third-party-integration/harness/run.sh pack
bash devdocs/third-party-integration/harness/run.sh dev
```

The image derives from `oven/bun:1.3.11` and adds real Node 22 and native build prerequisites. The base image alone stalled during native dependency scripts. The repository is staged without credentials, Git metadata or host node_modules. Named volumes hold container-only dependencies. Install/dev may access the network; tests, types, build, coverage, demo and assessment run stages use `--network=none`, UID 1000, dropped capabilities and no-new-privileges. This is process isolation, not a guarantee that hostile dependency installation is safe.

- **Package dev:** `investing` has no dev script, so the task's filtered dev command executes zero tasks.
- **Root dev:** started once. An HTTP 200 came from Financial Data API on port 3000; it did not establish a working web app. MCP tool registration failed on undefined `name.length` in the SDK, from `packages/mcp-server/src/index.js:62`. The browser opener also lacked `xdg-open`. Watchers kept the container running; it was deliberately stopped, exit 137. Local response, logs and container state distinguish probe success from workspace failures.
- **Types:** source check has 86 pre-existing diagnostics. Adding the full test/example scope exposes additional pre-existing identities, reproduced against untouched `b877b41`; that scope has 77 diagnostics. The gate compares file, TS code, message and occurrence counts, with compiler exit recorded separately. Both checks must introduce no new diagnostics.
- **Packaging:** build exits 0 despite declaration errors. Advertised JavaScript subpath files are missing, and the built root import fails with `e.inherits is not a function`. Tests/demo use source leaves, never `src/index.ts`, which also loads native code and dotenv. No app or built-package consumption is claimed.
- **Runtime:** pure new modules contain no Node APIs, but there is no Workers runtime test. Six credential-dependent debate cases and seven live price-history cases remain skipped.
- **Execution limits:** fixture/paper execution only, whole-cent orders, caller-owned sequential snapshots, no execution ledger, portfolio versioning or concurrency control. Registries and current snapshots must be supplied for executable third-party proposals. Weighted average holding cost can be fractional even when individual fills use integer cents.

Final test/coverage results and the initial baseline are recorded in [findings 04](third-party-integration/findings/04-test-and-runtime-baseline.md). Raw logs, image digests, assessment commands and PR draft remain local under `third-party-integration/local/`.

## How to add another bot

Follow [integrate-trading-bot](third-party-integration/skills/integrate-trading-bot/SKILL.md). Survey the folder and notice, assess its real safe entrypoint in Docker, implement only the selected pure core, and adapt to `StrategySource` or a venue/data mapping. Register the source for risk checks, pass actual account state and evaluation time, and preserve price precision and the P(YES) convention. Forecast guards belong only to sources with a genuine forecast. Add reviewed goldens, threshold/invalid-input cases and a filled or explicitly report-only consumer. Update this overview and shipped notices, then run the offline Docker gates. Live clients, ledger/concurrency work and published export repairs need their own design.
