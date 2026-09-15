# Auth configuration on Cloudflare Workers

`POST /api/auth/sign-in/social` returning **500** in production is almost always
one of the two configuration problems below. Neither fails at boot, so the
Worker deploys cleanly and only the sign-in request errors.

## 1. Google credentials must reach the Worker

better-auth keeps a social provider that was configured with blank credentials
in its provider list, then throws a plain `BetterAuthError` out of
`createAuthorizationURL`. better-call reports that as an opaque 500 with no body
worth reading, which is exactly what the Workers log shows.

`lib/auth/index.ts` now resolves its configuration through
`serverEnv()` (`lib/env/runtime.ts`), which reads the Worker `env` first and
falls back to `process.env`. Secrets set with `wrangler secret put` are only
guaranteed to be on the Worker `env` — `process.env` mirrors them under
`nodejs_compat`, but nothing in the build guarantees that mirror exists, and it
never exists in the Node scripts that import the same modules.

Google sign-in is registered only when both credentials resolve. When they do
not, the endpoint answers with better-auth's own "Provider not found" instead of
a 500, and the Worker logs say which variable is missing.

Required secrets:

```bash
cd apps/ai-broker-web
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret list   # confirm
```

`NEXT_PUBLIC_APP_URL` is a plain `var` in `wrangler.jsonc`. It is what
better-auth uses for `baseURL`, `trustedOrigins`, and the SIWE domain, so the
Google OAuth redirect URI registered in Google Cloud Console must be
`https://autoinvestment.broker/api/auth/callback/google`.

## 2. Migrations must be applied to the remote D1 database

`bun run deploy` ships code only. Applying migrations is a **separate** step, and
skipping it leaves the deployed Drizzle schema describing columns the live
database does not have. Every better-auth query naming a missing column fails,
which surfaces as a 500 from whichever auth endpoint touched that table — the
OAuth callback writing to `accounts` is the usual one.

Always run migrations before (or immediately after) a deploy that changes
`lib/db/schema.ts`:

```bash
cd apps/ai-broker-web
bun run db:migrate:remote
wrangler d1 migrations list ai-broker-db --remote   # confirm nothing is pending
```

To check the live schema directly:

```bash
wrangler d1 execute ai-broker-db --remote \
  --command "SELECT name FROM d1_migrations ORDER BY id"
```
