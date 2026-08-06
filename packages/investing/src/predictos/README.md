# PredictOS agent toolkit

Reusable backend TypeScript for AI-driven prediction-market analysis and trading,
**adapted from the [PredictOS](https://github.com/PredictionXBT/PredictOS) project**
(MIT, Copyright 2025 PredictionXBT). See [`NOTICE`](./NOTICE) for the full license
and attribution.

The upstream code targeted Deno / Supabase edge functions. It has been ported to
Node/ESM for the `investing` package:

- `Deno.env.get("FOO")` → `process.env.FOO`
- Deno URL imports and `npm:` / `jsr:` specifiers → standard npm imports
- The global `fetch` (Node 18+) is used — no `node-fetch` dependency
- `serve(...)` / `Deno.serve(...)` HTTP handlers and CORS boilerplate were removed;
  each agent's business logic is now a plain exported async function
- Prompt text, request shapes, response parsing, and error handling are preserved

## Layout

```
predictos/
  ai/          AI provider clients (Grok, OpenAI, BlockRun) + prompt builders
  clients/     Fetch-based API clients: dflow, dome, polyfactual, polymarket, x402
  agents/      Agent functions (event analysis, bookmaker, mapper, arbitrage, ...)
  index.ts     Public barrel
```

## Usage

```ts
// Agents are exported at the top level of the subpath
import {
  eventAnalysisAgent,
  arbitrageFinder,
  getEvents,
  ai,
  clients,
} from "investing/predictos";

const events = await getEvents({ url: "https://polymarket.com/event/..." });

const analysis = await eventAnalysisAgent({
  markets: events.markets ?? [],
  eventIdentifier: events.eventIdentifier!,
  pmType: "Polymarket",
  model: "grok-4-1-fast-reasoning",
});

// AI clients and prompt builders
const grok = await ai.callGrokResponses("hi", "system", "json_object");

// Data-provider clients are namespaced per provider
const markets = await clients.dome.getKalshiMarketsByEvent("KXBTC-25DEC");
```

Agent type definitions are exported as namespaces (e.g. `EventAnalysisAgentTypes`,
`ArbitrageFinderTypes`) to avoid name collisions between agents that share type
names such as `MarketAnalysis` or `PmType`.

## Configuration (environment variables)

These are read via `process.env`. Provide only the ones needed by the agents you
call. **Use real values only in your own environment — never commit secrets.**

| Variable | Used by |
| --- | --- |
| `XAI_API_KEY` | Grok (xAI) calls |
| `OPENAI_API_KEY` | OpenAI calls |
| `BLOCKRUN_WALLET_KEY` | BlockRun x402 micropayment calls (Base-chain private key) |
| `DOME_API_KEY` | Dome API (Polymarket/Kalshi market data) |
| `DFLOW_API_KEY` | DFlow API (Kalshi market data) |
| `POLYFACTUAL_API_KEY` | Polyfactual deep-research client |
| `POLYMARKET_WALLET_PRIVATE_KEY` | Polymarket CLOB order placement |
| `POLYMARKET_PROXY_WALLET_ADDRESS` | Polymarket CLOB order placement |
| `POLYMARKET_SIGNATURE_TYPE` | Polymarket signature type (default `1`) |
| `X402_DISCOVERY_URL` | x402 bazaar discovery |
| `X402_FACILITATOR_URL` | x402 payment facilitator |
| `X402_EVM_PRIVATE_KEY` | x402 EVM (Base) payments |
| `X402_SOLANA_PRIVATE_KEY` | x402 Solana payments |
| `SOLANA_RPC_URL` | x402 Solana payments (default mainnet-beta) |

## Optional peer dependencies

Solana x402 payments (`clients.x402` / the `x402Seller` `call` action against a
Solana seller) dynamically import `@solana/web3.js`, `@solana/spl-token`, and
`bs58`. These are **not** declared as dependencies to keep the package light —
install them yourself if you use Solana payments. EVM (Base) payments use
`ethers`, which is already a dependency of this package.
