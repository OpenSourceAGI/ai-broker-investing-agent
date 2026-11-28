# Assessment Submission: Prediction-Markets & Third-Party Trading Bots Integration

## 1. Local Monorepo Setup & Verification

### Package Manager & Workspace Structure
- **Package Manager:** `bun@1.3.11` (pinned via `packageManager` in root `package.json`; Turborepo `^2.5.8` for workspace orchestration).
- **Workspaces:** `apps/ai-broker-web` (Next.js / Vinext web app & API routes) and `packages/*` (`packages/investing`, `packages/mcp-server`, etc.).
- **Install & Offline Verification:**
  - `bun install` resolves workspace dependencies.
  - `packages/investing` provides pure TypeScript strategy-signal modules, venue mappings, paper execution, and replay engines.
  - `apps/ai-broker-web` consumes `@/packages/investing/...` directly from TypeScript source leaves in API routes and tests.

### Test Verification Results
- **Targeted Route Tests (`apps/ai-broker-web/app/api/backtest-technical/__tests__/route.test.ts`):**
  - **17 / 17 passed** (`cd apps/ai-broker-web && bun run test app/api/backtest-technical/__tests__/route.test.ts`), covering strategy ID mapping, walk-forward `hedge-fund-technicals` replay, request validation, fee/slippage cost deduction, `positionSizePercent` capital limits, offline `demoMode`, Yahoo Finance fallback to deterministic fixture bars, and explicit `skipped` reasons for non-equity/advisory third-party bots.
- **Workspace Test Suites:**
  - `apps/ai-broker-web`: `cd apps/ai-broker-web && bun run test` → **72 / 72 test files passed, 887 / 887 tests passed** (Vitest).
  - `packages/investing`: `cd packages/investing && bun run test` → **66 test files passed, 1 skipped (67 total); 997 tests passed, 13 skipped (1010 total)** (the 13 skipped are credential-dependent debate/live-price tests).

### Known Environment & Runtime Blockers
1. **React 19 & LangChain Peer Dependencies:** `bun install` emits peer dependency warnings for React 19 and `@langchain/*` packages across workspaces.
2. **Native Build Prerequisites (`onnxruntime-node` / CUDA 11):** Bare `oven/bun:1.3.11` containers lack Python, `make`, `g++`, and real Node, causing native install scripts (such as `onnxruntime-node` CUDA 11 checks) to stall unless Node 22 + build-essential are present.
3. **Windows-Only Python Dependency (`pywin32==311`):** `third-party-trading-bots/Polymarket-BTC-15-Minute-Trading-Bot` specifies `pywin32==311` and `nautilus_trader`, blocking native installation and `--test-mode` execution on Linux (`unsupported-runtime`).
4. **Missing Generated SDK Artifact (`pmxt_internal`):** `third-party-trading-bots/polymarket-exec-api` (Python `pmxt` 2.17.1) lacks the generated `pmxt_internal` module, failing native import with `ModuleNotFoundError`.
5. **Pre-existing `tsc` & Packaging Gaps in `packages/investing`:** `tsc --noEmit` exits 2 with pre-existing diagnostics (86 in source, 77 in test/example scope); `vite build` exits 0 but advertised subpath JS targets are missing and `import("investing")` fails with `e.inherits is not a function`, so tests and `ai-broker-web` import directly from source leaves.
6. **Runtime & Credential Isolation:** `packages/investing/src/strategy-signals/` is pure TypeScript with no Node-only APIs, but no Cloudflare Workers runtime test has been executed; all integrated demos and backtests run strictly offline/paper with no live broker, wallet, or LLM credentials required.

---

## 2. Inventory of `third-party-trading-bots/` (All 10 Folders)

All 10 vendored folders were assessed natively (where runnable) and integrated into `packages/investing/src/strategy-signals/` via pure TypeScript ports, independent reimplementations, or venue/data mappings—never by importing or spawning the upstream Python/Rust/Node processes at runtime.

