# Vercel Cron Jobs

This directory contains cron job endpoints that are automatically triggered by Vercel's cron scheduler.

## Setup

### 1. Environment Variables

Add the following to your Vercel project environment variables:

```bash
CRON_SECRET=your_random_secret_here
```

Generate a secure random string for the CRON_SECRET:
```bash
openssl rand -base64 32
```

### 2. Vercel Configuration

The cron jobs are configured in [vercel.json](../../../vercel.json) at the project root.

## Available Cron Jobs

### `/api/cron/sync-markets` - Polymarket Data Sync

**Schedule:** Every 15 minutes (`*/15 * * * *`)

**Purpose:** Incrementally syncs the top 1000 high volume Polymarket prediction markets

**What it does:**
- Fetches the top 1000 markets sorted by 24h volume
- Updates or inserts market data (upsert operation)
- Syncs price history for each market
- Syncs top holders for each market
- Automatically categorizes markets with categories and subcategories

**Features:**
- Non-destructive: Updates existing markets without deleting
- Batch processing: Processes price history (batches of 50) and holders (batches of 20)
- Error resilient: Continues even if individual markets fail
- Automatic categorization: Assigns categories (Politics, Sports, Crypto, etc.) and subcategories
- Rate limit protection: 2-second delays between holder batches

### `/api/cron/refresh-quotes` - Stock Quote Cache Refresh

**Schedule:** Every 5 minutes (`*/5 * * * *`)

**Purpose:** Refreshes stock quotes for ~35 popular symbols to keep cache fresh

**What it does:**
- Fetches real-time quotes for popular stocks (AAPL, MSFT, GOOGL, SPY, etc.)
- Updates quote cache with fresh data
- Ensures frequently accessed stocks have up-to-date prices
- Cache TTL: 5 minutes

**Features:**
- Fast execution: ~2-5 seconds typical
- Popular symbols: Tech giants, major ETFs, financials, and more
- Force fresh data: Bypasses cache to ensure latest prices
- Multiple sources: Uses unified quote service with fallback providers

### `/api/cron/sync-polymarket` - Leaders and Categories

**Schedule:** Not yet configured (manual trigger only)

**Purpose:** Syncs Polymarket leaderboard and category data

## Testing Locally

You can test cron jobs locally using curl:

```bash
# With authentication (requires valid CRON_SECRET)
curl -H "Authorization: Bearer your_cron_secret_here" http://localhost:3000/api/cron/sync-markets

# Or with user authentication (requires login)
curl -H "Cookie: your_session_cookie" http://localhost:3000/api/cron/sync-markets
```

## Monitoring

View cron job logs in:
- **Vercel Dashboard:** Go to your project → Deployments → Select deployment → Functions → Select function
- **Real-time logs:** Use `vercel logs` CLI command

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
  - Valid `Authorization: Bearer <CRON_SECRET>` header (for automated jobs)
  - Valid user session (for manual triggers)
- Never commit CRON_SECRET to version control
- Rotate CRON_SECRET regularly

## Limitations

- **Vercel Free/Hobby:** Cron jobs are not available
- **Vercel Pro:** Up to 2 cron jobs
- **Vercel Enterprise:** Unlimited cron jobs
- **Timeout:** Max execution time is 300 seconds (5 minutes) on Pro
- **Concurrency:** Cron jobs don't run concurrently by default

## Adding New Cron Jobs

1. Create a new route handler in this directory (e.g., `sync-example/route.ts`)
2. Implement authentication check using CRON_SECRET pattern
3. Add the endpoint to [vercel.json](../../../vercel.json):
   ```json
   {
     "crons": [
       {
         "path": "/api/cron/sync-example",
         "schedule": "0 * * * *"
       }
     ]
   }
   ```
4. Deploy to Vercel

## Cron Schedule Format

The schedule uses standard cron syntax:

```
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
- `0 0 * * *` - Every day at midnight
- `0 */6 * * *` - Every 6 hours
