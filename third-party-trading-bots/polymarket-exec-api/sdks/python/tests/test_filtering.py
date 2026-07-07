import pytest
from datetime import datetime
from pmxt import Polymarket
from pmxt.models import (
    UnifiedMarket, UnifiedEvent, MarketOutcome, 
    MarketFilterCriteria, EventFilterCriteria
)

@pytest.fixture
def api():
    return Polymarket()

@pytest.fixture
def mock_markets():
    return [
        UnifiedMarket(
            market_id='1',
            title='Will Trump win the 2024 election?',
            description='Presidential election market',
            outcomes=[
                MarketOutcome(outcome_id='1a', label='Yes', price=0.55, price_change_24h=0.05),
                MarketOutcome(outcome_id='1b', label='No', price=0.45, price_change_24h=-0.05),
            ],
            resolution_date=datetime(2024, 11, 5),
            volume_24h=50000.0,
            volume=500000.0,
            liquidity=100000.0,
            open_interest=80000.0,
            url='https://example.com/1',
            category='Politics',
            tags=['Election', '2024', 'Presidential'],
            yes=MarketOutcome(outcome_id='1a', label='Yes', price=0.55, price_change_24h=0.05),
            no=MarketOutcome(outcome_id='1b', label='No', price=0.45, price_change_24h=-0.05),
        ),
        UnifiedMarket(
            market_id='2',
            title='Will Biden run for reelection?',
            description='Democratic primary speculation',
            outcomes=[
                MarketOutcome(outcome_id='2a', label='Yes', price=0.25, price_change_24h=-0.15),
                MarketOutcome(outcome_id='2b', label='No', price=0.75, price_change_24h=0.15),
            ],
            resolution_date=datetime(2024, 6, 1),
            volume_24h=30000.0,
            volume=300000.0,
            liquidity=50000.0,
            open_interest=40000.0,
            url='https://example.com/2',
            category='Politics',
            tags=['Election', 'Democratic'],
            yes=MarketOutcome(outcome_id='2a', label='Yes', price=0.25, price_change_24h=-0.15),
            no=MarketOutcome(outcome_id='2b', label='No', price=0.75, price_change_24h=0.15),
        ),
        UnifiedMarket(
            market_id='3',
            title='Bitcoin above $100k by end of year?',
            description='Crypto price prediction',
            outcomes=[
                MarketOutcome(outcome_id='3a', label='Yes', price=0.35, price_change_24h=0.02),
                MarketOutcome(outcome_id='3b', label='No', price=0.65, price_change_24h=-0.02),
            ],
            resolution_date=datetime(2024, 12, 31),
            volume_24h=75000.0,
            volume=750000.0,
            liquidity=150000.0,
            open_interest=120000.0,
            url='https://example.com/3',
            category='Crypto',
            tags=['Bitcoin', 'Price'],
            yes=MarketOutcome(outcome_id='3a', label='Yes', price=0.35, price_change_24h=0.02),
            no=MarketOutcome(outcome_id='3b', label='No', price=0.65, price_change_24h=-0.02),
        ),
        UnifiedMarket(
            market_id='4',
            title='Will Fed Chair be Kevin Warsh?',
            description='Trump Fed Chair nomination',
            outcomes=[
                MarketOutcome(outcome_id='4a', label='Yes', price=0.15, price_change_24h=-0.10),
                MarketOutcome(outcome_id='4b', label='No', price=0.85, price_change_24h=0.10),
            ],
            resolution_date=datetime(2025, 1, 20),
            volume_24h=10000.0,
            volume=100000.0,
            liquidity=20000.0,
            open_interest=15000.0,
            url='https://example.com/4',
            category='Politics',
            tags=['Fed', 'Trump'],
            yes=MarketOutcome(outcome_id='4a', label='Yes', price=0.15, price_change_24h=-0.10),
            no=MarketOutcome(outcome_id='4b', label='No', price=0.85, price_change_24h=0.10),
        ),
    ]

