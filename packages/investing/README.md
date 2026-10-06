<p align="center">
    <img width="400px" src="https://i.imgur.com/dE5Rfck.jpeg" />
</p>

<!-- template-git-repo:badges:start -->
<p align="center">
    <a href="https://docs.autoinvestment.broker/"><img src="https://img.shields.io/badge/Docs-blue?logo=ReadTheDocs&logoColor=white" alt="Documentation" /></a>
    <br />
    <a href="https://github.com/OpenSourceAGI/ai-broker-investing-agent/stargazers"><img src="https://img.shields.io/github/stars/OpenSourceAGI/ai-broker-investing-agent" alt="GitHub Stars" /></a>
    <a href="https://www.npmjs.com/package/investing"><img src="https://img.shields.io/npm/dm/investing.svg" alt="NPM Monthly Downloads" /></a>
    <a href="https://www.npmjs.com/package/investing"><img src="https://img.shields.io/npm/v/investing.svg" alt="npm version" /></a>
    <a href="https://www.npmjs.com/package/investing"><img src="https://img.shields.io/npm/dt/investing.svg" alt="NPM Total Downloads" /></a>
    <a href="https://www.npmjs.com/package/investing"><img src="https://img.shields.io/npm/types/investing" alt="TypeScript types" /></a>
    <a href="https://packagephobia.com/result?p=investing"><img src="https://packagephobia.com/badge?p=investing" alt="Install size" /></a>
    <br />
    <a href="https://github.com/OpenSourceAGI/ai-broker-investing-agent/issues"><img src="https://img.shields.io/github/issues/OpenSourceAGI/ai-broker-investing-agent?logo=github" alt="GitHub Issues" /></a>
    <a href="https://github.com/OpenSourceAGI/ai-broker-investing-agent/pulls"><img src="https://img.shields.io/github/issues-pr/OpenSourceAGI/ai-broker-investing-agent?logo=github&label=PRs" alt="Open Pull Requests" /></a>
    <a href="https://github.com/OpenSourceAGI/ai-broker-investing-agent/pulls?q=is%3Apr+is%3Aclosed"><img src="https://img.shields.io/github/issues-pr-closed/OpenSourceAGI/ai-broker-investing-agent?logo=github&label=PRs%20merged&color=8957e5" alt="Merged Pull Requests" /></a>
    <a href="https://github.com/OpenSourceAGI/ai-broker-investing-agent/discussions"><img src="https://img.shields.io/github/discussions/OpenSourceAGI/ai-broker-investing-agent" alt="GitHub Discussions" /></a>
    <a href="https://github.com/OpenSourceAGI/ai-broker-investing-agent/commits/main/"><img src="https://img.shields.io/github/last-commit/OpenSourceAGI/ai-broker-investing-agent.svg" alt="GitHub last commit" /></a>
    <br />
    <a href="https://stackblitz.com/github/OpenSourceAGI/ai-broker-investing-agent/tree/main/packages/investing"><img height="20px" src="https://developer.stackblitz.com/img/open_in_stackblitz.svg" alt="Open in StackBlitz" /></a>
    <img src="https://img.shields.io/badge/Bun-14151A?logo=bun&logoColor=white" alt="Bun" /> <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" /> <img src="https://img.shields.io/badge/Drizzle%20ORM-C5F74F?logo=drizzle&logoColor=white" alt="Drizzle ORM" /> <img src="https://img.shields.io/badge/Zod-3E67B1?logo=zod&logoColor=white" alt="Zod" /> <img src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white" alt="Vite" /> <img src="https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white" alt="Vitest" />
</p>
<!-- template-git-repo:badges:end -->

# Investing Library

A comprehensive TypeScript/JavaScript library for investment analysis, trading automation, and financial data processing. This package provides reusable utilities for building investment applications, trading bots, and financial analysis tools.

## Features

- 🤖 **Trading Agents** - Multi-agent framework for automated trading strategies
- 📊 **Stock Data** - Fetch and analyze stock data from Yahoo Finance, SEC filings, and more
- 💹 **Prediction Markets** - Polymarket integration for prediction market data
- 🔌 **Alpaca Trading API** - Easy-to-use wrapper for Alpaca trading platform
- 📈 **Technical Analysis** - Algorithmic trading strategies and indicators
- 🎯 **Social Trading** - Track and analyze top traders and strategies
- 🧠 **AI-Powered Analysis** - LLM-based investment research and debate generation
- 📦 **Data Files** - Pre-packaged stock indexes, sector information, and market data

