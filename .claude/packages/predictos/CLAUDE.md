# CLAUDE.md — `predictos`

Published to npm. Prediction-market "super intelligence": multi-agent market
analysis, venue clients, and cross-platform arbitrage.

Adapted from [PredictOS](https://github.com/PredictionXBT/PredictOS) by
PredictionXBT (MIT, © 2025), refactored from Deno/Supabase edge functions into
Node/TypeScript ESM. **Keep the upstream attribution and license intact** in
`README.md` and the source headers.

Read [`../../architecture/trading.md`](../../architecture/trading.md)
before changing anything on an order path.

## Public surface

| Entry | What it gives you |
| --- | --- |
| `predictos` | The barrel |
| `predictos/agents` | Bookmaker, event analysis, mapper, Polymarket position/order bots |
| `predictos/arbitrage` | Cross-platform arbitrage |
| `predictos/data/polymarket`, `predictos/data/kalshi` | Venue market data |
| `predictos/ai` | Grok / OpenAI / BlockRun calls and prompts |

## Safety-critical: `agents/mapper-agent.ts`

Arbitrage is only arbitrage if the two markets really are the same bet. Venues
differ on tick size, fee model, resolution criteria and settlement timing — a
mapper that calls two markets equivalent when they are not turns a hedge into a
naked directional position. Changes here need explicit tests for the
near-miss cases, not just the happy path.

## Layout

| Path | Owns |
| --- | --- |
| `agents/bookmaker-agent.ts` | Prices a market like a book |
| `agents/event-analysis-agent.ts` | Reads an event's resolution criteria |
| `agents/mapper-agent.ts` | Cross-venue market equivalence |
| `agents/polymarket-position-tracker.ts` | Open position state |
| `agents/polymarket-put-order.ts`, `agents/polymarket-updown-15-limit-order-bot.ts` | Order placement |
| `agents/polyfactual-research.ts`, `clients/polyfactual.ts` | Research feed |
| `clients/x402.ts`, `agents/x402-seller.ts` | x402 payments |
| `data/` | Polymarket and Kalshi market data |
| `events.ts`, `types.ts` | Shared event and type definitions |

## Commands

```bash
cd packages/predictos
bun run test        # vitest
bun run typecheck
bun run build       # rebuild before consumers see your change
```
