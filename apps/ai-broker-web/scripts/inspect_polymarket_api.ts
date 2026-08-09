import {
  fetchMarkets,
  fetchMarketsDashboard,
} from "../../../packages/investing/src/prediction/polymarket";

async function main() {
  try {
    console.log("Fetching markets...");
    const markets = await fetchMarkets(1);
    if (!markets || markets.length === 0) {
      console.log("No markets found.");
      return;
    }

    const market = markets[0];
    console.log("Market[0]:", JSON.stringify(market, null, 2));

    // Try to find eventId
    // Polymarket API structure varies, sometimes it's in a different field
    // But fetchMarketsDashboard expects an eventId.
    // Looking at the code: fetchMarketsDashboard(eventId)

    // Let's assume we can get it from the market object if available,
    // or maybe the market object IS the event in some contexts?
    // Actually, usually markets belong to an event.

    // The previous code used market.events[0].slug. Use market.events[0].id?
    let eventId;
    if (market.events && market.events.length > 0) {
      eventId = market.events[0].id;
      console.log("Found eventId from market.events:", eventId);
    } else {
      console.log(
        "No events array in market, trying market.id as fallback (unlikely to work for dashboard if it expects eventId)",
      );
      eventId = market.id;
    }

    if (eventId) {
      console.log(`Fetching dashboard for eventId: ${eventId}...`);
      try {
        const dashboard = await fetchMarketsDashboard(eventId);
        console.log("Dashboard (by ID) Keys:", Object.keys(dashboard));
        if (dashboard.holders) console.log("Holders found by ID!");
      } catch (e) {
        console.log("Error by ID", e.message);
      }
    }

    if (market.slug) {
      console.log(`Fetching dashboard for slug: ${market.slug}...`);
      try {
        const dashboard2 = await fetchMarketsDashboard(market.slug);
        console.log("Dashboard (by slug) Keys:", Object.keys(dashboard2));
        if (dashboard2.holders) console.log("Holders found by slug!");
      } catch (e) {
        console.log("Error by slug", e.message);
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