## Third-party strategy signals

The source integration connects all ten vendored project folders to the agent
pipeline through pure sources, venue/data mappings and a survival risk posture.
The [integration overview](../../devdocs/third-party-trading-bots-overview.md)
records each project's runtime, license, native assessment and operational scope.
Full notices ship in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

From the repository root, run the credential-free paper demo in Docker:

```bash
bash devdocs/third-party-integration/harness/run.sh install
bash devdocs/third-party-integration/harness/run.sh demo
```

The image uses pinned Bun 1.3.11 with Node/native build prerequisites. Dependencies
live in container-only volumes; the staged repository excludes credentials and
host node_modules. Tests and the demo run with `--network=none`.

The demo first prints a readable summary: six numbered stages per run (strategy,
normalized signal, research input, Trader, Portfolio Manager, execution). It then
prints the full JSON trace: signals → report → proposal → Trader → risk debate → judge →
verdict → Fund Manager → approval → fill → account snapshots. It includes momentum
BUY/SELL, Vibe YES/NO, BTC bullish/bearish, copy sizing, sequential Gabagool targets,
PyKalshi and pmxt mappings, OpenBB-backed stock BUY/SELL and Defensive sizing.
The pmxt fixture opts into explicitly synthetic quotes; a point price is not a
live executable quote. Models are scripted and all prices/forecasts are fixtures.

Source consumers can opt into the new stage with the fourth graph argument and
the third `propagate` argument:

```typescript
// Source-level example inside packages/investing. Avoid src/index.ts: it loads
// native dependencies and dotenv. Built package/subpath imports remain broken.
import { TradingAgentsGraph } from './src/trading-agents/graph/trading-graph'
import { kalshiMomentumSource } from './src/strategy-signals/sources/kalshi-momentum'

const graph = new TradingAgentsGraph([], false, undefined, {
  llm: { deep: suppliedLLM, quick: suppliedLLM },
  riskReview: true,
  riskLimits: { maxPositionPerMarket: 50, maxOpenPositions: 5 },
})
const context = { account: venue.snapshot(), evaluationTime }
const strategySignals = kalshiMomentumSource.run({ ticks }, context)
const result = await graph.propagate(market.title, evaluationTime.slice(0, 10), {
  instrument: { type: 'event', venue: venue.venue, marketId: market.marketId },
  strategySignals,
  account: context.account,
  evaluationTime,
  event: market,
  sources: { [kalshiMomentumSource.id]: kalshiMomentumSource },
})
if (result.state.approval) await venue.execute(result.state.approval)
```

The caller supplies the LLM, current venue/account, market and evaluation time. With `riskReview: true`, an `account` snapshot is required for stocks too: without one the gate cannot check cash or holdings, so the run ends at HOLD.
Register each executable source so its freshness and guards can run; unregistered
third-party proposals fail closed. Event runs skip stock analysts. Fixture stock
runs select no external analysts and execute an Alpaca-shaped order against
`MockEquityBroker` after a cash/share preflight. Existing callers without `run`
retain byte-identical prompts; risk review is opt-in.

Every executable result binds to one selected `proposalId`. BLOCK means HOLD;
REDUCE supplies a whole-number cap. Final quantity is the minimum of the proposal,
common/source risk caps, judge cap and Fund Manager quantity. Invalid model output
or model errors cannot grant approval. Red flags remain advisory input. Forecast
guards/Kelly apply only to genuine forecasts, never a substituted market price.

Gabagool portfolio targets execute one leg per call, recomputed from actual
holdings and fill costs. A rejected leg does not create a holding. Strategy prices
retain decimal-cent precision; the paper execution bridge rejects unsupported
sub-cent prices. Fractional weighted average costs are valid account values.
Survival multipliers (1 / 1 / 0.75 / 0.5 / 0) are new demo policy, not upstream rules.

Verification commands are `run.sh test`, `test-root`, `tsc`, `build`, `coverage`
and `pack`. The type gate permits only reproduced pre-existing diagnostic
identities/occurrences; it does not claim a clean TypeScript build. Coverage is
reported for the new module and changed graph/risk-judge files.

