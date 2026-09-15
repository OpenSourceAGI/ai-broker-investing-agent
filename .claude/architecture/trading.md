# The Trading Domain

This is the part of the repo where a bug costs money. Read this before changing
anything that proposes, sizes, or executes a position.

## Rules that are not negotiable

1. **Never weaken a risk guard to make something pass.** Position caps,
   confidence ceilings, minimum-entry prices, edge limits and stop-losses are
   the product, not obstacles. If a test fails against a guard, the change is
   wrong until proven otherwise.
2. **Never widen a default.** Changing a default position size, leverage, or
   threshold is a product decision. Surface it in the PR explicitly; do not slip
   it in alongside a refactor.
3. **Paper-trade paths and live paths must stay distinguishable.** Do not
   collapse a dry-run branch into the live one "to reduce duplication".
4. **Every threshold change needs a test that pins the new number**, so the next
   refactor cannot drift it silently.
5. **Money maths is integer-or-decimal-careful.** Watch rounding direction on
   position sizing — round *down* into a position, never up.

## Where the logic lives

### `packages/investing`

| Directory | What it owns |
| --- | --- |
| `trading-agents/` | The analyst agent graph — `agents/`, `tools/`, `graph/`, and its own `README.md`. Start there. |
| `debate-research/` | Bull vs. Bear: prompts (`prompts/`), memory, LLM fan-out (`llms.js`), FX normalization, health checks |
| `algo-stategies/` | Entry/exit strategy definitions (`algo-strategies.json`) and the TradingView scraper |
| `alpaca/` | Broker client and the Alpaca MCP client — the execution edge |
| `leaders/` | Copy-trading leaderboards: ZuluTrade (`zulu.ts`), NVSTly (`nvsty-leaders.ts`) |
| `live-data/` | Dukascopy price/FX feed and its symbol table |
| `correlate/` | Time-series correlation between instruments |
| `stocks/`, `stock-names-data/` | Instrument metadata and name resolution |
| `prediction/` | Prediction-market sync, analysis, API and its own D1 tables |
| `qwksearch/`, `trending-topics/` | News and web research feeding the news analyst |
| `llm/` | Provider calls shared by the agents |

The debate suite has its own script because it is slow and network-shaped:

```bash
cd packages/investing && bun run test:debate
```

### `packages/predictos`

Prediction-market intelligence, adapted from PredictionXBT/PredictOS (MIT — keep
the attribution intact).

| File / directory | What it owns |
| --- | --- |
| `agents/bookmaker-agent.ts` | Pricing a market like a book |
| `agents/event-analysis-agent.ts` | Reading an event's resolution criteria |
| `agents/mapper-agent.ts` | Mapping equivalent markets across venues — the precondition for arbitrage |
| `agents/polymarket-*.ts` | Position tracking, order placement, the up/down 15-minute limit bot |
| `clients/`, `data/` | Polymarket, Kalshi, Polyfactual, x402 |
| `arbitrage.ts` | Cross-platform arbitrage |
| `ai/` | Grok / OpenAI / BlockRun calls and their prompts |

Venue semantics differ (tick size, fee model, resolution rules, settlement
timing). A mapper that treats two markets as equivalent when they are not turns
"arbitrage" into a directional bet — treat `mapper-agent.ts` as safety-critical.

## Prior art: `third-party-trading-bots/`

Vendored, unbuilt, undeployed reference implementations — how other people size
positions, batch LLM calls, gate on liquidity, and normalize venue APIs. Its
`README.md` summarizes what each bot is worth studying for. Read it when you are
about to invent one of those wheels. Do not edit it, import from it, lint it, or
wire it into the build.

## Disclosure

This is research tooling, not investment advice, and the published docs say so
(`content/docs/reference/risk-disclosure`). Do not write copy in the UI or docs
that implies guaranteed returns or removes that framing.
