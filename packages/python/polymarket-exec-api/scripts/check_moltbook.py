#!/usr/bin/env python3
import sys
import os

# Ensure the SDK is in the path
sdk_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'sdks', 'python'))
if sdk_path not in sys.path:
    sys.path.append(sdk_path)

import pmxt

def main():
    try:
        # Initialize Polymarket client
        print("Initializing Polymarket client...")
        poly = pmxt.Polymarket()
        
        # 1. Sanity Check
        print("Running sanity check (searching for 'Bitcoin')...")
        btc_events = poly.fetch_events(query='Bitcoin')
        if btc_events:
            print(f"Sanity check passed: Found {len(btc_events)} Bitcoin events.")
        else:
            print("Sanity check failed: No Bitcoin events found. API might be limited or down.")

        print("-" * 30)

        # 2. Search Events for 'moltbook'
        query = 'moltbook'
        print(f"Querying EVENTS for '{query}'...")
        events = poly.fetch_events(query=query)
        
        if events:
            print(f"Found {len(events)} event(s) for '{query}':")
            for event in events:
                print(f"  - {event.title} (ID: {event.id})")
        else:
            print(f"No EVENTS found for '{query}'.")

        # 3. Search MARKETS for 'moltbook'
        print(f"Querying MARKETS for '{query}'...")
        markets = poly.fetch_markets(query=query)
        
        if markets:
            print(f"Found {len(markets)} market(s) for '{query}':")
            for market in markets:
                print(f"  - {market.title} (ID: {market.market_id})")
        else:
            print(f"No MARKETS found for '{query}'.")
            
    except Exception as e:
        print(f"Error occurred: {e}")

if __name__ == "__main__":
    main()
