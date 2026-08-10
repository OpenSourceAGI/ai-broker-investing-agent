#!/usr/bin/env tsx

/**
 * Integration test script for Polymarket price history functionality
 *
 * This script tests:
 * 1. Fetching markets from Polymarket API
 * 2. Extracting token IDs from markets
 * 3. Fetching price history from API
 * 4. Syncing price history to database
 * 5. Retrieving price history from database
 * 6. Calculating price changes
 *
 * Run with: npx tsx scripts/test-polymarket-price-history.ts
 */

// Load environment variables
import { config } from 'dotenv'
config()

import {
  fetchMarkets,
  fetchPriceHistory,
  syncPriceHistory,
  getPriceHistory,
} from '../../../packages/investing/src/prediction/polymarket'
import { db } from '../../../packages/investing/src/db'
import { polymarketPriceHistory } from '../../../packages/investing/src/db/schema'
import { eq } from 'drizzle-orm'

async function testPolymarketPriceHistory() {
  console.log('🧪 Testing Polymarket Price History Functionality\n')

  let testTokenId: string

  try {
    // Step 0: Verify database connection
    console.log('🔌 Step 0: Verifying database connection...')
    console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? '✓ set' : '✗ not set'}`)
    console.log(`   DATABASE_AUTH_TOKEN: ${process.env.DATABASE_AUTH_TOKEN ? '✓ set' : '✗ not set'}`)

    try {
      // Test a simple query
      const result = await db.select().from(polymarketPriceHistory).limit(1)
      console.log('✅ Database connection verified')
      console.log(`   Found ${result.length} existing price history records`)
    } catch (error: any) {
      console.error('❌ Database connection failed')
      console.error(`   Error: ${error.message}`)

      if (error.message.includes('no such table')) {
        console.log('\n💡 Tip: The polymarket_price_history table does not exist')
        console.log('   Run: npm run db:push')
      } else if (error.message.includes('URL_SCHEME_NOT_SUPPORTED')) {
        console.log('\n💡 Tip: Database URL scheme not supported')
        console.log('   Make sure DATABASE_URL is set to a valid libsql:// URL')
      } else {
        console.log('\n💡 Tip: Check your database configuration and connection')
      }

      process.exit(1)
    }

    // Step 1: Fetch a market
    console.log('\n📊 Step 1: Fetching a test market...')
    const markets = await fetchMarkets(5, 'volume24hr')

    if (!markets || markets.length === 0) {
      console.error('❌ Failed: No markets found')
      process.exit(1)
    }

    console.log(`✅ Found ${markets.length} markets`)

    // Find a market with token IDs
    const market = markets.find((m: any) => m.clobTokenIds && m.clobTokenIds.length > 0)

    if (!market) {
      console.error('❌ Failed: No market with token IDs found')
      process.exit(1)
    }

    console.log('\n📍 Test Market:')
    console.log(`   ID: ${market.id}`)
    console.log(`   Question: ${market.question}`)
    console.log(`   clobTokenIds type: ${typeof market.clobTokenIds}`)
    console.log(`   clobTokenIds value: ${JSON.stringify(market.clobTokenIds)}`)
    console.log(`   24h Volume: $${Math.floor(market.volume24hr).toLocaleString()}`)

    // Parse clobTokenIds if it's a string
    let tokenIds = market.clobTokenIds
    if (typeof tokenIds === 'string') {
      try {
        tokenIds = JSON.parse(tokenIds)
      } catch (e) {
        console.error('❌ Failed to parse clobTokenIds:', e)
        process.exit(1)
      }
    }

    if (!Array.isArray(tokenIds) || tokenIds.length === 0) {
      console.error('❌ Failed: clobTokenIds is not a valid array')
      process.exit(1)
    }

    const tokenId = tokenIds[0]
    testTokenId = tokenId
    console.log(`   Token ID (parsed): ${tokenId}`)

    // Clean up any existing test data for this token
    console.log('\n🧹 Cleaning up existing test data...')
    try {
      const deleted = await db
        .delete(polymarketPriceHistory)
        .where(eq(polymarketPriceHistory.tokenId, tokenId))
      console.log('✅ Cleaned up existing data')
    } catch (error: any) {
      console.log('⚠️  Warning: Could not clean up existing data:', error.message)
    }

    // Step 2: Fetch price history from API
    console.log('\n📈 Step 2: Fetching price history from Polymarket API...')
    const apiResult = await fetchPriceHistory({
      market: tokenId,
      interval: '1h',
    })

    if (!apiResult || !apiResult.history || apiResult.history.length === 0) {
      console.error('❌ Failed: No price history returned from API')
      process.exit(1)
    }

    console.log(`✅ Fetched ${apiResult.history.length} price points from API`)
    console.log(`   First point: ${JSON.stringify(apiResult.history[0])}`)
    console.log(`   Last point: ${JSON.stringify(apiResult.history[apiResult.history.length - 1])}`)

    // Step 3: Sync to database
    console.log('\n💾 Step 3: Syncing price history to database...')
    const syncResult = await syncPriceHistory(tokenId, { interval: '1h' })

    if (!syncResult || syncResult.pricePoints === 0) {
      console.error('❌ Failed: No price points synced to database')
      process.exit(1)
    }

    console.log(`✅ Synced ${syncResult.pricePoints} price points to database`)

    // Step 4: Retrieve from database
    console.log('\n🔍 Step 4: Retrieving price history from database...')
    const dbHistory = await getPriceHistory(tokenId, { interval: '1h' })

    if (!dbHistory || dbHistory.length === 0) {
      console.error('❌ Failed: No price history found in database')
      process.exit(1)
    }

    console.log(`✅ Retrieved ${dbHistory.length} price points from database`)
    console.log(`   First point: timestamp=${dbHistory[0].timestamp}, price=${dbHistory[0].price}`)
    console.log(`   Last point: timestamp=${dbHistory[dbHistory.length - 1].timestamp}, price=${dbHistory[dbHistory.length - 1].price}`)

    // Step 5: Verify data structure
    console.log('\n🔬 Step 5: Verifying data structure...')
    const firstPoint = dbHistory[0]

    const requiredFields = ['tokenId', 'timestamp', 'price', 'interval']
    const missingFields = requiredFields.filter(field => !(field in firstPoint))

    if (missingFields.length > 0) {
      console.error(`❌ Failed: Missing required fields: ${missingFields.join(', ')}`)
      process.exit(1)
    }

    console.log('✅ All required fields present')
    console.log(`   tokenId: ${firstPoint.tokenId}`)
    console.log(`   interval: ${firstPoint.interval}`)

    // Step 6: Verify sorting (ascending by timestamp)
    console.log('\n📊 Step 6: Verifying timestamp sorting...')
    let isSorted = true
    for (let i = 1; i < dbHistory.length; i++) {
      if (dbHistory[i].timestamp < dbHistory[i - 1].timestamp) {
        isSorted = false
        break
      }
    }

    if (!isSorted) {
      console.error('❌ Failed: Data not sorted by timestamp ascending')
      process.exit(1)
    }

    console.log('✅ Data correctly sorted by timestamp (ascending)')

    // Step 7: Calculate price changes
    console.log('\n💹 Step 7: Calculating price changes...')
    const currentPrice = dbHistory[dbHistory.length - 1].price
    const now = Math.floor(Date.now() / 1000)

    // Find prices at different intervals
    const oneDayAgo = now - 24 * 60 * 60
    const oneWeekAgo = now - 7 * 24 * 60 * 60
    const oneMonthAgo = now - 30 * 24 * 60 * 60

    const findPriceAtTime = (targetTime: number) => {
      for (let i = dbHistory.length - 1; i >= 0; i--) {
        if (dbHistory[i].timestamp <= targetTime) {
          return dbHistory[i].price
        }
      }
      return null
    }

    const priceDay = findPriceAtTime(oneDayAgo)
    const priceWeek = findPriceAtTime(oneWeekAgo)
    const priceMonth = findPriceAtTime(oneMonthAgo)

    console.log('✅ Price change calculations:')
    console.log(`   Current: ${(currentPrice * 100).toFixed(1)}%`)

    if (priceDay !== null) {
      const dailyChange = ((currentPrice - priceDay) / priceDay) * 100
      console.log(`   Daily (24h): ${dailyChange >= 0 ? '+' : ''}${dailyChange.toFixed(1)}pp`)
    } else {
      console.log(`   Daily (24h): N/A (insufficient data)`)
    }

    if (priceWeek !== null) {
      const weeklyChange = ((currentPrice - priceWeek) / priceWeek) * 100
      console.log(`   Weekly (7d): ${weeklyChange >= 0 ? '+' : ''}${weeklyChange.toFixed(1)}pp`)
    } else {
      console.log(`   Weekly (7d): N/A (insufficient data)`)
    }

    if (priceMonth !== null) {
      const monthlyChange = ((currentPrice - priceMonth) / priceMonth) * 100
      console.log(`   Monthly (30d): ${monthlyChange >= 0 ? '+' : ''}${monthlyChange.toFixed(1)}pp`)
    } else {
      console.log(`   Monthly (30d): N/A (insufficient data)`)
    }

    // Step 8: Test interval filtering
    console.log('\n🔎 Step 8: Testing interval filtering...')
    const filtered1h = await getPriceHistory(tokenId, { interval: '1h' })

    const wrongInterval = filtered1h.some((point: any) => point.interval !== '1h')
    if (wrongInterval) {
      console.error('❌ Failed: Found points with wrong interval')
      process.exit(1)
    }

    console.log(`✅ Interval filtering works correctly (${filtered1h.length} points with interval='1h')`)

    // Cleanup: Remove test data
    console.log('\n🧹 Step 9: Cleaning up test data...')
    try {
      if (testTokenId) {
        await db
          .delete(polymarketPriceHistory)
          .where(eq(polymarketPriceHistory.tokenId, testTokenId))
        console.log('✅ Test data cleaned up')
      }
    } catch (error: any) {
      console.log('⚠️  Warning: Could not clean up test data:', error.message)
    }

    // Success!
    console.log('\n✨ All tests passed! Polymarket price history functionality is working correctly.\n')
    process.exit(0)

  } catch (error: any) {
    console.error('\n❌ Test failed with error:')
    console.error(error.message)
    console.error(error.stack)

    // Cleanup on error too
    try {
      if (testTokenId) {
        await db
          .delete(polymarketPriceHistory)
          .where(eq(polymarketPriceHistory.tokenId, testTokenId))
      }
    } catch (cleanupError) {
      // Ignore cleanup errors
    }

    process.exit(1)
  }
}

// Run the test
testPolymarketPriceHistory()
