import { UnifiedMarket, UnifiedEvent, MarketOutcome } from '../../types';
import { addBinaryOutcomes } from '../../utils/market-utils';

export const BASE_URL = 'https://api-v2.myriadprotocol.com';

// Mainnet network IDs
export const NETWORKS = {
    ABSTRACT: 2741,
    LINEA: 59144,
    BNB: 56,
} as const;

// Mainnet contract addresses
export const CONTRACTS: Record<number, { predictionMarket: string; querier: string }> = {
    [NETWORKS.ABSTRACT]: {
        predictionMarket: '0x3e0F5F8F5Fb043aBFA475C0308417Bf72c463289',
        querier: '0x1d5773Cd0dC74744C1F7a19afEeECfFE64f233Ff',
    },
    [NETWORKS.LINEA]: {
        predictionMarket: '0x39e66ee6b2ddaf4defded3038e0162180dbef340',
        querier: '0x503c9f98398dc3433ABa819BF3eC0b97e02B8D04',
    },
    [NETWORKS.BNB]: {
        predictionMarket: '0x39E66eE6b2ddaf4DEfDEd3038E0162180dbeF340',
        querier: '0xDeFb36c47754D2e37d44b8b8C647D4D643e03bAd',
    },
};

export function mapMarketState(state: string): 'active' | 'inactive' | 'closed' {
    switch (state) {
        case 'open':
            return 'active';
        case 'closed':
            return 'inactive';
        case 'resolved':
            return 'closed';
        default:
            return 'active';
    }
}

export function mapStatusToMyriad(status?: string): string | undefined {
    if (!status) return undefined;
    switch (status) {
        case 'active':
            return 'open';
        case 'inactive':
        case 'closed':
            return 'closed';
        default:
            return undefined;
    }
}

export function mapMarketToUnified(market: any): UnifiedMarket | null {
    if (!market) return null;

    const outcomes: MarketOutcome[] = (market.outcomes || []).map((o: any) => ({
        outcomeId: `${market.networkId}:${market.id}:${o.id}`,
        marketId: `${market.networkId}:${market.id}`,
        label: o.title || `Outcome ${o.id}`,
        price: Number(o.price) || 0,
        priceChange24h: o.priceChange24h != null ? Number(o.priceChange24h) : undefined,
    }));

    const um = {
        marketId: `${market.networkId}:${market.id}`,
        eventId: market.questionId ? String(market.questionId) : undefined,
        title: market.title || '',
        description: market.description || '',
        outcomes,
        resolutionDate: market.expiresAt ? new Date(market.expiresAt) : new Date(0),
        volume24h: Number(market.volume24h || 0),
        volume: Number(market.volume || 0),
        liquidity: Number(market.liquidity || 0),
        url: `https://myriad.markets/markets/${market.slug || market.id}`,
        image: market.imageUrl,
        tags: market.topics || [],
    } as UnifiedMarket;

    addBinaryOutcomes(um);
    return um;
}

export function mapQuestionToEvent(question: any): UnifiedEvent | null {
    if (!question) return null;

    const markets: UnifiedMarket[] = [];
    for (const m of question.markets || []) {
        const um = mapMarketToUnified(m);
        if (um) markets.push(um);
    }

    const unifiedEvent = {
        id: String(question.id),
        title: question.title || '',
        description: '',
        slug: String(question.id),
        markets,
        url: `https://myriad.markets`,
    };

    return unifiedEvent;
}
