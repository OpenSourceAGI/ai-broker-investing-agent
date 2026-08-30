# Cloudflare Cron Triggers

This directory contains cron job endpoints driven by Cloudflare Workers
[cron triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

A trigger does not call an HTTP route by itself: it invokes the Worker's
`scheduled()` handler in [`worker/index.ts`](../../../worker/index.ts), which maps
each schedule to the route below and dispatches it through the same fetch handler,
carrying the `CRON_SECRET` bearer token these routes expect.

## Setup

### 1. Secret

```bash
# Generate a secure random string
openssl rand -base64 32

# Store it on the Worker
npx wrangler secret put CRON_SECRET
```

### 2. Schedules

Schedules live in [`wrangler.jsonc`](../../../wrangler.jsonc) under `triggers.crons`,
and the schedule → route mapping lives in `CRON_ROUTES` in `worker/index.ts`. Both
have to be updated together — a schedule with no mapped route logs a warning and
does nothing.

## Available Cron Jobs

### `/api/cron/sync-markets` - Polymarket Data Sync

**Schedule:** Daily at 00:00 UTC (`0 0 * * *`)

**Purpose:** Incrementally syncs the top 1000 high volume Polymarket prediction markets.

**What it does:**
- Fetches the top 1000 markets sorted by 24h volume
- Updates or inserts market data (upsert operation)
- Syncs price history for each market
- Syncs top holders for each market
- Automatically categorizes markets with categories and subcategories

**Features:**
- Non-destructive: Updates existing markets without deleting
- Batch processing: Processes price history and holders in batches
- Error resilient: Continues even if individual markets fail
- Automatic categorization: Assigns categories (Politics, Sports, Crypto, etc.) and subcategories
- Rate limit protection between holder batches

### `/api/cron/refresh-quotes` - Stock Quote Cache Refresh

**Schedule:** Daily at 00:15 UTC (`15 0 * * *`)

**Purpose:** Refreshes stock quotes for popular symbols to keep cache fresh.

**What it does:**
- Fetches real-time quotes for popular stocks (AAPL, MSFT, GOOGL, SPY, etc.)
- Updates quote cache with fresh data
- Ensures frequently accessed stocks have up-to-date prices
- Bypasses stale cache to ensure latest prices

**Features:**
- Fast execution: typically a few seconds
- Popular symbols: tech giants, major ETFs, financials, and more
- Multiple sources: uses unified quote service with fallback providers

### `/api/cron/sync-polymarket` - Leaders and Categories

**Schedule:** Not yet configured (manual trigger only)

**Purpose:** Syncs Polymarket leaderboard and category data.

## Testing Locally

Hit the route directly:

```bash
# With authentication (requires valid CRON_SECRET)
curl -H "Authorization: Bearer your_cron_secret_here" http://localhost:3000/api/cron/sync-markets

# Or with user authentication (requires login)
curl -H "Cookie: your_session_cookie" http://localhost:3000/api/cron/sync-markets
```

The `scheduled()` handler adds nothing but the schedule → route lookup and the
`CRON_SECRET` header, so exercising the route directly covers the work itself.
(`wrangler dev --test-scheduled` does not apply here: the deployed bundle is built
with `no_bundle`, so wrangler cannot inject its `/__scheduled` middleware — that
path falls through to the app and 404s.) To confirm the mapping end to end, deploy
and check `wrangler tail` for the `Cron <route> -> 200` line the handler logs.

## Monitoring

- **Dashboard:** Workers & Pages → the Worker → Logs (Workers Logs is enabled via
  `observability` in `wrangler.jsonc`); the Settings → Trigger Events tab lists
  cron run history.
- **Real-time logs:** `npx wrangler tail`

## Response Format

All cron jobs return a consistent JSON response:

```json
{
  "success": true,
  "markets": 1000,
  "pricePoints": 45000,
  "priceHistoryUpdates": 950,
  "holders": 12500,
  "holderUpdates": 980,
  "duration": "85.42s",
  "message": "Successfully synced 1000 markets...",
  "cronJob": true,
  "timestamp": "2026-01-24T12:00:00.000Z"
}
```

## Error Handling

If a cron job fails:

```json
{
  "success": false,
  "error": "Error message here",
  "cronJob": true,
  "timestamp": "2026-01-24T12:00:00.000Z"
}
```

## Security

- All cron endpoints require either:
  - Valid `Authorization: Bearer <CRON_SECRET>` header for scheduled jobs
  - Valid user session for manual triggers
- Never commit `CRON_SECRET` to version control
- Rotate `CRON_SECRET` regularly

## Cloudflare Worker Notes

- **Schedules per Worker:** up to 5 cron triggers.
- **Granularity:** schedules are evaluated in UTC and fire at most once per minute.
- **CPU time:** a scheduled invocation gets up to 15 minutes of CPU time, well above
  the 30s default for fetch handlers — but wall-clock work still has to fit the
  Worker's limits, so long syncs should batch.
- **Concurrency:** a trigger fires one invocation; overlapping runs are possible if a
  previous run has not finished.

## Adding New Cron Jobs

1. Create a new route handler in this directory (e.g., `sync-example/route.ts`).
2. Implement the authentication check using the CRON_SECRET pattern.
3. Add the schedule to [`wrangler.jsonc`](../../../wrangler.jsonc):
   ```jsonc
   "triggers": {
     "crons": ["0 0 * * *", "15 0 * * *", "0 * * * *"]
   }
   ```
4. Map it to the route in `CRON_ROUTES` in [`worker/index.ts`](../../../worker/index.ts):
   ```ts
   const CRON_ROUTES: Record<string, string> = {
     "0 * * * *": "/api/cron/sync-example",
   };
   ```
5. `npm run deploy`

## Cron Schedule Format

The schedule uses standard cron syntax:

```text
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6)
│ │ │ │ │
* * * * *
```

Examples:
- `*/15 * * * *` - Every 15 minutes
- `0 * * * *` - Every hour
- `0 0 * * *` - Every day at midnight UTC
- `0 */6 * * *` - Every 6 hours
