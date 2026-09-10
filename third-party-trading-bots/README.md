# Third Party Trading Bots

Vendored reference implementations of open-source trading bots, market-data
services, and exchange clients. Nothing here is wired into the app's build or
deploy — `turbo` does not fan out into this directory. These are read as
prior art: how other people size positions, batch LLM calls, model prediction
markets, and normalize venue APIs, so that the agents in `packages/investing`
and `packages/predictos` do not have to rediscover it.

Each subdirectory keeps its own upstream license and README.

---

### [Kalshi-Vibe-Bot](Kalshi-Vibe-Bot)

An autonomous Kalshi bot for binary markets, built as a FastAPI/SQLite backend
with a Vite + React + Tailwind dashboard on top. Its flow is worth studying
because it puts a cheap local filter in front of an expensive model: markets
are pulled inside a contractual close window, vetted locally on volume, spread,
depth, time-to-event, and skew, then grouped by `event_ticker` and *partitioned*
so unrelated props never share one LLM call — line ladders, home/away/tie
outcome codes, and exclusive temperature bins each become their own batch, with
ladders shortlisted to their three most liquid legs before Gemini or Grok sees
them. The model returns P(YES) and a direction; the server derives implied
probability from the executable ask, computes edge in percentage points, and
sizes with full Kelly rounded down to whole contracts, capped by deployable cash
and 5% of it per entry. Guardrails in `strategy_gates.py` reject the tails the
model is worst at (max 22 points of edge, max 90% confidence, minimum 26¢
entry, a calibration block on mid-priced high-confidence picks), and exits are
stop-loss only — drawdown of open cash basis against displayed estimated value
after a grace period. The Play/Pause/Stop mode resets to Stop on restart, which
is the right default for anything that can spend money unattended.

### [Polymarket-BTC-15-Minute-Trading-Bot](Polymarket-BTC-15-Minute-Trading-Bot)

