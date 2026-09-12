<!-- template-git-repo:badges:start -->
<p align="center">
    <a href="https://docs.autoinvestment.broker/"><img src="https://img.shields.io/badge/Docs-blue?logo=ReadTheDocs&logoColor=white" alt="Documentation" /></a>
    <br />
    <a href="https://github.com/OpenSourceAGI/ai-broker-investing-agent/stargazers"><img src="https://img.shields.io/github/stars/OpenSourceAGI/ai-broker-investing-agent" alt="GitHub Stars" /></a>
    <a href="https://www.npmjs.com/package/predictos"><img src="https://img.shields.io/npm/dm/predictos.svg" alt="NPM Monthly Downloads" /></a>
    <a href="https://www.npmjs.com/package/predictos"><img src="https://img.shields.io/npm/v/predictos.svg" alt="npm version" /></a>
    <a href="https://www.npmjs.com/package/predictos"><img src="https://img.shields.io/npm/dt/predictos.svg" alt="NPM Total Downloads" /></a>
    <a href="https://www.npmjs.com/package/predictos"><img src="https://img.shields.io/npm/types/predictos" alt="TypeScript types" /></a>
    <a href="https://packagephobia.com/result?p=predictos"><img src="https://packagephobia.com/badge?p=predictos" alt="Install size" /></a>
    <br />
    <a href="https://github.com/OpenSourceAGI/ai-broker-investing-agent/issues"><img src="https://img.shields.io/github/issues/OpenSourceAGI/ai-broker-investing-agent?logo=github" alt="GitHub Issues" /></a>
    <a href="https://github.com/OpenSourceAGI/ai-broker-investing-agent/pulls"><img src="https://img.shields.io/github/issues-pr/OpenSourceAGI/ai-broker-investing-agent?logo=github&label=PRs" alt="Open Pull Requests" /></a>
    <a href="https://github.com/OpenSourceAGI/ai-broker-investing-agent/pulls?q=is%3Apr+is%3Aclosed"><img src="https://img.shields.io/github/issues-pr-closed/OpenSourceAGI/ai-broker-investing-agent?logo=github&label=PRs%20merged&color=8957e5" alt="Merged Pull Requests" /></a>
    <a href="https://github.com/OpenSourceAGI/ai-broker-investing-agent/discussions"><img src="https://img.shields.io/github/discussions/OpenSourceAGI/ai-broker-investing-agent" alt="GitHub Discussions" /></a>
    <a href="https://github.com/OpenSourceAGI/ai-broker-investing-agent/commits/main/"><img src="https://img.shields.io/github/last-commit/OpenSourceAGI/ai-broker-investing-agent.svg" alt="GitHub last commit" /></a>
    <br />
    <a href="https://stackblitz.com/github/OpenSourceAGI/ai-broker-investing-agent/tree/main/packages/predictos"><img height="20px" src="https://developer.stackblitz.com/img/open_in_stackblitz.svg" alt="Open in StackBlitz" /></a>
    <img src="https://img.shields.io/badge/Bun-14151A?logo=bun&logoColor=white" alt="Bun" /> <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" /> <img src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white" alt="Vite" /> <img src="https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white" alt="Vitest" />
</p>
<!-- template-git-repo:badges:end -->

# predictos

The PredictOS "Super Intelligence" core — prediction-market multi-agent
analysis, market data clients, and cross-platform arbitrage — adapted for
Node/TypeScript ESM.

