# Deployment Checklist - Polymarket Cron Job

Quick reference for deploying the Polymarket data sync cron job to Cloudflare Workers.

## Pre-Deployment

- [x] Cron endpoint: `apps/ai-broker-web/app/api/cron/sync-markets/route.ts`
- [x] Incremental sync function: `packages/investing/src/prediction/sync/incremental-markets.ts`
- [x] Exports added to prediction index
- [x] Schedule declared in `apps/ai-broker-web/wrangler.jsonc` (`triggers.crons`)
- [x] Schedule mapped to the route in `apps/ai-broker-web/worker/index.ts` (`CRON_ROUTES`)
- [x] Build successful ✅

Cloudflare cron triggers invoke the Worker's `scheduled()` handler rather than an
HTTP route, so a schedule only does something once it appears in **both**
`wrangler.jsonc` and `CRON_ROUTES`.

## Deployment Steps

### 1. Set the Worker secret

```bash
# Generate a secure secret
openssl rand -base64 32

# Store it on the Worker (prompts for the value)
cd apps/ai-broker-web
npx wrangler secret put CRON_SECRET
```

### 2. Apply migrations and deploy

```bash
npm run db:migrate:remote   # production D1 (ai-broker-db)
npm run deploy              # vinext build + vinext-cloudflare deploy
```

### 3. Verify the trigger is registered

Cloudflare Dashboard → Workers & Pages → `ai-broker-investing-agent` →
Settings → Trigger Events. The cron schedules from `wrangler.jsonc` should be listed
(`0 0 * * *` for `sync-markets`, `15 0 * * *` for `refresh-quotes`).

`npx wrangler deployments status` also reports the schedules on the active version.

### 4. Test the endpoint

```bash
# Replace with your values
CRON_SECRET="your_secret_here"
DOMAIN="autoinvestment.broker"

curl -H "Authorization: Bearer $CRON_SECRET" \
     https://$DOMAIN/api/cron/sync-markets
```

Expected response:
```json
{
  "success": true,
  "markets": 1000,
  "pricePoints": 45000,
  "priceHistoryUpdates": 950,
  "holders": 12500,
  "holderUpdates": 980,
  "duration": "85.42s",
  "message": "Successfully synced...",
  "cronJob": true,
  "timestamp": "2026-01-24T12:00:00.000Z"
}
```

The `scheduled()` handler only maps the schedule to this route and attaches the
`CRON_SECRET` header, so the curl above covers the work itself. `wrangler dev
--test-scheduled` does not help here — the deployed bundle is built with
`no_bundle`, so wrangler cannot inject its `/__scheduled` middleware. Confirm the
mapping after deploying, via the `Cron <route> -> 200` line in `wrangler tail`.

### 5. Monitor the first executions

```bash
npx wrangler tail
```

Or in the dashboard: Workers & Pages → the Worker → Logs (Workers Logs is enabled
via `observability` in `wrangler.jsonc`).

## Post-Deployment Verification

After the first scheduled run:

- [ ] Worker logs show `Cron /api/cron/sync-markets -> 200`
- [ ] D1 has updated market data (`npx wrangler d1 execute ai-broker-db --remote --command "select count(*) from polymarket_markets"`)
- [ ] Categories and subcategories are assigned
- [ ] Price history is being synced
- [ ] No errors in execution logs

## Rollback Plan

```bash
# Option 1: remove the schedule from wrangler.jsonc triggers.crons, then redeploy
npm run deploy

# Option 2: roll back to the previous Worker version
npx wrangler rollback

# Option 3: delete the secret so automated runs fail authentication
npx wrangler secret delete CRON_SECRET
```

## Important Notes

- **Plan**: cron triggers are available on the Workers Free plan (up to 5 schedules
  per Worker); D1 usage still follows its own plan limits.
- **CPU time**: scheduled invocations get up to 15 minutes of CPU time.
- **Frequency**: `sync-markets` runs daily at 00:00 UTC.
- **Data Volume**: syncs up to 1000 markets per run.
- **Non-Destructive**: updates existing data, doesn't delete.

## Quick Reference

| Item | Value |
|------|-------|
| Endpoint | `/api/cron/sync-markets` |
| Schedule | `0 0 * * *` (daily, 00:00 UTC) |
| Max Markets | 1000 |
| Method | GET |
| Auth | Bearer token (CRON_SECRET) |
| CPU limit | 15 min (scheduled handler) |

## Files Involved

- `apps/ai-broker-web/wrangler.jsonc` — `triggers.crons` schedules
- `apps/ai-broker-web/worker/index.ts` — `scheduled()` handler and `CRON_ROUTES`
- `apps/ai-broker-web/app/api/cron/sync-markets/route.ts` — cron endpoint
- `packages/investing/src/prediction/sync/incremental-markets.ts` — sync logic
- `packages/investing/src/prediction/index.ts` — export statement

## Documentation

- [Cron API Documentation](../apps/ai-broker-web/app/api/cron/README.md)
- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