| # | Folder | Format / Runtime | Entry Points | Inputs / Outputs | Providers / APIs / Credentials | Outdated / Incomplete Components | Reuse vs Adapter | Connection to `packages/investing/src/strategy-signals/` |
|---|---|---|---|---|---|---|---|---|
| 1 | `kalshi-bot-api` | Python >=3.9 SDK (`pykalshi` 0.3.6) | `pykalshi.KalshiClient`, `pykalshi/models.py`, `examples/momentum_bot.py` | REST/WS market models, `yes_bid`/`yes_ask`/`no_bid`/`no_ask` (cents & 2026 `*_dollars` strings) → directional BUY/SELL | Kalshi REST/WS (`KALSHI_API_KEY_ID`, `KALSHI_PRIVATE_KEY_PATH`) | SDK only, not an autonomous portfolio manager; Python auth/net incompatible with Bun/Workers | **Port + Venue Adapter** | `sources/kalshi-momentum.ts`, `sources/spread-aware-momentum.ts`, `venues/kalshi-venue-mapping.ts` |
| 2 | `Kalshi-Vibe-Bot` | Python FastAPI + SQLite + frontend | `backend/run.py`, `backend/src/bot/loop.py`, `backend/src/decision_engine/` | Market quotes, LLM forecasts → edge/calibration-filtered decisions & Kelly sizing | Kalshi REST, Gemini, xAI (`KALSHI_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`) | Paper mode still needs live market feeds; FastAPI/SQLite/scheduler excluded | **Port** (decision & guard math) | `sources/kalshi-vibe.ts`, `sources/kalshi-vibe-guards.ts` |
| 3 | `polymarket-exec-api` | TypeScript/Node >=18 monorepo + Python SDK (`pmxt` 2.17.1) | `core/src/types.ts`, `pmxt.Polymarket`, `pmxt.Kalshi` | Arbitrary outcome IDs/labels, point prices, decimal ticks → normalized binary market contracts | Polymarket, Kalshi (`POLYMARKET_PRIVATE_KEY`, `POLYMARKET_PROXY_ADDRESS`, `KALSHI_API_KEY`) | Missing generated `pmxt_internal` in Python dist; Node sidecar unsuitable for Workers | **Adapter** (MIT contract mapping) | `venues/pmxt-venue-mapping.ts` (explicit `{ priceAsQuote: true }` only for synthetic demos) |
| 4 | `poly-bot-gabagool` | TypeScript/Node >=18 (`ts-node`) | `src/index.ts`, `src/order-builder/copytrade.ts`, `src/config/index.ts` | YES/NO quotes, current holdings & avg cost → sequential paired-hedge orders (<=98¢ combined) | Polymarket CLOB/Gamma, Polygon RPC (`PRIVATE_KEY`, `RPC_URL`, `CLOB_API_URL`) | No credential-free demo mode; live startup creates allowances & uses Node timers | **Independent** | `prediction-markets/strategies/gabagool.ts`, `sources/gabagool.ts` |
| 5 | `Polymarket-BTC-15-Minute-Trading-Bot` | Python + NautilusTrader + Redis | `bot.py`, `15m_bot_runner.py`, `core/strategy_brain/fusion_engine/signal_fusion.py`, `execution/risk_engine.py` | Timestamped processor signals (direction, confidence, strength) → fused score & orders | Polymarket, Coinbase, Binance, Redis (`POLYMARKET_PK`, `POLYMARKET_API_KEY`, `REDIS_HOST`) | README references missing `run_bot.py`; Windows-only `pywin32==311`; missing `nautilus_trader` | **Independent** | `prediction-markets/strategies/btc15m-fusion.ts`, `sources/btc15m-fusion.ts` |
| 6 | `Prediction-Markets-Trading-Bot-Toolkits` | Rust Cargo (Tokio async CLI/TUI) | `src/main.rs`, `src/service/strategy.rs`, `src/bot/copy_trading.rs` | Copied trade notional + sizing mode (pct/fixed/multiplier/adaptive) → dollar/contract allocation | Polymarket CLOB, Polygon WS/RPC (`PM_PRIVATE_KEY`, `PM_FUNDER_ADDRESS`) | 8 of 10 advertised bots are logging stubs; mock CLI still dials Polygon WS | **Port** (MIT sizing core) | `prediction-markets/strategies/copy-trade-sizing.ts`, `sources/copy-trade-sizing.ts` |
| 7 | `ai-hedge-fund` | Python >=3.11 / Poetry + LangGraph | `src/main.py`, `src/backtester.py`, `src/agents/technicals.py` | Daily OHLCV bars → 5-group technical scores & bullish/bearish/neutral signals | FinancialDatasets, OpenAI/Groq/Anthropic/Ollama (`FINANCIAL_DATASETS_API_KEY`, LLM keys) | Backtester blocks on interactive model selection (EOF failure in non-interactive runs) | **Independent** (pinned to Python goldens within `1e-7`) | `sources/hedge-fund-technicals.ts` (equity `daily-bars` walk-forward replay) |
| 8 | `debate-agents` | Python analyst/debate graph | `main.py`, `graph.py`, `agents.py`, `red_flag_detector.py` | Financial metrics, sector, ticker → debt/coverage/FCF red-flag advisories | Gemini, Finnhub, EODHD, FMP, Alpha Vantage, Tavily (`GOOGLE_API_KEY`, `FINNHUB_API_KEY`, etc.) | Some full-app imports expect absent `src.*` layout; external memory/tool dependencies | **Independent** (advisory only) | `sources/red-flags.ts` (advisory report for debate prompts; never vetoes execution) |
| 9 | `poly-bot-openclaw` | Node 22 ESM autonomous agent | `agent.js`, `core/survival/SurvivalManager.js` | Equity vs starting balance → `SURVIVAL`/`GROWTH`/`DEFENSIVE`/`RECOVERY`/`CRITICAL` posture | Sidex, Hyperliquid, Binance, Bybit, Polymarket, Ollama (`SURVIVAL_START_BALANCE`, `LLM_PROVIDER`) | Native `npm test` is a failing placeholder (`exit 1`); upstream defines no size multipliers | **Independent** (posture + new sizing policy) | `strategy-signals/survival-posture.ts` (maps state to `RiskPosture` multipliers) |
| 10 | `fin-data-api-python` | Python 3.11 / OpenBB (`openbb-core` 1.6.0) | `app/provider/standard_models/equity_historical.py` | Provider OHLCV rows (nullable volume) → sorted, UTC-normalized `StockData[]` | FMP, Polygon, Alpha Vantage, yfinance, etc. (provider API keys) | Root manifest omits per-provider deps; Python runtime unsuitable for Bun/Workers | **Adapter** (data contract mapping) | `strategy-signals/data/openbb-mapping.ts`, `strategy-signals/data/fixture-data-provider.ts` |

