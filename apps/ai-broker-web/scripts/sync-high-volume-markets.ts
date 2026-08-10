#!/usr/bin/env tsx

/**
 * Script to sync high-volume Polymarket markets and their historical price data
 *
 * Usage:
 *   npx tsx scripts/sync-high-volume-markets.ts [minVolume] [interval]
 *
 * Examples:
 *   npx tsx scripts/sync-high-volume-markets.ts
 *   npx tsx scripts/sync-high-volume-markets.ts 100000 1h
 *   npx tsx scripts/sync-high-volume-markets.ts 200000 1d
 */

const API_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

async function syncHighVolumeMarkets(minVolume: number = 100000, interval: string = '1h') {
  console.log('🚀 Starting high-volume markets sync...')
  console.log(`   Min Volume: $${minVolume.toLocaleString()}`)
  console.log(`   Interval: ${interval}`)
  console.log()

  try {
    const response = await fetch(`${API_URL}/api/polymarket/markets/sync-high-volume`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        minVolume,
        interval,
      }),
    })

    const data = await response.json()

    if (data.success) {
      console.log('✅ Sync completed successfully!')
      console.log()
      console.log(`📊 Results:`)
      console.log(`   Markets synced: ${data.markets}`)
      console.log(`   Price data points: ${data.pricePoints}`)
      console.log(`   Price history successful: ${data.priceHistorySuccess}`)
      console.log(`   Price history failed: ${data.priceHistoryFailed}`)
      console.log(`   Duration: ${data.duration}`)
      console.log()
      console.log(`💡 ${data.message}`)
    } else {
      console.error('❌ Sync failed:', data.error)
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Error during sync:', error)
    process.exit(1)
  }
}

// Parse command line arguments
const minVolume = process.argv[2] ? parseInt(process.argv[2]) : 100000
const interval = process.argv[3] || '1h'

// Validate arguments
if (isNaN(minVolume) || minVolume < 0) {
  console.error('❌ Invalid minVolume argument. Must be a positive number.')
  process.exit(1)
}

// Run the sync
syncHighVolumeMarkets(minVolume, interval)
  .catch((error) => {
    console.error('❌ Unhandled error:', error)
    process.exit(1)
  })
