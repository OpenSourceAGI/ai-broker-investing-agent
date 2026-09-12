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