---

## 3. Architecture of Per-Stock Backtesting & Agent Pipeline

### Unified Strategy Selector & Transparency
- **`GET /api/strategies`** (`apps/ai-broker-web/app/api/strategies/route.ts`) returns:
  - **26 built-in `indicatorts` equity strategies** (`backtestable: true`)
  - **8 registered third-party sources** from `registeredSources` (`packages/investing/src/strategy-signals/registry.ts`) with full provenance (`upstreamRepo`, `license`, `fidelity`, `venue`, `backtest`) and `unsupportedReason` when `backtest !== 'daily-bars'`
  - **TradingView Pine scripts** (`backtestable: false`, offline conversion only)
- **Unified Selector UI** (`apps/ai-broker-web/components/investing/tabs/strategies-tab.tsx`):
  - Renders built-in equity strategies and third-party bots in a single grid with `Available`, `Unsupported (<venue>)`, or `Advisory Only` badges.
  - Includes a **"Backtest All Strategies"** action that submits all unified IDs to `POST /api/backtest-technical` so equity strategies execute and non-equity/advisory bots return explicit `skipped` explanations.

### Backtest Engine Parity & Offline Demo Mode
- **Request Validation (`apps/ai-broker-web/lib/backtest-request.ts`):** Pure, I/O-free `validateBacktestRequest` validates `symbol`, `startDate < endDate`, `initialCapital`, `strategyIds`, `feeBps` (`0–1000`), `slippageBps` (`0–1000`), `positionSizePercent` (`1–100`), and `demoMode` (`boolean`), returning structured `400` errors before any market data fetch.
- **Execution & Cost Parity (`apps/ai-broker-web/app/api/backtest-technical/route.ts`):**
  - `calculateMetrics` applies `slippageBps` to execution prices (`price * (1 ± slippageRate)`), `feeBps` to trade notional, and `positionSizePercent` to cap deployable cash per entry (`Math.min(cash, initialCapital * sizeRatio)`).
  - Computes `finalValue`, `totalReturn`, `totalReturnPercent`, `winRate`, `sharpeRatio`, `maxDrawdown`, and `computeForecasterTrustScore` (`TRUST_MIN_TRADES = 25`).
  - Walk-forward replay (`replayDailyActions`) runs `hedge-fund-technicals` over daily bars with a 127-bar warmup and 252-bar trailing window.