**Scope:** source-level fixture/paper execution only. Built exports, the web app
and Workers runtime are not validated by this demo. Live broker/venue execution,
an execution ledger, portfolio versioning and concurrency control are outside
this integration. Current snapshots must be refreshed and callers must serialize
execution. See the [workflow](../../devdocs/third-party-integration/skills/integrate-trading-bot/SKILL.md)
to add a source, mapping or posture.

## Installation

```bash
npm i investing
# or
bun i investing
# or
pnpm add investing
```

## Quick Start

### Alpaca Trading Client

```typescript
import { createAlpacaClient } from "investing";

// Create client with environment variables
const alpaca = createAlpacaClient({
  paper: true, // Use paper trading
  keyId: process.env.ALPACA_API_KEY,
  secretKey: process.env.ALPACA_SECRET,
});

// Get account info
const account = await alpaca.getAccount();
console.log(`Portfolio value: $${account.portfolio_value}`);

// Place an order
const order = await alpaca.createOrder({
  symbol: "AAPL",
  qty: 10,
  side: "buy",
  type: "market",
  time_in_force: "day",
});
```

### Fetch Stock Data

```typescript
import { getStockQuote, getHistoricalData } from "investing";

// Get real-time quote
const quote = await getStockQuote("AAPL");
console.log(`AAPL: $${quote.regularMarketPrice}`);

// Get historical data
const history = await getHistoricalData("AAPL", {
  period1: "2024-01-01",
  period2: "2024-12-31",
  interval: "1d",
});
```

### Polymarket Prediction Markets

```typescript
import { fetchMarkets, fetchLeaderboard } from "investing";

// Get active prediction markets
const markets = await fetchMarkets(50, "volume24hr");
console.log(`Top market: ${markets[0].question}`);

// Get top traders
const leaders = await fetchLeaderboard({
  timePeriod: "7d",
  orderBy: "PNL",
  limit: 10,
});
```

### Kalshi Momentum Paper Agent

The prediction-markets package includes a deterministic TypeScript port of the
momentum rules from PyKalshi's MIT-licensed
`kalshi-bot-api/examples/momentum_bot.py`. It consumes recorded ticks and uses
an in-memory paper executor, so it never connects to Kalshi, submits orders, or
requires credentials.

Run the included replay from `packages/investing`:

```bash
bun run demo:kalshi-momentum
```

```typescript
import { runKalshiMomentumPaperAgent } from "investing/prediction-markets";

const result = runKalshiMomentumPaperAgent({
  initialCashCents: 10_000,
  ticks: [50, 51, 52, 53, 58].map((yesPriceCents, index) => ({
    ticker: "DEMO-KALSHI-MARKET",
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    yesPriceCents,
  })),
});

console.log(result.report);
```

Prices are integer cents per contract. A YES tick of `53` implies a NO price
of `47`. Trade `action` (`BUY`, `SELL`, `HOLD`) is separate from the binary
`outcome` (`YES`, `NO`): selling YES closes YES contracts and does not mean
buying NO.

Configuration controls `lookback`, `momentumThreshold`, `positionSize`,
`profitTargetCents`, `stopLossCents`, and `maxPosition`. The defaults preserve
the upstream example: three consecutive moves, 10 contracts, a 5-cent target,
a 3-cent stop, and a 50-contract limit. The paper executor fills immediately at
the recorded outcome price with no fees or slippage and reports cash, open
positions, and realized/unrealized P&L.

This replay is a strategy demonstration, not a backtest or live execution
system. It assumes complementary YES/NO prices, does not model an order book,
partial fills, fees, latency, settlement, or market resolution, and does not
enable the existing unimplemented Kalshi live mapper.

### Trading Agents Framework

```typescript
import { createTradingGraph, MarketAnalyst } from "investing";

// Create a trading agent system
const tradingSystem = createTradingGraph({
  agents: [
    new MarketAnalyst(),
    new BullResearcher(),
    new BearResearcher(),
    new Trader(),
  ],
  config: {
    ticker: "AAPL",
    budget: 10000,
  },
});

// Run analysis
const result = await tradingSystem.invoke({
  ticker: "AAPL",
  question: "Should I buy AAPL stock?",
});
```

