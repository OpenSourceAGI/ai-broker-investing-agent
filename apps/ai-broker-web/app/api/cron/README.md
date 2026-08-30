# Cloudflare Worker Cron Jobs

This directory contains cron job endpoints that are triggered by Cloudflare Workers scheduled events and routed through `apps/ai-broker-web/worker/index.ts`.

## Setup

### 1. Environment Variables

Set the shared cron secret as a Cloudflare Worker secret:

```bash
wrangler secret put CRON_SECRET
```

Generate a secure random string for `CRON_SECRET`:

```bash
openssl rand -base64 32
```

### 2. Cloudflare Configuration

Cron schedules are configured in `apps/ai-broker-web/wrangler.jsonc` under `triggers.crons`. The Worker `scheduled` handler maps each cron expression to the matching API route and forwards `Authorization: Bearer <CRON_SECRET>`.

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

Run the vinext dev server and call cron routes with `curl`:

```bash
# With authentication (requires valid CRON_SECRET)
curl -H "Authorization: Bearer your_cron_secret_here" http://localhost:3000/api/cron/sync-markets

# Or with user authentication (requires login)
curl -H "Cookie: your_session_cookie" http://localhost:3000/api/cron/sync-markets
```

You can also verify configured schedules with Wrangler:

```bash
wrangler dev --test-scheduled
```

## Monitoring

View cron job logs with Cloudflare Workers observability:
- **Cloudflare Dashboard:** Workers & Pages → `ai-broker-investing-agent` → Logs / Observability
- **CLI tailing:** `wrangler tail ai-broker-investing-agent`

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

- Scheduled events run in the Worker runtime and are dispatched through the vinext App Router handler.
- Keep each scheduled route within Cloudflare Worker CPU/runtime limits for your plan.
- If a job needs additional bindings, add them to `wrangler.jsonc` and regenerate types with `npm run cf-typegen`.

## Adding New Cron Jobs

1. Create a new route handler in this directory (for example, `sync-example/route.ts`).
2. Implement authentication using the existing `CRON_SECRET` pattern.
3. Add the cron expression to `triggers.crons` in `apps/ai-broker-web/wrangler.jsonc`.
4. Add the expression-to-route mapping in `apps/ai-broker-web/worker/index.ts`.
5. Deploy with `npm run deploy`.

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
