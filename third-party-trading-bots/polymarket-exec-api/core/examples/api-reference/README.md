# API Reference Examples

One file per function. Each example is self-contained and demonstrates a single pmxt method.

## Structure

| Folder | Description |
|---|---|
| `market-data/` | Fetching markets, events, order books, trades, and OHLCV data |
| `trading/` | Placing, cancelling, and querying orders |
| `account/` | Balances and positions |
| `filtering/` | Client-side filtering of markets and events |
| `pricing/` | Execution price calculations from order book data |
| `streaming/` | WebSocket streaming (order books, trades) |
| `exchange-specific/` | Methods unique to a single exchange |
| `errors/` | Error handling patterns |

## Running

```bash
# From the core/ directory
npx ts-node examples/api-reference/market-data/fetchMarkets.ts

# Authenticated examples require a .env file in core/
npx ts-node examples/api-reference/trading/createOrder-limit.ts
```

## Authentication

Examples that require credentials use `dotenv` and expect a `.env` file at the repo root. Public data examples need no configuration.
