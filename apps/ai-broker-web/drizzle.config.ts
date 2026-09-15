import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// Local .env wins; the monorepo root .env is the shared fallback.
config({ path: '.env' })
config({ path: '../../.env' })

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const databaseId = process.env.CLOUDFLARE_DATABASE_ID || '37dbe79c-2687-4127-ad02-2372e15ac077' // ai-broker-db
const d1Token = process.env.CLOUDFLARE_D1_TOKEN || process.env.CLOUDFLARE_API_TOKEN

/**
 * Cloudflare D1 is the only database this app targets, reached over the d1-http
 * driver. `drizzle-kit generate` only needs the schema, so it works without
 * credentials; `push`/`studio` talk to D1 and require them.
 *
 * Migrations are applied with wrangler (uses migrations_dir from wrangler.jsonc):
 *   npm run db:migrate:local   # local miniflare D1 used by `vinext dev`/`preview`
 *   npm run db:migrate:remote  # production D1
 */
export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    accountId: accountId!,
    databaseId,
    token: d1Token!,
  },
})