## API Reference

### Alpaca Trading

```typescript
import { createAlpacaClient, AlpacaConfig } from "investing/alpaca";
```

#### `createAlpacaClient(config?: AlpacaConfig)`

Creates an Alpaca API client for trading operations.

**Parameters:**

- `config.paper` - Use paper trading (default: true)
- `config.keyId` - Alpaca API key ID
- `config.secretKey` - Alpaca secret key
- `config.baseUrl` - Custom base URL (optional)

**Environment Variables:**

- `ALPACA_API_KEY` or `APCA_API_KEY_ID`
- `ALPACA_SECRET` or `APCA_API_SECRET_KEY`
- `ALPACA_BASE_URL` (optional)

### Stock Data & Analysis

```typescript
import {
  getStockQuote,
  getHistoricalData,
  getSECFilings,
  StockQuote,
} from "investing/stocks";
```

#### `getStockQuote(symbol: string): Promise<StockQuote>`

Fetch real-time stock quote from Yahoo Finance.

#### `getHistoricalData(symbol: string, options?: HistoricalOptions)`

Get historical price data for technical analysis.

#### `getSECFilings(ticker: string, filingType?: string)`

Fetch SEC filings (10-K, 10-Q, 8-K) for a company.

### Prediction Markets

```typescript
import {
  fetchMarkets,
  fetchLeaderboard,
  PolymarketMarket,
} from "investing/prediction";
```

#### `fetchMarkets(limit?: number, sortBy?: string)`

Fetch active prediction markets from Polymarket.

**Parameters:**

- `limit` - Number of markets to fetch (default: 50)
- `sortBy` - Sort field: 'volume24hr', 'liquidity', etc.

#### `fetchLeaderboard(options?)`

Get Polymarket leaderboard of top traders.

**Options:**

- `timePeriod` - '1d' | '7d' | '30d' | 'all'
- `orderBy` - 'VOL' | 'PNL'
- `limit` - Number of results (default: 20)
- `category` - Market category (default: 'overall')

### Prediction-Market Agents & Arbitrage

```typescript
import {
  runEventAnalysisAgent,
  runBookmakerAgent,
  runMapperAgent,
  findArbitrage,
  getEvents,
} from "investing/prediction-markets";
```

Multi-agent analysis over Polymarket and Kalshi, refactored from Deno/Supabase
edge functions into plain typed async functions (MIT, see
`src/prediction-markets/LICENSE`):

- **AI clients** — OpenAI, Grok/xAI and BlockRun (x402 micropayments), plus the
  analysis prompt builders.
- **Market data** — Kalshi via DFlow and Polymarket via Dome/Gamma.
- `runEventAnalysisAgent` — analyzes an event's markets for alpha and a
  predicted winner.
- `runBookmakerAgent` — aggregates several agent analyses into one assessment.
- `runMapperAgent` — turns an analysis into Polymarket order parameters.
- `findArbitrage` — finds the same event on the other venue and checks whether
  it is mispriced across venues.
- `getEvents` — resolves a Polymarket/Kalshi URL into its raw markets.

Keys are read from options, falling back to `OPENAI_API_KEY`, `XAI_API_KEY`,
`BLOCKRUN_WALLET_KEY`, `DOME_API_KEY` and `DFLOW_API_KEY`.

### Trading Agents

```typescript
import {
  createTradingGraph,
  MarketAnalyst,
  BullResearcher,
  BearResearcher,
  Trader,
} from "investing/trading-agents";
```

#### `createTradingGraph(config)`

Creates a multi-agent trading system using LangGraph.

**Agents:**

- `MarketAnalyst` - Analyzes market conditions and trends
- `BullResearcher` - Researches bullish arguments
- `BearResearcher` - Researches bearish arguments
- `Trader` - Makes trading decisions based on research

### Constants & Data

```typescript
import { STOCK_INDEXES, SECTORS, CATEGORIES } from "investing/constants";
```

Pre-loaded data files available:

- `data/stock-indexes.json` - Major stock indexes (S&P 500, NASDAQ, etc.)
- `data/sectors-industries.json` - Industry classifications
- `data/sector-info.json` - Sector descriptions and metrics
- `data/stock-names.json` - Company names and tickers
- `data/globe.json` - Geographic market data

