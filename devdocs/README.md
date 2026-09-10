# Developer notes

Internal engineering notes for `ai-broker-investing-agent`. These are working
documents — implementation summaries, operational runbooks, and open questions.

For the published, user-facing documentation see
[`apps/ai-broker-web/content/docs`](../apps/ai-broker-web/content/docs), which is
served at <https://docs.autoinvestment.broker/>.

## Where things belong

| If it is… | It goes in… |
| --- | --- |
| A guide someone outside the team would read | `apps/ai-broker-web/content/docs` |
| How a workspace is used or built | That workspace's own `README.md` |
| An implementation note, runbook, or decision record | Here |

## Index

### Operations

- [Auth configuration](./AUTH_CONFIGURATION.md) — better-auth on Cloudflare
  Workers: bindings, cookies, and the OAuth callback origin.
- [Deployment checklist](./DEPLOYMENT_CHECKLIST.md) — pre-flight checks for the
  Polymarket cron job.
- [Sync scripts](./sync-scripts.md) — the maintenance scripts under
  `apps/ai-broker-web/scripts`, and how to run them.
- [High-volume sync guide](./HIGH_VOLUME_SYNC_GUIDE.md) — scraping and storing
  high-volume Polymarket markets.
- [Holder syncing](./HOLDER_SYNCING.md) — how top-holder data is fetched and
  batched.
- [Quote caching](./QUOTE_CACHING.md) — the stock-quote cache and its refresh
  path.

### Implementation notes

- [Implementation summary](./IMPLEMENTATION_SUMMARY.md) — Polymarket data sync
  with holders.
- [Error handling improvements](./ERROR_HANDLING_IMPROVEMENTS.md)
- [Initialization and usage](./initialization-and-usage.md)

### Planning

- [Todo](./todo.md) — open ideas and indicator research.

## Related

- [Deployment guide](https://docs.autoinvestment.broker/docs/deployment)
- [Scheduled jobs](https://docs.autoinvestment.broker/docs/deployment/scheduled-jobs)
- [Cron routes README](../apps/ai-broker-web/app/api/cron/README.md)
