import pmxt
from pmxt.models import MarketFilterCriteria

def main():
    print("--- Advanced Filtering Example ---")
    
    # Initialize without auth for public data
    try:
        api = pmxt.Polymarket()
    except Exception as e:
        print(f"Error initializing client: {e}")
        return
    
    print("\n1. Fetching markets for 'Trump'...")
    try:
        markets = api.fetch_markets(query="Trump")
        print(f"Found {len(markets)} markets.")
    except Exception as e:
        print(f"Error fetching markets: {e}")
        return
    
    if not markets:
        print("No markets found to filter.")
        return

    # Example 1: Simple text filter on local results
    print("\n2. Filtering for 'Approve' (text search)...")
    filtered = api.filter_markets(markets, "Approve")
    print(f"Result: {len(filtered)} markets")
    if filtered:
        print(f"Sample: {filtered[0].title}")

    # Example 2: Structured Criteria
    print("\n3. Filtering by Volume > $500...")
    criteria: MarketFilterCriteria = {
        "volume_24h": {"min": 500}
    }
    high_volume = api.filter_markets(markets, criteria)
    print(f"Result: {len(high_volume)} markets")
    if high_volume:
        print(f"Sample: {high_volume[0].title} (Vol: ${high_volume[0].volume_24h})")

    # Example 3: Complex Criteria
    print("\n4. Filtering for 'Yes' price < 0.99 and Liquidity > $100...")
    complex_criteria: MarketFilterCriteria = {
        "liquidity": {"min": 100},
        "price": {"outcome": "yes", "max": 0.99}
    }
    bargains = api.filter_markets(markets, complex_criteria)
    print(f"Result: {len(bargains)} markets")
    if bargains:
        for m in bargains[:3]:
             print(f"Sample: {m.title} (Yes: {m.yes.price if m.yes else 'N/A'}, Liq: {m.liquidity})")

    # Example 4: Custom Predicate Function
    print("\n5. Custom predicate: Only binary markets (2 outcomes)...")
    binary_markets = api.filter_markets(markets, lambda m: len(m.outcomes) == 2)
    print(f"Result: {len(binary_markets)} markets")
    if binary_markets:
        print(f"Sample: {binary_markets[0].title} (Outcomes: {len(binary_markets[0].outcomes)})")

    # Events Filtering
    print("\n\n--- Event Filtering ---")
    print("Fetching events for 'Election'...")
    try:
        events = api.fetch_events(query="Election")
        print(f"Found {len(events)} events.")
        
        if events:
            print("\n6. Filtering events with > 2 markets...")
            large_events = api.filter_events(events, lambda e: len(e.markets) > 2)
            print(f"Result: {len(large_events)} events")
            if large_events:
                print(f"Sample: {large_events[0].title} (Markets: {len(large_events[0].markets)})")
    except Exception as e:
        print(f"Error filtering events: {e}")

if __name__ == "__main__":
    main()
