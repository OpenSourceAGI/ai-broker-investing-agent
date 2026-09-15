#!/usr/bin/env tsx
/**
 * Verify the Cloudflare D1 connection used outside Workers.
 *
 * Workers reach D1 through the `DB` binding; scripts reach the same database
 * over Cloudflare's REST API. This checks the REST path end to end.
 *
 * Usage: npx tsx scripts/debug-db-connection.ts
 */

import { config } from 'dotenv'
config({ path: '.env' })
config({ path: '../../.env' })

import {
  createD1HttpDriver,
  getD1HttpCredentials,
} from '../../../packages/investing/src/db/d1-http'

async function testConnection() {
  console.log('Testing Cloudflare D1 connection over the REST API...\n')

  const credentials = getD1HttpCredentials()

  console.log(`   CLOUDFLARE_ACCOUNT_ID:  ${process.env.CLOUDFLARE_ACCOUNT_ID ? '✓ set' : '✗ not set'}`)
  console.log(`   CLOUDFLARE_D1_TOKEN:    ${process.env.CLOUDFLARE_D1_TOKEN || process.env.CLOUDFLARE_API_TOKEN ? '✓ set' : '✗ not set'}`)
  console.log(`   CLOUDFLARE_DATABASE_ID: ${credentials?.databaseId ?? '✗ unresolved'}\n`)

  if (!credentials) {
    console.error(
      'Missing credentials. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_D1_TOKEN\n' +
        '(and optionally CLOUDFLARE_DATABASE_ID) to query D1 from outside Workers.',
    )
    process.exit(1)
  }

  const query = createD1HttpDriver(credentials)

  try {
    const tables = await query(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      [],
      'all',
    )
    const names = (tables.rows as unknown[][]).map((row) => String(row[0]))
    console.log(`✓ Connected. ${names.length} tables:\n`)
    for (const name of names) console.log(`   - ${name}`)
  } catch (error) {
    console.error('✗ Connection failed:', error)
    process.exit(1)
  }
}

testConnection()
