import { NextRequest, NextResponse } from "next/server";
import { db } from "@/packages/investing/src/db";
import { polymarketMarkets } from "@/packages/investing/src/db/schema";
import {
  fetchMarketsDashboard,
  fetchMarketDetails,
  saveHolders,
} from "@/packages/investing/src/prediction";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

/**
 * POST /api/polymarket/holders/sync-all
 * Syncs holders data for all active markets
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { maxMarkets = 100 } = body;

    const startTime = Date.now();

    // Get all active markets from the database
    const markets = await db
      .select()
      .from(polymarketMarkets)
      .where(eq(polymarketMarkets.active, true))
      .orderBy(desc(polymarketMarkets.volume24hr))
      .limit(maxMarkets);

    console.log(`Found ${markets.length} active markets to sync holders for`);

    let successCount = 0;
    let failCount = 0;
    let totalHolders = 0;

    for (const market of markets) {
      try {
        // Try to get market details to find the event ID
        const details = await fetchMarketDetails(market.id);
        let eventId = null;

        if (details && details.events && details.events.length > 0) {
          eventId = details.events[0].id;
        }

        if (!eventId) {
          console.log(`Skipping market ${market.id} - no event ID found`);
          failCount++;
          continue;
        }

        // Fetch dashboard data which includes holders
        const dashboardData = await fetchMarketsDashboard(eventId);

        if (dashboardData) {
          let allHolders: any[] = [];

          // Handle different response formats
          if (dashboardData.holders && Array.isArray(dashboardData.holders)) {
            // Single array of holders
            allHolders = dashboardData.holders;
          } else if (dashboardData.yesHolders || dashboardData.noHolders) {
            // Separate arrays for Yes and No holders
            const yesHolders = (dashboardData.yesHolders || []).map(
              (h: any) => ({
                ...h,
                outcome: "Yes",
              }),
            );
            const noHolders = (dashboardData.noHolders || []).map((h: any) => ({
              ...h,
              outcome: "No",
            }));
            allHolders = [...yesHolders, ...noHolders];
          }

          if (allHolders.length > 0) {
            await saveHolders(market.id, allHolders);
            successCount++;
            totalHolders += allHolders.length;
            console.log(
              `Synced ${allHolders.length} holders for market ${market.question.substring(0, 60)}...`,
            );
          } else {
            console.log(`No holders data for market ${market.id}`);
            failCount++;
          }
        } else {
          console.log(`No dashboard data for market ${market.id}`);
          failCount++;
        }

        // Add a small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error: any) {
        console.error(`Error syncing holders for market ${market.id}:`, error);
        failCount++;
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    return NextResponse.json({
      success: true,
      marketsProcessed: markets.length,
      successCount,
      failCount,
      totalHolders,
      duration: `${duration}s`,
    });
  } catch (error: any) {
    console.error("Error in /api/polymarket/holders/sync-all:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
