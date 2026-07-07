#!/usr/bin/env python3
"""
Test script to verify the port auto-detection fix.
This demonstrates that the SDK now correctly connects to the server
even when it's running on a non-default port.
"""

import pmxt

# Create Polymarket client
# The SDK will automatically detect the server is running on port 3848
# (not the default 3847) and connect to the correct port
api = pmxt.Polymarket()

# Fetch markets to verify connection works
# Note: get_markets_by_slug is removed in v2.0, so we use fetch_markets with slug filter
markets = api.fetch_markets(slug='who-will-trump-nominate-as-fed-chair')

# Find Kevin Warsh outcome
warsh = next((m for m in markets if m.outcomes[0].label == 'Kevin Warsh'), None)

if warsh:
    print("Successfully connected!")
    print(f"Kevin Warsh 'Yes' price: {warsh.outcomes[0].price}")
    
    # Show which port we connected to
    import json
    from pathlib import Path
    lock_file = Path.home() / '.pmxt' / 'server.lock'
    if lock_file.exists():
        lock_data = json.loads(lock_file.read_text())
        print(f"Server running on port: {lock_data.get('port')}")
else:
    print("Market not found")