@pytest.fixture
def mock_events(mock_markets):
    def create_market(id_val, title, vol):
        return UnifiedMarket(
            market_id=id_val,
            title=title,
            description='Market description',
            outcomes=[
                MarketOutcome(outcome_id=f"{id_val}a", label='Yes', price=0.5),
                MarketOutcome(outcome_id=f"{id_val}b", label='No', price=0.5),
            ],
            resolution_date=datetime(2025, 1, 1),
            volume_24h=vol,
            liquidity=10000.0,
            url=f"https://example.com/{id_val}",
            yes=MarketOutcome(outcome_id=f"{id_val}a", label='Yes', price=0.5),
            no=MarketOutcome(outcome_id=f"{id_val}b", label='No', price=0.5),
        )

    return [
        UnifiedEvent(
            id='1',
            title='2024 Presidential Election',
            description='Markets related to 2024 US presidential election',
            slug='2024-presidential-election',
            url='https://example.com/event/1',
            category='Politics',
            tags=['Election', 'Presidential', '2024'],
            markets=[
                create_market('1a', 'Trump wins', 50000.0),
                create_market('1b', 'Biden wins', 40000.0),
                create_market('1c', 'Other wins', 10000.0),
            ]
        ),
        UnifiedEvent(
            id='2',
            title='Trump Cabinet Nominations',
            description='Who will Trump nominate for key positions?',
            slug='trump-cabinet-nominations',
            url='https://example.com/event/2',
            category='Politics',
            tags=['Trump', 'Cabinet'],
            markets=[
                create_market('2a', 'Kevin Warsh as Fed Chair', 15000.0),
                create_market('2b', 'Marco Rubio as Secretary of State', 20000.0),
                create_market('2c', 'Scott Bessent as Treasury Secretary', 18000.0),
                create_market('2d', 'Robert Lighthizer as Trade Rep', 12000.0),
                create_market('2e', 'Stephen Miller as Chief of Staff', 10000.0),
            ]
        ),
        UnifiedEvent(
            id='3',
            title='Crypto Price Predictions 2024',
            description='Cryptocurrency price targets for end of year',
            slug='crypto-prices-2024',
            url='https://example.com/event/3',
            category='Crypto',
            tags=['Bitcoin', 'Ethereum', 'Price'],
            markets=[
                create_market('3a', 'Bitcoin above $100k', 80000.0),
                create_market('3b', 'Ethereum above $5k', 60000.0),
            ]
        ),
        UnifiedEvent(
            id='4',
            title='Fed Rate Decisions',
            description='Federal Reserve interest rate predictions',
            slug='fed-rate-decisions',
            url='https://example.com/event/4',
            category='Economics',
            tags=['Fed', 'Interest Rates'],
            markets=[create_market('4a', 'Rate cut in January', 25000.0)]
        ),
    ]

# --- Market Filtering Tests ---

def test_filter_markets_string_search(api, mock_markets):
    result = api.filter_markets(mock_markets, 'Trump')
    assert len(result) == 1
    assert result[0].market_id == '1'

    result = api.filter_markets(mock_markets, 'bitcoin')
    assert len(result) == 1
    assert result[0].market_id == '3'

    result = api.filter_markets(mock_markets, 'xyz123notfound')
    assert len(result) == 0

def test_filter_markets_text_search_in(api, mock_markets):
    result = api.filter_markets(mock_markets, {"text": "Trump"})
    assert len(result) == 1

    result = api.filter_markets(mock_markets, {"text": "nomination", "search_in": ["description"]})
    assert len(result) == 1
    assert result[0].market_id == '4'

    result = api.filter_markets(mock_markets, {"text": "Presidential", "search_in": ["tags"]})
    assert len(result) == 1
    assert result[0].market_id == '1'

    result = api.filter_markets(mock_markets, {"text": "Yes", "search_in": ["outcomes"]})
    assert len(result) == 4

    result = api.filter_markets(mock_markets, {"text": "Trump", "search_in": ["title", "description", "tags"]})
    assert len(result) == 2

    result = api.filter_markets(mock_markets, {"text": "Politics", "search_in": ["category"]})
    assert len(result) == 3

def test_filter_markets_volume(api, mock_markets):
    result = api.filter_markets(mock_markets, {"volume_24h": {"min": 40000}})
    assert len(result) == 2
    ids = [m.market_id for m in result]
    assert '1' in ids
    assert '3' in ids

    result = api.filter_markets(mock_markets, {"volume_24h": {"max": 35000}})
    assert len(result) == 2
    ids = [m.market_id for m in result]
    assert '2' in ids
    assert '4' in ids

    result = api.filter_markets(mock_markets, {"volume_24h": {"min": 25000, "max": 60000}})
    assert len(result) == 2
    ids = [m.market_id for m in result]
    assert '1' in ids
    assert '2' in ids

    result = api.filter_markets(mock_markets, {"volume": {"min": 400000}})
    assert len(result) == 2
    ids = [m.market_id for m in result]
    assert '1' in ids
    assert '3' in ids

def test_filter_markets_liquidity(api, mock_markets):
    result = api.filter_markets(mock_markets, {"liquidity": {"min": 75000}})
    assert len(result) == 2
    ids = [m.market_id for m in result]
    assert '1' in ids
    assert '3' in ids

    result = api.filter_markets(mock_markets, {"liquidity": {"max": 60000}})
    assert len(result) == 2
    ids = [m.market_id for m in result]
    assert '2' in ids
    assert '4' in ids

