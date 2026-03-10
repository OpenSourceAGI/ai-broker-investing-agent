"""
Python SDK Integration Tests

These tests verify that the Python SDK correctly communicates with the PMXT server
and returns properly structured, validated data.

Prerequisites:
- PMXT server must be running (use pmxt-ensure-server)
- No API keys required for read-only operations
"""

import pytest
import pmxt
from datetime import datetime


class TestPolymarketIntegration:
    """Test Polymarket SDK integration with live server"""

    @pytest.fixture
    def client(self):
        """Create a Polymarket client instance"""
        return pmxt.Polymarket()

    def test_fetch_markets_returns_valid_structure(self, client):
        """Verify fetchMarkets returns properly structured data"""
        markets = client.fetch_markets()
        
        # Should return a list
        assert isinstance(markets, list), "fetchMarkets should return a list"
        assert len(markets) > 0, "Should return at least one market"
        
        # Check first market structure
        market = markets[0]
        assert hasattr(market, 'market_id'), "Market should have market_id"
        assert hasattr(market, 'title'), "Market should have title"
        assert hasattr(market, 'outcomes'), "Market should have outcomes"
        assert hasattr(market, 'volume_24h'), "Market should have volume_24h"
        
        # Validate types
        assert isinstance(market.market_id, str), "Market market_id should be string"
        assert isinstance(market.title, str), "Title should be string"
        assert isinstance(market.outcomes, list), "Outcomes should be list"
        assert len(market.outcomes) > 0, "Should have at least one outcome"

    def test_market_outcomes_have_required_fields(self, client):
        """Verify market outcomes contain all required fields"""
        markets = client.fetch_markets()
        market = markets[0]
        outcome = market.outcomes[0]
        
        assert hasattr(outcome, 'label'), "Outcome should have label"
        assert hasattr(outcome, 'price'), "Outcome should have price"
        assert isinstance(outcome.label, str), "Outcome label should be string"
        assert isinstance(outcome.price, (int, float)), "Price should be numeric"
        assert 0 <= outcome.price <= 1, "Price should be between 0 and 1"

    # def test_get_markets_by_slug(self, client):
    #     """Test fetching markets by slug"""
    #     # Use a known active market slug
    #     markets = client.get_markets_by_slug('presidential-election-winner-2024')
    #     
    #     assert isinstance(markets, list), "Should return a list"
    #     # Note: Market might be resolved, so we don't assert length > 0
    #     
    #     if len(markets) > 0:
    #         market = markets[0]
    #         assert hasattr(market, 'market_id')
    #         assert hasattr(market, 'outcomes')

    def test_volume_fields_are_numeric(self, client):
        """Verify volume fields are properly parsed as numbers"""
        markets = client.fetch_markets()
        market = markets[0]
        
        assert isinstance(market.volume_24h, (int, float)), "volume_24h should be numeric"
        assert market.volume_24h >= 0, "volume_24h should be non-negative"

    def test_resolution_date_is_datetime(self, client):
        """Verify resolution date is properly parsed"""
        markets = client.fetch_markets()
        market = markets[0]
        
        if hasattr(market, 'resolution_date') and market.resolution_date:
            assert isinstance(market.resolution_date, (datetime, str)), \
                "Resolution date should be datetime or ISO string"


class TestKalshiIntegration:
    """Test Kalshi SDK integration with live server"""

    @pytest.fixture
    def client(self):
        """Create a Kalshi client instance"""
        return pmxt.Kalshi()

    def test_fetch_markets_returns_valid_structure(self, client):
        """Verify fetchMarkets returns properly structured data"""
        markets = client.fetch_markets()
        
        assert isinstance(markets, list), "fetchMarkets should return a list"
        assert len(markets) > 0, "Should return at least one market"
        
        market = markets[0]
        assert hasattr(market, 'market_id'), "Market should have market_id"
        assert hasattr(market, 'title'), "Market should have title"
        assert hasattr(market, 'outcomes'), "Market should have outcomes"

    def test_market_outcomes_structure(self, client):
        """Verify Kalshi market outcomes are properly structured"""
        markets = client.fetch_markets()
        market = markets[0]
        
        assert isinstance(market.outcomes, list), "Outcomes should be list"
        assert len(market.outcomes) > 0, "Should have at least one outcome"
        
        outcome = market.outcomes[0]
        assert hasattr(outcome, 'label'), "Outcome should have label"
        assert hasattr(outcome, 'price'), "Outcome should have price"


class TestCrossExchangeConsistency:
    """Test that both exchanges return data in the same normalized format"""

    def test_both_exchanges_return_same_structure(self):
        """Verify Polymarket and Kalshi return identically structured data"""
        # Initialize one at a time to ensure valid tokens
        poly = pmxt.Polymarket()
        poly_markets = poly.fetch_markets()
        
        kalshi = pmxt.Kalshi()
        kalshi_markets = kalshi.fetch_markets()
        
        # Both should return lists
        assert isinstance(poly_markets, list)
        assert isinstance(kalshi_markets, list)
        
        # Both should have markets with same field structure
        if len(poly_markets) > 0 and len(kalshi_markets) > 0:
            poly_market = poly_markets[0]
            kalshi_market = kalshi_markets[0]
            
            # Check both have same core fields
            core_fields = ['market_id', 'title', 'outcomes']
            for field in core_fields:
                assert hasattr(poly_market, field), f"Polymarket missing {field}"
                assert hasattr(kalshi_market, field), f"Kalshi missing {field}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