> Adapted from [PredictOS](https://github.com/PredictionXBT/PredictOS) by
> **PredictionXBT** (MIT licensed, © 2025). The original code shipped as
> Deno/Supabase edge functions; here it is refactored into plain, typed,
> dependency-light library functions with no HTTP/CORS layer. See `LICENSE`
> and `NOTICE`.

## What this is

`predictos` extracts the reusable analysis pipeline from PredictOS so the
`investing` package can call it directly as a library:

- **AI provider clients** — OpenAI (Responses API), Grok/xAI (Responses API,
  with optional `x_search` / `web_search` tools), and BlockRun (x402
  wallet-based micropayments across 20+ models), plus the analysis prompt
  builders (`analyzeEventMarkets`, `bookmakerAnalysis`, `arbitrageAnalysis`,
  `searchQueryGenerator`).
- **Market data clients** — Kalshi via the DFlow API (`data/kalshi`) and
  Polymarket via the Dome API (`data/polymarket`).
- **Multi-agent pipeline** (`agents`):
  - `runEventAnalysisAgent` — analyzes an event's markets for alpha and a
    predicted winner.
  - `runBookmakerAgent` — aggregates multiple agent analyses (and optional
    external data sources) into a single consolidated assessment.
  - `runMapperAgent` — turns an analysis into Polymarket order parameters
    (pure logic; Kalshi mapping not yet implemented).
- **Cross-platform arbitrage** (`arbitrage`) — `findArbitrage` parses a
  Polymarket/Kalshi URL, generates a search query with AI, searches the other
  platform, and evaluates whether the same event is mispriced across venues.
- **Event fetching** (`getEvents`) — resolves a Polymarket/Kalshi/Jupiter URL
  into its raw markets (Kalshi via DFlow, Polymarket via the Gamma API).

## Refactor notes (Deno → Node)

- Deno HTTP handlers (`Deno.serve`, `new Response(...)`, CORS headers) were
  removed. Each endpoint is now a plain exported async function taking typed
  parameters and returning a typed result; validation failures `throw`.
- `Deno.env.get("X")` was replaced with config/options objects
  (`AIConfig`, `DataConfig`, per-call `apiKey`/`walletKey`) that fall back to
  `process.env` (`OPENAI_API_KEY`, `XAI_API_KEY`, `BLOCKRUN_WALLET_KEY`,
  `DOME_API_KEY`, `DFLOW_API_KEY`). No secrets are hardcoded.
- Remote (`https://...`) and `npm:` import specifiers were replaced with normal
  package imports (`ethers`). The global `fetch` (Node 18+) is used throughout.
- Prompt text and analysis logic are preserved verbatim.

## Not ported (yet)

Intentionally left out of this core port — noted for future work:

- The Next.js **`terminal/`** frontend.
- The Python **alpha-hunter** `examples/`.
- **x402 seller** / **pay.sh** payment-serving flows (`x402-seller`).
- **Irys** verifiable-agent storage.
- **Wallet-tracking websockets** and the **polymarket-position-tracker**.
- The **15-minute up/down betting bot**
  (`polymarket-up-down-15-markets-limit-order-bot`).
- **Order execution** (`polymarket-put-order`) — the mapper produces order
  parameters, but placing orders on-chain is out of scope here.
- **`polyfactual-research`**.

The BlockRun client *is* ported (it only needs `ethers` + `fetch`), but its
on-chain micropayment flow is untested in this environment.

## How `investing` consumes it

`investing` depends on this package via a `file:` reference and re-exports its
public API from `investing/predictos`:

```ts
import { runEventAnalysisAgent, findArbitrage, getEvents } from "investing/predictos";
```

A root `tsconfig.json` path alias (`predictos` → `packages/predictos/src`)
makes it resolve in development before a build exists.

## Subpath exports

| Import                         | Contents                                   |
| ------------------------------ | ------------------------------------------ |
| `predictos`                    | Everything (barrel)                        |
| `predictos/ai`                 | AI clients + prompt builders               |
| `predictos/data/kalshi`        | Kalshi (DFlow) data client                 |
| `predictos/data/polymarket`    | Polymarket (Dome) data client              |
| `predictos/agents`             | `runEventAnalysisAgent`, `runBookmakerAgent`, `runMapperAgent` |
| `predictos/arbitrage`          | `findArbitrage`                            |

## Credits

All original design and logic © 2025 PredictionXBT, from
[PredictOS](https://github.com/PredictionXBT/PredictOS) (MIT). This package is a
derivative work adapting that code for Node/TypeScript use.
