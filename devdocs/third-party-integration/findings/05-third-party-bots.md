# Findings: the 10 vendored folders in `third-party-trading-bots/`

Paths below are relative to `third-party-trading-bots/`, at upstream commit `b877b41`. This document records what we learned by reading the folders. Results of running each folder in its own demo mode are added after the Docker assessment runs (plan, Phase B). The full per-folder inventory the task asks for is `devdocs/third-party-trading-bots-overview.md`, written in plan Phase C.

## The folders are not 10 alike bots

The repository's own `README.md` in this folder calls them "vendored reference implementations … read as prior art". `.claude/CLAUDE.md` (rule 5) forbids editing or importing them. They are 5 different kinds of project:

| Kind | Folders | What "integrated" means |
|---|---|---|
| Strategy bots | `Kalshi-Vibe-Bot`, `Polymarket-BTC-15-Minute-Trading-Bot`, `poly-bot-gabagool`, `Prediction-Markets-Trading-Bot-Toolkits`, `poly-bot-openclaw` | The decision logic is ported to a pure TypeScript source of signals |
| Agent frameworks | `ai-hedge-fund`, `debate-agents` | One deterministic analyst or scoring piece is ported |
| Venue SDKs | `kalshi-bot-api` (PyKalshi), `polymarket-exec-api` (pmxt) | Their market model is mapped into a venue interface with a mock |
| Data layer | `fin-data-api-python` (OpenBB) | Its historical-price model is mapped into a data-provider interface with a mock |