### Utilities

```typescript
import { cn, setStateInURL } from "investing/utils";
```

#### `cn(...inputs: ClassValue[])`

Utility for merging CSS classes using clsx and tailwind-merge.

#### `setStateInURL(state?, addToHistory?)`

Sync application state to URL parameters for shareable links.

## Data Files

Access pre-packaged data files:

```typescript
import stockIndexes from "investing/data/stock-indexes.json";
import sectors from "investing/data/sectors-industries.json";
import stockNames from "investing/data/stock-names.json";

console.log(`Total stocks: ${stockNames.length}`);
console.log(`S&P 500 stocks: ${stockIndexes["S&P 500"].length}`);
```

## Environment Variables

Create a `.env` file with your API keys:

```env
# Alpaca Trading API
ALPACA_API_KEY=your_key_here
ALPACA_SECRET=your_secret_here

# Optional: Use live trading (default is paper)
# ALPACA_BASE_URL=https://api.alpaca.markets

# OpenAI for AI-powered analysis
OPENAI_API_KEY=your_openai_key

# Optional: Alternative LLM providers
ANTHROPIC_API_KEY=your_anthropic_key
GOOGLE_API_KEY=your_google_key
GROQ_API_KEY=your_groq_key
```

## TypeScript Support

This package includes full TypeScript definitions. Import types directly:

```typescript
import type {
  AlpacaConfig,
  StockQuote,
  PolymarketMarket,
  TradingAgent,
} from "investing";
```

## Advanced Usage

### Custom Trading Strategy

```typescript
import { createTradingGraph, BaseTradingAgent } from "investing";

class MomentumTrader extends BaseTradingAgent {
  name = "momentum-trader";

  async analyze(state: TradingState) {
    // Implement your strategy
    const data = await this.getHistoricalData(state.ticker);
    const momentum = this.calculateMomentum(data);

    return {
      signal: momentum > 0.5 ? "buy" : "sell",
      confidence: Math.abs(momentum),
    };
  }
}

const strategy = new MomentumTrader();
const result = await strategy.analyze({ ticker: "TSLA" });
```

### Multi-Agent Debate System

```typescript
import { createDebateSystem } from "investing";

const debate = await createDebateSystem({
  ticker: "NVDA",
  agents: ["bull_researcher", "bear_researcher", "neutral_analyst"],
  rounds: 3,
});

const decision = await debate.run();
console.log(decision.recommendation); // 'buy' | 'sell' | 'hold'
console.log(decision.reasoning);
```

### Batch Stock Analysis

```typescript
import { getStockQuote } from "investing";

const tickers = ["AAPL", "GOOGL", "MSFT", "AMZN"];
const quotes = await Promise.all(tickers.map(getStockQuote));

const summary = quotes.map((q, i) => ({
  ticker: tickers[i],
  price: q.regularMarketPrice,
  change: q.regularMarketChangePercent,
}));
```

## Database Integration (Optional)

Database features target **Cloudflare D1 only**. Install the peer dependency:

```bash
npm install drizzle-orm
```

On Cloudflare Workers the connection uses the `DB` binding. Outside Workers
(scripts, CI) it reaches the same D1 database over Cloudflare's REST API, which
needs `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_TOKEN`, and optionally
`CLOUDFLARE_DATABASE_ID`.

Then import database schemas:

```typescript
import { db, stocksTable, positionsTable } from "investing/db";

// Query your database
const stocks = await db.select().from(stocksTable).limit(10);
```

## Examples

See the `/examples` directory for complete working examples:

- `examples/alpaca-trading.ts` - Basic trading operations
- `examples/stock-analysis.ts` - Stock data analysis
- `examples/prediction-markets.ts` - Polymarket integration
- `examples/trading-bot.ts` - Automated trading bot
- `examples/multi-agent-research.ts` - AI research agents

## Links

- [GitHub Repository](https://github.com/vtempest/ai-broker-investment-agent)
- [Documentation](https://invest.vtempest.com/docs)
- [Examples](./examples)

- [GitHub Issues](https://github.com/vtempest/ai-broker-investment-agent/issues)
- [Documentation](https://invest.vtempest.com/docs)