A Python bot for Polymarket's 15-minute BTC up/down markets, structured as a
seven-phase pipeline on top of [NautilusTrader](https://nautilustrader.io):
ingestion unifies and validates external feeds (Coinbase, Binance, news, Solana),
three independent signal processors run over them (spike detection, sentiment,
price divergence between the spot feeds and the market's implied odds), and a
fusion engine combines their votes by weight before anything reaches risk
management. Risk is deliberately blunt — $1 maximum per trade, 30% stop loss,
20% take profit — on the theory that a 15-minute market gives you no time to
manage a bad position out. The two pieces most worth borrowing are the feedback
loop, which re-weights the signal processors from their realized hit rate
instead of leaving the weights as authored constants, and the operational
surface: Redis for live control, Prometheus metrics into Grafana dashboards,
WebSocket auto-reconnection, and a simulation/live toggle that flips without a
restart so paper and real trading run identical code paths.

### [Prediction-Markets-Trading-Bot-Toolkits](Prediction-Markets-Trading-Bot-Toolkits)

A Rust (Tokio) execution engine that treats venues as adapters rather than as
bots. Ten strategies — copy trading, short-window BTC arbitrage, cross-market
arbitrage between Polymarket and Kalshi, directional arbitrage, spread farming,
sub-50ms sports execution, resolution sniping on 95¢ near-certainties, orderbook
imbalance, two-sided market making with inventory skew, and an on-chain whale
signal that decodes Polygon calldata to front-run the public positions API by
3–30 seconds — all share one execution core, one risk layer, and one adapter
stack, so a new venue costs one adapter instead of a new bot. Seven venues run
in production (Polymarket, Kalshi, Limitless, Drift BET, Augur, Azuro, Myriad).
It is the clearest argument in this directory for the shape `packages/predictos`
is going after: the venue-agnostic order-book abstraction is the reusable asset,
and the strategies are configuration on top of it. The published latency budget
(<1ms per event, <100ms order round trip, ~50MB baseline, semaphore rate
limiting at 25 requests per 10 seconds) is a useful yardstick for what a serious
execution path costs.

### [ai-hedge-fund](ai-hedge-fund)

virattt's proof-of-concept multi-agent fund, and the closest external analogue
to this repo's own agent layer. It runs eighteen agents: twelve modeled on named
investors (Damodaran, Graham, Ackman, Wood, Munger, Burry, Pabrai, Lynch,
Fisher, Jhunjhunwala, Druckenmiller, Buffett), four analytical agents
(valuation, sentiment, fundamentals, technicals), a risk manager that sets
position limits, and a portfolio manager that makes the final call. The design
choice worth stealing is that the persona agents are *not* interchangeable
prompts — each carries a distinct scoring rubric, so disagreement between them
is informative rather than noise, and the portfolio manager is arbitrating real
differences in method. It ships both a CLI and a full-stack web app, and it
never places a trade: it stops at generating orders, which keeps the research
question ("do these agents produce good signals?") separate from the execution
question. Educational use only, per its own disclaimer.

### [debate-agents](debate-agents)

A LangGraph implementation of the TradingAgents "bull vs. bear" pattern — the
direct ancestor of the debate engine described in the root README. Agents are
built by factory functions (`create_analyst_node`, `create_researcher_node`,
`create_research_manager_node`, `create_trader_node`, `create_risk_debater_node`,
`create_portfolio_manager_node`) over a shared `AgentState`, with separate
`InvestDebateState` and `RiskDebateState` reducers so the two debates accumulate
independently. It runs a two-tier model split — a deep-thinking model for
research and judgment, a fast one for tool calls and routing — behind a rate
limiter, and its toolkit wraps yfinance, technical indicators, financial
metrics, news, macro news, StockTwits, and multilingual sentiment search into
per-role tool sets so an analyst only sees the tools its role justifies. Two
details show what production use taught it: ticker-specific memory isolation,
added because a shared vector memory let one ticker's conclusions contaminate
another's, and a red-flag detector plus financial-health validator node that can
veto a thesis before the debate spends tokens defending it. Token accounting is
threaded through as a LangChain callback rather than bolted on afterward.

### [fin-data-api-python](fin-data-api-python)

The OpenBB Platform core — a FastAPI REST layer, a command runner, and a
provider interface — vendored together with roughly thirty-five data provider
extensions: Alpha Vantage, Benzinga, BLS, CBOE, CFTC, Congress.gov, Deribit,
ECB, EconDB, EIA, Fama-French, the Federal Reserve, FINRA, Finviz, FMP, FRED,
IMF, Intrinio, Nasdaq, OECD, Polygon, SEC, Seeking Alpha, Stockgrid, Tiingo,
TMX, Tradier, Trading Economics, WSJ, yfinance, and more. Its value here is
structural rather than strategic: every provider implements the same fetcher
contract with Pydantic models, so "equity historical" or "company news" is one
standardized query regardless of who answers it, and swapping a vendor is a
configuration change rather than a rewrite. The test suites record real HTTP
exchanges as VCR cassettes, which is how a data layer with thirty-five upstreams
stays testable without thirty-five API keys in CI. `packages/fin-data-api`
follows the same provider-abstraction idea on a much smaller surface.

### [kalshi-bot-api](kalshi-bot-api)

[PyKalshi](https://pypi.org/project/pykalshi/), a Python client for Kalshi, and
the reference for what a well-made exchange SDK looks like. It exposes domain
objects rather than endpoints — `Market`, `Order`, and `Event` carry their own
methods, so you write `order.cancel()` and `market.get_orderbook()` instead of
assembling request paths — and `order.wait_until_terminal()` blocks until a fill
or cancel, which removes the polling loop every bot otherwise writes by hand. It
ships typed WebSocket streaming for orderbook, ticker, and trade channels, an
`OrderbookManager` that reconstructs local book state from deltas, exponential
backoff on rate limits and transient errors, Pydantic models and typed
exceptions throughout, `.to_dataframe()` on any result list, and rich HTML
rendering in Jupyter. That last pair matters more than it sounds: the fastest
path from "idea" to "backtest" is a client whose results are already a DataFrame.

### [poly-bot-gabagool](poly-bot-gabagool)

A TypeScript bot for Polymarket's 15-minute binary markets implementing the
"Gabagool" hedged-arbitrage strategy: buy both YES and NO below a computed
threshold so the pair costs less than the $1 the winning side redeems for, and
the profit comes from the spread rather than from being right about direction.
Entry is flexible but hedging is strictly alternating, with thresholds
recalculated from previous fills so each leg's target price depends on what the
other leg actually cost — and a SumAvg guard, position limits, and drawdown
protection that stop it from accumulating an unbalanced book. It runs multiple
markets concurrently (BTC, ETH, SOL), persists state across restarts, and
automatically redeems winners once markets resolve. Built on
`@polymarket/clob-client` and the Gamma API with ethers v6 on Polygon, using
fire-and-forget orders, adaptive polling, and debounced state saves — the
practical answer to a strategy whose edge is measured in fractions of a cent and
therefore cannot afford a slow order path.

### [poly-bot-openclaw](poly-bot-openclaw)

The OpenClaw Sidex Kit, an autonomous agent framework aimed at a standardized
execution layer across venues: unified pipelines for Hyperliquid, Binance,
Bybit, Jupiter on Solana, Uniswap, and Polymarket, so one agent's command
structure reaches DEX perps, CEX futures, spot swaps, and prediction markets
alike. Its core is an `AgentOrchestrator` over an `EventBus`, with
`MarketDataFeed`, `PositionManager`, `RiskManager`, and an `LLMClient` pointed
by default at a local Ollama LLaMA model — explicitly because hosted providers'
content filters and rate limits interfere with trading prompts. Two ideas are
unusual enough to note. The Survival Manager makes risk posture a function of
PnL health, moving the agent between Growth, Survival, Recovery, Defensive, and
Critical states with hysteresis so it does not oscillate, and shutting down
gracefully at a 50% loss. The x402 economic core lets an agent pay for its own
inputs machine-to-machine: it handles `402 Payment Required` responses by
paying the vendor over an EVM chain via viem and retrying in a single flow, with
the budget frozen in Defensive state.

### [polymarket-exec-api](polymarket-exec-api)

[pmxt](https://pmxt.dev) — "the ccxt for prediction markets" — a unified API
over Polymarket, Kalshi, Limitless, Probable, Baozi, and Myriad, published for
both Python and TypeScript from one shared core. It models the domain as the
three-level hierarchy every venue actually has but names differently — Event
(the topic), Market (the tradeable question), Outcome (the share you buy) — so
`fetch_events(query=...)`, `.markets.match(...)`, and `.yes.price` read the same
against any exchange, and trading is unified behind per-venue credentials.
Alongside the SDKs it carries OpenAPI specs, a compliance matrix documenting
exactly which features each adapter supports (the honest version of "unified"),
an `ADDING_AN_EXCHANGE.md` guide, and a `dome-to-pmxt` codemod for migrating off
Dome API. For cross-platform arbitrage work in `packages/predictos`, this is the
normalization layer that makes two venues' prices comparable in the first place.
