#!/usr/bin/env tsx

import { config } from 'dotenv'
config()

import { createClient } from '@libsql/client'

async function testConnection() {
  console.log('Testing direct database connection...\n')

  const url = process.env.DATABASE_URL
  const authToken = process.env.DATABASE_AUTH_TOKEN

  console.log('Config:')
  console.log(`  URL: ${url}`)
  console.log(`  Auth Token: ${authToken ? '✓ set (' + authToken.substring(0, 20) + '...)' : '✗ not set'}\n`)

  try {
    const client = createClient({
      url: url || 'file:./local.db',
      authToken,
    })

    console.log('✓ Client created successfully\n')

    // Try a simple query
    console.log('Testing query: SELECT name FROM sqlite_schema WHERE type="table"')
    const result = await client.execute('SELECT name FROM sqlite_schema WHERE type="table"')

    console.log(`\n✓ Query succeeded! Found ${result.rows.length} tables:\n`)
    result.rows.forEach((row: any) => {
      console.log(`  - ${row.name}`)
    })

    // Check if polymarket_price_history exists
    const hasPriceHistory = result.rows.some((row: any) => row.name === 'polymarket_price_history')

    if (hasPriceHistory) {
      console.log('\n✓ polymarket_price_history table exists')

      // Try to select from it
      console.log('\nTesting: SELECT * FROM polymarket_price_history LIMIT 1')
      const priceResult = await client.execute('SELECT * FROM polymarket_price_history LIMIT 1')
      console.log(`✓ Query succeeded! Found ${priceResult.rows.length} rows`)
    } else {
      console.log('\n✗ polymarket_price_history table does NOT exist')
    }

  } catch (error: any) {
    console.error('\n✗ Error:', error.message)
    console.error(error.stack)
  }
}

testConnection()