def test_filter_markets_open_interest(api, mock_markets):
    result = api.filter_markets(mock_markets, {"open_interest": {"min": 70000}})
    assert len(result) == 2
    ids = [m.market_id for m in result]
    assert '1' in ids
    assert '3' in ids

def test_filter_markets_date(api, mock_markets):
    result = api.filter_markets(mock_markets, {"resolution_date": {"before": datetime(2024, 12, 1)}})
    assert len(result) == 2
    ids = [m.market_id for m in result]
    assert '1' in ids
    assert '2' in ids

    result = api.filter_markets(mock_markets, {"resolution_date": {"after": datetime(2024, 7, 1)}})
    assert len(result) == 3
    ids = [m.market_id for m in result]
    assert '1' in ids
    assert '3' in ids
    assert '4' in ids

def test_filter_markets_tags(api, mock_markets):
    result = api.filter_markets(mock_markets, {"tags": ["Election"]})
    assert len(result) == 2
    
    result = api.filter_markets(mock_markets, {"tags": ["Bitcoin", "Fed"]})
    assert len(result) == 2
    ids = [m.market_id for m in result]
    assert '3' in ids
    assert '4' in ids

def test_filter_markets_price(api, mock_markets):
    result = api.filter_markets(mock_markets, {"price": {"outcome": "yes", "max": 0.3}})
    assert len(result) == 2
    ids = [m.market_id for m in result]
    assert '2' in ids
    assert '4' in ids

    result = api.filter_markets(mock_markets, {"price": {"outcome": "no", "min": 0.7}})
    assert len(result) == 2
    ids = [m.market_id for m in result]
    assert '2' in ids
    assert '4' in ids

def test_filter_markets_price_change(api, mock_markets):
    result = api.filter_markets(mock_markets, {"price_change_24h": {"outcome": "yes", "max": -0.08}})
    assert len(result) == 2
    ids = [m.market_id for m in result]
    assert '2' in ids
    assert '4' in ids

    result = api.filter_markets(mock_markets, {"price_change_24h": {"outcome": "yes", "min": 0.03}})
    assert len(result) == 1
    assert result[0].market_id == '1'

def test_filter_markets_predicate(api, mock_markets):
    result = api.filter_markets(mock_markets, lambda m: m.volume_24h > 40000)
    assert len(result) == 2
    
    result = api.filter_markets(mock_markets, lambda m: m.category == 'Politics' and any(o.price < 0.3 for o in m.outcomes) and m.volume_24h > 10000)
    assert len(result) == 1
    assert result[0].market_id == '2'

def test_filter_markets_edge_cases(api):
    # Empty yes/no accessors
    m = UnifiedMarket(market_id='1', title='Multi', outcomes=[], volume_24h=0.0, liquidity=0.0, url='')
    result = api.filter_markets([m], {"price": {"outcome": "yes", "max": 0.5}})
    assert len(result) == 0

# --- Event Filtering Tests ---

def test_filter_events_string_search(api, mock_events):
    result = api.filter_events(mock_events, 'Trump')
    assert len(result) == 1
    assert result[0].id == '2'

    result = api.filter_events(mock_events, 'election')
    assert len(result) == 1
    assert result[0].id == '1'

def test_filter_events_text_search_in(api, mock_events):
    result = api.filter_events(mock_events, {"text": "nominate", "search_in": ["description"]})
    assert len(result) == 1
    assert result[0].id == '2'

def test_filter_events_market_count(api, mock_events):
    result = api.filter_events(mock_events, {"market_count": {"min": 4}})
    assert len(result) == 1
    assert result[0].id == '2'

    result = api.filter_events(mock_events, {"market_count": {"max": 2}})
    assert len(result) == 2
    ids = [e.id for e in result]
    assert '3' in ids
    assert '4' in ids

def test_filter_events_total_volume(api, mock_events):
    result = api.filter_events(mock_events, {"total_volume": {"min": 100000}})
    assert len(result) == 2
    ids = [e.id for e in result]
    assert '1' in ids
    assert '3' in ids

def test_filter_events_predicate(api, mock_events):
    result = api.filter_events(mock_events, lambda e: len(e.markets) > 3)
    assert len(result) == 1
    assert result[0].id == '2'

def test_filter_events_edge_cases(api):
    # Empty markets
    result = api.filter_events([], 'Trump')
    assert len(result) == 0

    # Category case sensitivity
    e = UnifiedEvent(id='1', title='Test', description='', slug='test', url='', category='Politics', markets=[])
    assert len(api.filter_events([e], {"category": "Politics"})) == 1
    assert len(api.filter_events([e], {"category": "politics"})) == 0

    # Zero volume calculation
    assert len(api.filter_events([e], {"total_volume": {"max": 1000}})) == 1