`kalshi-bot-api` also holds `examples/momentum_bot.py`, which an earlier change (PR #199) ported to `packages/investing/src/prediction-markets/strategies/kalshi-momentum.ts`. That port runs on its own and is not connected to the agent graph.

## License evidence

A ported (translated) file must carry its upstream notice. A folder without a complete notice gets an independent implementation or an interface only.

| Folder | Evidence found | Consequence |
|---|---|---|
| `kalshi-bot-api`, `Kalshi-Vibe-Bot`, `Prediction-Markets-Trading-Bot-Toolkits`, `polymarket-exec-api` | `LICENSE` file (MIT) in the folder | Translation allowed; the notice must ship |
| `ai-hedge-fund` | No license file in the vendored copy. The upstream repository `virattt/ai-hedge-fund` is MIT. `app/frontend/LICENSE` is MIT (webkid GmbH) and covers only the frontend. | Record which upstream revision matches the vendored copy before translating |
| `Polymarket-BTC-15-Minute-Trading-Bot` | No license file; an MIT badge in `README.md`; the clone URL is a placeholder (`github.com/yourusername/...`) | The notice text and copyright holder are missing; resolve them first or implement independently |
| `poly-bot-gabagool`, `poly-bot-openclaw` | `"license": "ISC"` in `package.json`; no license text | ISC also requires the copyright notice; resolve the holder first or implement independently |
| `debate-agents` | No license information anywhere | Independent implementation only |
| `fin-data-api-python` | No license file in the vendored copy; GitHub reports `NOASSERTION` for `OpenBB-finance/OpenBB` | Interface modeled on its public data contract; no code copied |

## Incomplete or misleading parts

- **`Prediction-Markets-Trading-Bot-Toolkits` advertises 10 strategies, but 8 are stubs.** `arbitrage.rs` (14 lines), `cross_market_arb.rs` (14), `market_maker.rs` (12), `orderbook_imbalance.rs` (12), `resolution_sniper.rs` (13), `sports_execution.rs` (13), `spread_farming.rs` (12) and `whale_signal.rs` (16) in `src/bot/` only log "🚧 … in development". Real logic exists in `src/bot/copy_trading.rs` (184 lines) and `src/bot/directional_arb.rs` (69). There is also the copy-trade sizing in `src/service/strategy.rs` (`size_for_trade` at `:26`, with its own unit tests at `:120-150`). `src/bot/mod.rs` is the module index.
- **`Polymarket-BTC-15-Minute-Trading-Bot`'s fusion step depends on the wall clock.** `core/strategy_brain/fusion_engine/signal_fusion.py:81-85` keeps only signals from the last 5 minutes of `datetime.now()`. A deterministic port must take the evaluation time as input instead, and this change must be documented.

## Semantics a faithful port must keep

These details change trade decisions. A port that drops one of them looks correct on a happy-path test but behaves differently.

### `Kalshi-Vibe-Bot`

- **Buy minimums:** edge ≥ 5 points and buy-side AI probability ≥ 60 % (`backend/src/config.py:14-15`). They are applied through `effective_min_edge_for_market` and `effective_buy_gate_thresholds` (`backend/src/bot/loop.py:1596-1663`).
- **Buy ceilings:** edge ≤ 22 points, buy-side AI probability ≤ 90 %, entry ≥ 26¢. A calibration block applies when AI ≥ 75 % on a 41–65¢ entry (`backend/src/decision_engine/strategy_gates.py:11-25,83-115`).
- **Sizing is full Kelly, computed from the forecast** (`full_kelly_fraction_for_side`, `backend/src/decision_engine/analyzer.py:83-100`). It is then capped at 5 % of deployable cash, with a fallback for small accounts (`strategy_gates.py:63-80`). The 5 % ceiling alone is not the Kelly calculation.
- **NO-side checks** use the complement of the model's P(YES).

### `Polymarket-BTC-15-Minute-Trading-Bot`

- **Risk engine limits:** $1 per position, $10 total exposure, at most 5 positions (`execution/risk_engine.py:69-75`). There are also drawdown and daily-loss limits.
- **Fusion rules:** a tie between bullish and bearish weight resolves to **bullish** (`signal_fusion.py:129`). A fused signal is actionable at score ≥ 60 and confidence ≥ 0.6 (`:41-42`).

### `poly-bot-gabagool`

- **The hedge is built one leg at a time, from actual fills.** The price limit for the next leg is `maxSumAvg − (actual average cost of the other side)` (`src/order-builder/copytrade.ts:1057-1063`). Success is judged from the real buy count after the order (`:1309-1338`). The pair is **never** filled atomically, and a port must not promise that.
- **Thresholds are sub-cent:** the default entry threshold is 0.499 dollars (`src/config/index.ts:78`).

### `poly-bot-openclaw`

The Survival Manager (`core/survival/SurvivalManager.js`) works as follows:
- It starts in `SURVIVAL`, with a 3-tick hysteresis before a state change (`:44-50`).
- `CRITICAL` bypasses the hysteresis and applies immediately (`:86-91`).
- Recovery has special transitions: `DEFENSIVE` → `RECOVERY` above a 0.70 health ratio, and the state stays in `RECOVERY` until the ratio reaches 1.0 (`:74-81`).
- Upstream does not define size multipliers per state. The integration's demo table (1.0 / 1.0 / 0.75 / 0.5 / 0) is a new policy, and it must be documented as new.

### `ai-hedge-fund`

- **The technicals agent depends on helper functions.** It combines 5 signal groups (`src/agents/technicals.py:160-372`), through `calculate_rsi`, `calculate_bollinger_bands`, `calculate_ema`, `calculate_adx`, `calculate_atr` and `calculate_hurst_exponent` (`:420-523`).
- **Numeric conventions:** RSI uses rolling means (`:424-425`). The pandas standard-deviation and EMA settings change results, so the port must copy them exactly.
- **Test values:** the golden expectations must come from running the upstream functions, not from the new port.

### Venue and data models

- **PyKalshi:** `Market` has separate, nullable `yes_bid`, `yes_ask`, `no_bid` and `no_ask` in integer cents (`kalshi-bot-api/pykalshi/models.py:33-38`). A single YES price loses the NO quote and the bid/ask difference.
- **pmxt:**
  - outcomes carry an `outcomeId`, a free `label` and a `price` (`polymarket-exec-api/core/src/types.ts:6-12`);
  - markets can have more than 2 outcomes;
  - a `tickSize` can be smaller than a cent (for example 0.001).
- **OpenBB:** the standard equity-historical model allows `volume` to be `null` (`fin-data-api-python/app/provider/standard_models/equity_historical.py:45-47`), while the package's `StockData.volume` is a required number.

## Consequences for the integration design

1. **Precision.** Strategy decisions keep the upstream price precision. Only the step that creates an executable paper order requires whole cents, and it rejects a sub-cent price with its original value instead of rounding it.
2. **Sources declare their own guards.** Forecast checks (edge, probability, calibration, forecast-based Kelly) apply only where a real forecast exists. Common checks (current cash, position caps, posture) apply to every source.
3. **Portfolio targets execute one leg at a time,** each from actual holdings. An incomplete hedge is reported as incomplete.
4. **Mappings keep both quote sides and the outcome identity,** and reject market shapes they cannot represent (for example non-binary markets).

## Actual Docker assessments and delivered consumers

| Folder | Native outcome and evidence | Source-level consumer |
|---|---|---|
| kalshi-bot-api | `ran`: Python public MarketModel import/construction; install/run 0 | Momentum BUY/SELL and four-quote venue mapping |
| Kalshi-Vibe-Bot | `ran`: synthetic closed-trade filter simulation and 11 original tests; install/run 0 | YES/NO forecast source, Kelly and guards |
| polymarket-exec-api | `unsupported-runtime`: install 0, import 1, missing generated `pmxt_internal` | MIT market-contract adapter; explicitly synthetic fixture quote fill |
| poly-bot-gabagool | `no-demo-mode`: install and safe config import succeeded; intentional run exit 1, live allowance path excluded | Independent ordered targets and sequential actual-fill feedback |
| Polymarket-BTC-15-Minute-Trading-Bot | `unsupported-runtime`: install 1, `pywin32==311` unavailable on Linux; test-mode exit 1 missing NautilusTrader | Independent strict-window fusion and source risk caps |
| Prediction-Markets-Trading-Bot-Toolkits | `needs-network`: install 0; five original Rust tests passed, mock CLI then DNS retries and timeout 124 | Translated pure sizing and whole-contract copy source |
| ai-hedge-fund | `bot-failure`: install 0; original numeric reference outputs succeeded, backtester exit 1 at interactive model selection | Independent five-group technicals pinned to those references |
| debate-agents | `ran`: original detector numeric fixture; install/run 0 | Independent advisory report, not original AUTO_REJECT behavior |
| poly-bot-openclaw | `ran`: original SurvivalManager state simulation; install/run 0 | Independent state transitions; new approved multiplier policy |
| fin-data-api-python | `ran`: original EquityHistoricalData import with null volume; install/run 0 | Independent public-row mapping, fixture data provider, stock fills |

Per-folder commands, digests, logs and cleanup status are local in `../local/bot-runs/<id>/run.md`. The [required overview](../../third-party-trading-bots-overview.md) contains every inventory field requested by task Step 2 and distinguishes assessment success, operational port and mock-only execution.

All ten contributions are connected from source. Missing license notices led to independent implementations for Gabagool, BTC, technicals, red flags, survival and OpenBB. Complete MIT notices for PyKalshi, Vibe, pmxt and Rust sizing are shipped in the package. No vendored file changed. Numeric/decision behavior is reviewed in source-specific goldens with provenance; a blocked full native bot is never described as a successful native demo.
