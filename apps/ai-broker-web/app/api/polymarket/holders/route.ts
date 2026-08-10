import { NextRequest, NextResponse } from "next/server";
import { db } from "@/packages/investing/src/db";
import {
  polymarketHolders,
  polymarketMarkets,
} from "@/packages/investing/src/db/schema";
import {
  fetchMarketHolders,
  fetchMarketDetails,
  saveHolders,
} from "@/packages/investing/src/prediction";
import { eq, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // 30 second timeout

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const marketId = searchParams.get("marketId");
    const sync = searchParams.get("sync") === "true";

    if (!marketId) {
      return NextResponse.json(
        { success: false, error: "Market ID is required" },
        { status: 400 },
      );
    }

    console.log(`[Holders] Request for market ${marketId}, sync=${sync}`);

    // If sync is requested, fetch fresh data from Polymarket
    if (sync) {
      let allHolders: any[] = [];

      try {
        // Get the market's conditionId from database
        let conditionId: string | null = null;

        const [marketRecord] = await db
          .select({ conditionId: polymarketMarkets.conditionId })
          .from(polymarketMarkets)
          .where(eq(polymarketMarkets.id, marketId))
          .limit(1);

        conditionId = marketRecord?.conditionId || null;
        console.log(`[Holders] conditionId from DB: ${conditionId?.slice(0, 20) || 'null'}`);

        // If no conditionId in DB, try to fetch from Gamma API
        if (!conditionId) {
          console.log(`[Holders] Fetching conditionId from Gamma API...`);
          const marketDetails = await fetchMarketDetails(marketId);
          if (marketDetails?.conditionId) {
            conditionId = marketDetails.conditionId;
            console.log(`[Holders] Got conditionId: ${conditionId.slice(0, 20)}...`);
            // Update the database
            await db
              .update(polymarketMarkets)
              .set({ conditionId })
              .where(eq(polymarketMarkets.id, marketId));
          }
        }

        if (conditionId) {
          console.log(`[Holders] Fetching holders from Polymarket Data API...`);
          const holdersData = await fetchMarketHolders(conditionId, 20);
          console.log(`[Holders] Got ${holdersData?.length || 0} token groups`);

          if (holdersData && holdersData.length > 0) {
            // Transform holders data - group by outcome
            for (const tokenGroup of holdersData) {
              for (const holder of tokenGroup.holders) {
                const outcome = holder.outcomeIndex === 0 ? "Yes" : "No";
                allHolders.push({
                  address: holder.proxyWallet,
                  userName: holder.pseudonym || holder.name || null,
                  profileImage: holder.profileImageOptimized || holder.profileImage || null,
                  balance: holder.amount || 0,
                  value: holder.amount || 0,
                  outcome,
                });
              }
            }
            console.log(`[Holders] Transformed ${allHolders.length} holders`);
          }
        } else {
          console.log(`[Holders] No conditionId available, cannot fetch holders`);
        }

        // Save holders to database
        if (allHolders.length > 0) {
          await saveHolders(marketId, allHolders);
          console.log(`[Holders] Saved ${allHolders.length} holders to DB`);
        }
      } catch (error: any) {
        console.error(`[Holders] Error syncing:`, error.message);
      }
    }

    // Fetch holders from database
    const holders = await db
      .select()
      .from(polymarketHolders)
      .where(eq(polymarketHolders.marketId, marketId))
      .orderBy(asc(polymarketHolders.rank));

    console.log(`[Holders] Returning ${holders.length} holders from DB`);

    return NextResponse.json({
      success: true,
      holders,
    });
  } catch (error: any) {
    console.error("Error in /api/polymarket/holders:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
