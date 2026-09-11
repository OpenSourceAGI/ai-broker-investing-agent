# `ai-broker-api-client`

Typed TypeScript client for the [Auto Investment Broker](https://autoinvestment.broker)
API, generated from the project's OpenAPI specification with
[`@hey-api/openapi-ts`](https://heyapi.dev).

[![npm](https://img.shields.io/npm/v/ai-broker-api-client)](https://npmjs.org/package/ai-broker-api-client)
[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/OpenSourceAGI/ai-broker-investing-agent/tree/main/packages/ai-broker-api-client)

## Install

```bash
npm install ai-broker-api-client
```

## Usage

Every operation is a tree-shakeable function. The client defaults to
`https://autoinvestment.broker/api`, so simple reads need no setup:

```ts
import { getStocksQuoteBySymbol, getStocksTrending } from 'ai-broker-api-client'

const quote = await getStocksQuoteBySymbol({ path: { symbol: 'AAPL' } })
const trending = await getStocksTrending()
```

Point it at another deployment — a preview Worker or a local dev server — by
reconfiguring the shared client:

```ts
import { client } from 'ai-broker-api-client'

client.setConfig({ baseUrl: 'http://localhost:3000/api' })
```

Requests and responses are fully typed; the response types are exported
alongside the operations:

```ts
import { postTradingAgents, type TradingAgentResponse } from 'ai-broker-api-client'

const { data } = await postTradingAgents({
  body: { ticker: 'NVDA' },
})
```

## What it covers

The generated surface tracks the API's OpenAPI spec and currently includes:

| Area | Operations |
| --- | --- |
| **Stocks** | quotes, historical data, search and autocomplete, trending, gainers, delisted, sectors, screener, statistical prediction |
| **Agents** | `postTradingAgents`, `postDebateAgents`, `getDebateAgents`, `getGroqDebate`, `postGroqDebate` |
| **Backtesting** | `postBacktest`, `postBacktestTechnical` |
| **Strategies** | list, create, update, delete, and the algorithmic script catalogue |
| **Portfolio & user** | portfolio, signals, settings, initialization |
| **Prediction markets** | Polymarket markets and positions |
| **Copy trading** | ZuluTrade search, top rank, sync |
| **Filings** | SEC company filings by ticker or CIK |

## Regenerating

The client is generated from
`apps/ai-broker-web/content/docs/ai-broker-openapi.json` — regenerate it after
changing any route that the spec covers:

```bash
cd packages/ai-broker-api-client
bun run build:api
```

Configuration lives in [`openapi-ts.config.js`](./openapi-ts.config.js); the
default base URL is set in [`baseurl.ts`](./baseurl.ts) and can be overridden at
generation time with `API_URL`.

<!-- Generated sources under src/ are overwritten on every run — do not edit them by hand. -->

## Related

- [`packages/mcp-server`](../mcp-server) — the same API exposed as MCP tools.
- [API reference](https://autoinvestment.broker/api/docs)
- [Project documentation](https://docs.autoinvestment.broker/)
