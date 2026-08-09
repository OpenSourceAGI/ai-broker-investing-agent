/**
 * Test script to inspect the Polymarket Analytics dashboard API response
 * Run with: npx tsx inspect_holders_api.ts
 */

import fetch from "node-fetch";

async function fetchMarketsDashboard(eventId: string) {
  const resp = await fetch(
    "https://polymarketanalytics.com/api/markets-dashboard",
    {
      method: "POST",
      headers: {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.9",
        "content-type": "application/json",
      },
      body: JSON.stringify({ eventId }),
    },
  );

  if (!resp.ok) {
    throw new Error(`Dashboard API error: ${resp.status}`);
  }
  return await resp.json();
}

async function main() {
  // Use a known market event ID for testing
  // Let's use a popular market - you can find event IDs from polymarket.com URLs
  const testEventId = "will-donald-trump-win-the-2024-us-presidential-election"; // Example event slug

  console.log(`Fetching dashboard data for event: ${testEventId}`);

  try {
    const data = await fetchMarketsDashboard(testEventId);

    console.log("\n=== Dashboard API Response Structure ===");
    console.log("Available keys:", Object.keys(data));

    if (data.holders) {
      console.log("\n=== Holders Data ===");
      console.log(`Total holders: ${data.holders.length}`);

      if (data.holders.length > 0) {
        console.log("\nFirst holder structure:");
        console.log(JSON.stringify(data.holders[0], null, 2));

        console.log("\nSample of first 5 holders:");
        data.holders.slice(0, 5).forEach((holder: any, index: number) => {
          console.log(
            `${index + 1}. ${holder.userName || holder.address || "Unknown"} - ` +
              `Outcome: ${holder.outcome || holder.side || "N/A"} - ` +
              `Value: ${holder.value || holder.volume || 0}`,
          );
        });
      }
    } else {
      console.log("\nNo holders data found in response");
    }

    // Check if holders are separated by outcome
    if (data.yesHolders || data.noHolders) {
      console.log("\n=== Holders separated by outcome ===");
      if (data.yesHolders) {
        console.log(`Yes holders: ${data.yesHolders.length}`);
      }
      if (data.noHolders) {
        console.log(`No holders: ${data.noHolders.length}`);
      }
    }
  } catch (error: any) {
    console.error("Error:", error.message);
  }
}

main();
