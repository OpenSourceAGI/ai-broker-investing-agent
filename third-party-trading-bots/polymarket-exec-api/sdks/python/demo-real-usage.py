#!/usr/bin/env python3
"""
Real demo script showing MarketList.match() with actual PMXT data.

This script:
1. Fetches real markets from Polymarket
2. Searches for markets related to Oscars 2026
3. Uses markets.match() to find "One Battle"

Prerequisites:
- PMXT server must be running (pmxt-server)

Usage:
    python demo-real-usage.py
"""

import sys
from pmxt import Polymarket, MarketList

def main():
    print("=== Real PMXT MarketList.match() Demo ===\n")

    # Initialize Polymarket client (will auto-start server if needed)
    polymarket = Polymarket()

    print("Fetching markets from Polymarket...")
    try:
        markets = polymarket.fetch_markets(limit=100)
    except Exception as e:
        print(f"Error fetching markets: {e}")
        print("\nNote: Make sure PMXT server is running:")
        print("  pmxt-server")
        print("\nOr use the demo with mocked data:")
        print("  python demo-usage.py")
        sys.exit(1)

    print(f"Fetched {len(markets)} markets\n")

    # Search for Oscars-related markets
    print("--- Filtering for Oscars 2026 markets ---\n")
    oscars_markets = [
        m for m in markets
        if ("oscars" in m.title.lower() or "best picture" in m.title.lower())
        and ("2026" in m.title.lower() or m.title.lower().count("20") > 0)
    ]

    if not oscars_markets:
        # Fall back to any markets mentioning Best Picture
        oscars_markets = [m for m in markets if "best picture" in m.title.lower()]

    if not oscars_markets:
        print("No Oscars markets found. Using first 20 markets instead...\n")
        oscars_markets = markets[:20]

    # Convert to MarketList to enable match() method
    market_list = MarketList(oscars_markets)

    print(f"Found {len(market_list)} relevant markets\n")

    # Show first 10 markets
    print("Sample markets:")
    for i, market in enumerate(market_list[:10], 1):
        print(f"  {i}. {market.title[:70]}")

    if len(market_list) > 10:
        print(f"  ... and {len(market_list) - 10} more")

    # Try to find "One Battle"
    print("\n--- Using market_list.match('One Battle') ---\n")
    try:
        market = market_list.match("One Battle")
        print(f"✓ Found: {market.title}")
        print(f"  Market ID: {market.market_id}")
        print(f"  Volume 24h: ${market.volume_24h:,.0f}")
        print(f"  Liquidity: ${market.liquidity:,.0f}")
        if market.yes:
            print(f"  Yes price: {market.yes.price:.4f}")
        if market.no:
            print(f"  No price: {market.no.price:.4f}")
    except ValueError as e:
        print(f"✗ Match failed: {e}\n")

        # Try partial matches
        print("--- Trying partial matches ---\n")
        for search_term in ["Battle", "One", "Dune", "Best Picture", "Best"]:
            try:
                market = market_list.match(search_term)
                print(f"✓ Found '{search_term}': {market.title}")
                break
            except ValueError as ve:
                if "Multiple" in str(ve):
                    print(f"⚠ '{search_term}' matches multiple markets")
                    break

    # Demonstrate array operations
    print("\n--- Demonstrating array operations ---\n")
    print(f"market_list[0].title: {market_list[0].title[:60]}...")
    print(f"len(market_list): {len(market_list)}")

    # Filter by volume
    high_volume = [m for m in market_list if m.volume_24h > 10000]
    print(f"Markets with 24h volume > $10k: {len(high_volume)}")

    # Map titles
    titles = [m.title[:40] for m in market_list[:5]]
    print(f"First 5 market titles (shortened):")
    for title in titles:
        print(f"  - {title}...")

    print("\n=== Demo Complete ===\n")

if __name__ == "__main__":
    main()