- **Deterministic Fixture-Backed Demo Mode & Fallback:**
  - When `demoMode: true`, `generateDeterministicBars(symbol, startDate, endDate)` synthesizes reproducible weekday OHLCV bars seeded by `symbol` without calling `yahooFinance.getHistorical`.
  - When `demoMode: false` and `yahooFinance.getHistorical` rejects or returns empty/`{ success: false }`, the route gracefully falls back to `generateDeterministicBars` instead of failing with `500`.

### Separation from Live Order Execution
- Backtesting (`POST /api/backtest-technical` and `validateBacktestRequest`) is strictly read-only and stateless: it never touches broker credentials, Alpaca/Polymarket/Kalshi clients, or order-submission endpoints.
- Event-contract execution in `packages/investing` uses `MockVenue` and `InMemoryPaperExecutor` with explicit whole-cent integer pricing, caller-owned `AccountSnapshot`s, and opt-in `RiskLimits` (`takerFeeBps`, `maxKellyFraction`, `minNetEdgeCents`, `maxQuoteAgeMs`).

### Normalized Agent Pipeline Outputs
All third-party sources in `packages/investing/src/strategy-signals/types.ts` emit a uniform contract before reaching risk checks or execution:
- **`NormalizedSignal`:** `{ sourceId, upstream, kind ('signal' | 'recommendation' | 'order' | 'portfolio'), instrument (equity | event), action, confidence, reasoning, asOf, probability? (strictly P(YES)), order?, targets?, sizing?, evidence? }`
- **`TradeProposal`:** `{ proposalId, sourceId, instrument, action, outcome?, limitPriceCents?, quantity, asOf }`
- **`ExecutionApproval`:** `{ proposal, finalQuantity, verdict (RiskVerdict), judge (JudgeDecision: PROCEED | BLOCK | REDUCE), fundManager (FundManagerApproval: APPROVE | REJECT | MODIFY), reasons }`

---

## 4. Novel Indicator: Adaptive Efficiency & Volatility-Normalized Conviction Index (AEVCI)

Implemented in `packages/investing/src/stocks/strategies/adaptive-efficiency-conviction.ts` and wired into `apps/ai-broker-web/lib/technical-strategies.ts` and `apps/ai-broker-web/lib/custom-backtest-strategies.ts` (`adaptive-efficiency-conviction`):

- **Motivation:** Standard oscillators (MACD, RSI, fixed EMA crossovers) whipsaw in sideways markets because they ignore path efficiency and volatility regimes.
- **Formulation (Strictly Causal, Zero Look-Ahead):**
  1. **Directional Efficiency Ratio ($ER_t \in [0, 1]$):** $|C_t - C_{t-N}| / \sum_{i=t-N+1}^{t} |C_i - C_{i-1}|$ measures trend cleanliness vs. noise.
  2. **Volatility-Normalized Drift ($Z_t$):** $(C_t - \text{EMA}_N(C_t)) / \text{ATR}_N(t)$ normalizes price impulse by current volatility.
  3. **Regime-Adaptive Smoothing ($S_t$):** Smooths $ER_t \cdot Z_t$ with $\alpha_t = \alpha_{\text{fast}} ER_t + \alpha_{\text{slow}}(1 - ER_t)$ so the signal responds rapidly in clean trends and dampens noise in chop.
  4. **Execution Rules:** Enters long when $S_t$ crosses above $+0.35$ with $ER_t \ge 0.30$; exits on momentum reversal ($S_t < -0.10$) or a $2.5\times\text{ATR}$ trailing stop.
- **Verification:** Covered by `packages/investing/test/adaptive-efficiency-conviction.test.ts` (causality/zero look-ahead, chop rejection, trend entry, ATR trailing stop exit, and invalid bar handling) and integrated into `/api/strategies` and `/api/backtest-technical`.
