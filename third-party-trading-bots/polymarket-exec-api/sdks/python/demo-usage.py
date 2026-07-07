import pmxt
from dotenv import load_dotenv

load_dotenv()

api = pmxt.Polymarket()

# 1. Search for the broad Event
events = api.fetch_events(query='Who will Trump nominate as Fed Chair?')
fed_event = events[0]

# 2. Filter for the specific Market within that event
warsh = fed_event.markets.match('Warsh')

print(f"Price: {warsh.yes.price}")
