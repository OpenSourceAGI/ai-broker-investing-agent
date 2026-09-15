# Scripts

Collection of utility scripts for the AI Broker Investing Agent.

## Sync High-Volume Polymarket Markets

Scrapes all active Polymarket markets with volume above a specified threshold and stores their historical price data in the database.

### Usage

#### Using npm script (recommended):

```bash
npm run sync:high-volume-markets [minVolume] [interval]
```

#### Using tsx directly:

```bash
npx tsx scripts/sync-high-volume-markets.ts [minVolume] [interval]
```

#### Using API endpoint:

```bash
curl -X POST http://localhost:3000/api/polymarket/markets/sync-high-volume \
  -H "Content-Type: application/json" \
  -d '{"minVolume": 100000, "interval": "1h"}'
```

### Parameters

- **minVolume** (optional): Minimum 24-hour volume in USD to filter markets
  - Default: `100000` ($100k)
  - Example: `200000` for markets with $200k+ volume

- **interval** (optional): Time interval for price history data
  - Default: `1h` (1-hour intervals)
  - Options: `1h`, `1d`, `max`

### Examples

```bash
# Sync all markets with volume >= $100k (default)
npm run sync:high-volume-markets

# Sync markets with volume >= $200k with 1-hour intervals
npm run sync:high-volume-markets 200000 1h

# Sync markets with volume >= $50k with daily intervals
npm run sync:high-volume-markets 50000 1d
```

### What it does

1. Fetches all active markets from Polymarket API
2. Filters markets by 24-hour volume (>= minVolume)
3. Saves filtered markets to the database
4. For each market with token IDs:
   - Fetches historical price data from Polymarket CLOB API
   - Stores price points in the database
5. Returns summary with counts and duration

### Output

The script will output:
- Number of markets synced
- Number of price data points saved
- Success/failure counts for price history
- Total duration
- Detailed progress logs

### Database Tables

This script populates the following tables:
- `polymarket_markets` - Market metadata (question, volume, tags, etc.)
- `polymarket_price_history` - Historical price data points (timestamp, price, interval)

### Performance

- Fetching all markets: ~5-10 seconds
- Price history per market: ~1-2 seconds each
- Total time depends on number of markets (e.g., 100 markets ≈ 2-3 minutes)

### Error Handling

- Failed price history fetches are logged but don't stop the sync
- Partial success is reported (e.g., "95/100 markets synced")
- API errors return detailed error messages
