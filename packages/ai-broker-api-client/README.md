<!-- template-git-repo:badges:start -->
<p align="center">
    <a href="https://docs.autoinvestment.broker/"><img src="https://img.shields.io/badge/Docs-blue?logo=ReadTheDocs&logoColor=white" alt="Documentation" /></a>
    <a href="https://stackblitz.com/github/OpenSourceAGI/ai-broker-investing-agent/tree/main/packages/ai-broker-api-client"><img height="20px" src="https://developer.stackblitz.com/img/open_in_stackblitz.svg" alt="Open in StackBlitz" /></a>
    <br />
    <a href="https://github.com/OpenSourceAGI/ai-broker-investing-agent/stargazers"><img src="https://img.shields.io/github/stars/OpenSourceAGI/ai-broker-investing-agent" alt="GitHub Stars" /></a>
    <a href="https://github.com/OpenSourceAGI/ai-broker-investing-agent/issues"><img src="https://img.shields.io/github/issues/OpenSourceAGI/ai-broker-investing-agent?logo=github" alt="GitHub Issues" /></a>
    <a href="https://github.com/OpenSourceAGI/ai-broker-investing-agent/pulls"><img src="https://img.shields.io/github/issues-pr/OpenSourceAGI/ai-broker-investing-agent?logo=github&label=PRs" alt="Open Pull Requests" /></a>
    <a href="https://github.com/OpenSourceAGI/ai-broker-investing-agent/pulls?q=is%3Apr+is%3Aclosed"><img src="https://img.shields.io/github/issues-pr-closed/OpenSourceAGI/ai-broker-investing-agent?logo=github&label=PRs%20merged&color=8957e5" alt="Merged Pull Requests" /></a>
    <a href="https://github.com/OpenSourceAGI/ai-broker-investing-agent/discussions"><img src="https://img.shields.io/github/discussions/OpenSourceAGI/ai-broker-investing-agent" alt="GitHub Discussions" /></a>
    <a href="https://github.com/OpenSourceAGI/ai-broker-investing-agent/commits/main/"><img src="https://img.shields.io/github/last-commit/OpenSourceAGI/ai-broker-investing-agent.svg" alt="GitHub last commit" /></a>
    <br />
    <img src="https://img.shields.io/badge/Bun-14151A?logo=bun&logoColor=white" alt="Bun" /> <img src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white" alt="Vite" /> <img src="https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white" alt="Vitest" />
</p>
<!-- template-git-repo:badges:end -->

# `ai-broker-api-client`

Typed TypeScript client for the [Auto Investment Broker](https://autoinvestment.broker)
API, generated from the project's OpenAPI specification with
[`@hey-api/openapi-ts`](https://heyapi.dev).


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
