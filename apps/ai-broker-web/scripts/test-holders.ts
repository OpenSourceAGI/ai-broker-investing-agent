/**
 * Test script to fetch holders from Polymarket Data API
 * Run with: npx tsx scripts/test-holders.ts
 */

import { fetchMarketHolders } from "../../../packages/investing/src/prediction/api/analytics";
import { fetchMarketDetails } from "../../../packages/investing/src/prediction/api/analytics";

async function testHoldersFetch() {
  console.log("=== Testing Polymarket Holders API ===\n");

  // Test 1: Direct API call with known conditionId
  const testConditionId =
    "0xaf9d0e448129a9f657f851d49495ba4742055d80e0ef1166ba0ee81d4d594214";
  console.log(`1. Testing with conditionId: ${testConditionId}`);

  const holders = await fetchMarketHolders(testConditionId, 5);
  console.log(`   Found ${holders.length} token groups`);

  for (const tokenGroup of holders) {
    console.log(`\n   Token: ${tokenGroup.token.slice(0, 20)}...`);
    console.log(`   Holders: ${tokenGroup.holders.length}`);

    for (const holder of tokenGroup.holders.slice(0, 3)) {
      const outcome = holder.outcomeIndex === 0 ? "Yes" : "No";
      console.log(
        `     - ${holder.name || holder.pseudonym || holder.proxyWallet.slice(0, 10)} | ${outcome} | ${holder.amount.toLocaleString()} shares`,
      );
    }
  }

  // Test 2: Fetch conditionId from market details
  console.log("\n\n2. Testing conditionId fetch from Gamma API...");
  const testMarketId = "517310"; // Use a known market ID

  try {
    const marketDetails = await fetchMarketDetails(testMarketId);
    if (marketDetails) {
      console.log(`   Market: ${marketDetails.question || "Unknown"}`);
      console.log(`   ConditionId: ${marketDetails.conditionId || "Not found"}`);

      if (marketDetails.conditionId) {
        console.log("\n3. Fetching holders with retrieved conditionId...");
        const holders2 = await fetchMarketHolders(marketDetails.conditionId, 3);
        console.log(`   Found ${holders2.length} token groups`);

        let totalHolders = 0;
        for (const tokenGroup of holders2) {
          totalHolders += tokenGroup.holders.length;
        }
        console.log(`   Total holders: ${totalHolders}`);
      }
    } else {
      console.log("   Market details not found");
    }
  } catch (error) {
    console.error("   Error fetching market details:", error);
  }

  console.log("\n=== Test Complete ===");
}

testHoldersFetch().catch(console.error);
