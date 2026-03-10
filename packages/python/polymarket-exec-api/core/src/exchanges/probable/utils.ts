import { UnifiedMarket, UnifiedEvent, MarketOutcome } from '../../types';
import { addBinaryOutcomes } from '../../utils/market-utils';

export const BASE_URL = 'https://market-api.probable.markets';
export const SEARCH_PATH = '/public/api/v1/public-search/';
export const EVENTS_PATH = '/public/api/v1/events/';
export const MARKETS_PATH = '/public/api/v1/markets/';

export function mapMarketToUnified(market: any, event?: any): UnifiedMarket | null {
    if (!market) return null;

    const outcomes: MarketOutcome[] = [];

    // Probable API provides tokens array with token_id and outcome label.
    // The outcomes field is a JSON string like '["Yes","No"]'.
    // Prices are not included in the search response.
    if (market.tokens && Array.isArray(market.tokens)) {
        for (const token of market.tokens) {
            outcomes.push({
                outcomeId: String(token.token_id),
                marketId: String(market.id),
                label: token.outcome || '',
                price: 0,
                priceChange24h: 0,
            });
        }
    }

    const um = {
        marketId: String(market.id),
        eventId: event ? String(event.id) : (market.event_id ? String(market.event_id) : undefined),
        title: market.question || market.title || '',
        description: market.description || '',
        outcomes,
        resolutionDate: market.endDate ? new Date(market.endDate) : new Date(),
        volume24h: Number(market.volume24hr || 0),
        volume: Number(market.volume || 0),
        liquidity: Number(market.liquidity || 0),
        openInterest: 0,
        url: `https://probable.markets/markets/${market.market_slug || market.slug || market.id}`,
        image: market.icon || event?.icon || event?.image || undefined,
        category: event?.category || market.category || undefined,
        tags: market.tags || event?.tags || [],
    } as UnifiedMarket;

    addBinaryOutcomes(um);
    return um;
}

export function mapEventToUnified(event: any): UnifiedEvent | null {
    if (!event) return null;

    const markets: UnifiedMarket[] = [];
    if (event.markets && Array.isArray(event.markets)) {
        for (const market of event.markets) {
            const mapped = mapMarketToUnified(market, event);
            if (mapped) markets.push(mapped);
        }
    }

    const unifiedEvent: UnifiedEvent = {
        id: String(event.id),
        title: event.title || '',
        description: event.description || '',
        slug: event.slug || '',
        markets,
        url: `https://probable.markets/events/${event.slug || event.id}`,
        image: event.icon || event.image || undefined,
        category: event.category || undefined,
        tags: event.tags || [],
    };

    return unifiedEvent;
}

export async function enrichMarketsWithPrices(markets: UnifiedMarket[], callMidpoint: (tokenId: string) => Promise<any>): Promise<void> {
    const outcomes: MarketOutcome[] = [];
    for (const market of markets) {
        for (const outcome of market.outcomes) {
            if (outcome.outcomeId) outcomes.push(outcome);
        }
    }
    if (outcomes.length === 0) return;

    const results = await Promise.allSettled(
        outcomes.map(async (outcome) => {
            const response = await callMidpoint(outcome.outcomeId);
            return { outcomeId: outcome.outcomeId, mid: Number(response?.mid ?? 0) };
        })
    );

    const priceMap: Record<string, number> = {};
    for (const result of results) {
        if (result.status === 'fulfilled') {
            priceMap[result.value.outcomeId] = result.value.mid;
        }
    }

    for (const market of markets) {
        for (const outcome of market.outcomes) {
            const price = priceMap[outcome.outcomeId];
            if (price !== undefined) outcome.price = price;
        }
        addBinaryOutcomes(market);
    }
}
