import { Connection, PublicKey } from '@solana/web3.js';
import { OrderBook } from '../../types';
import {
    MARKET_DISCRIMINATOR,
    RACE_MARKET_DISCRIMINATOR,
    parseMarket,
    parseRaceMarket,
    mapBooleanToUnified,
    mapRaceToUnified,
} from './utils';

interface QueuedPromise<T> {
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: any) => void;
}

/**
 * Uses Solana's onAccountChange to watch market PDA updates.
 * When the account data changes (new bet placed), we re-parse
 * and emit a new synthetic order book.
 */
export class BaoziWebSocket {
    private orderBookResolvers = new Map<string, QueuedPromise<OrderBook>[]>();
    private subscriptions = new Map<string, number>();

    async watchOrderBook(connection: Connection, outcomeId: string): Promise<OrderBook> {
        const marketPubkey = outcomeId.replace(/-YES$|-NO$|-\d+$/, '');
        const marketKey = new PublicKey(marketPubkey);

        if (!this.subscriptions.has(marketPubkey)) {
            const subId = connection.onAccountChange(
                marketKey,
                (accountInfo) => {
                    try {
                        const data = accountInfo.data;
                        const discriminator = data.subarray(0, 8);
                        let market;

                        if (Buffer.from(discriminator).equals(MARKET_DISCRIMINATOR)) {
                            const parsed = parseMarket(data);
                            market = mapBooleanToUnified(parsed, marketPubkey);
                        } else if (Buffer.from(discriminator).equals(RACE_MARKET_DISCRIMINATOR)) {
                            const parsed = parseRaceMarket(data);
                            market = mapRaceToUnified(parsed, marketPubkey);
                        }

                        if (!market) return;

                        const outcome = market.outcomes.find(o => o.outcomeId === outcomeId);
                        const price = outcome?.price ?? 0.5;

                        const orderBook: OrderBook = {
                            bids: [{ price, size: market.liquidity }],
                            asks: [{ price, size: market.liquidity }],
                            timestamp: Date.now(),
                        };

                        this.resolveOrderBook(marketPubkey, orderBook);
                    } catch {
                        // Skip parse errors on account change
                    }
                },
                'confirmed',
            );
            this.subscriptions.set(marketPubkey, subId);
        }

        return new Promise<OrderBook>((resolve, reject) => {
            if (!this.orderBookResolvers.has(marketPubkey)) {
                this.orderBookResolvers.set(marketPubkey, []);
            }
            this.orderBookResolvers.get(marketPubkey)!.push({ resolve, reject });
        });
    }

    private resolveOrderBook(marketPubkey: string, orderBook: OrderBook): void {
        const resolvers = this.orderBookResolvers.get(marketPubkey);
        if (resolvers && resolvers.length > 0) {
            for (const r of resolvers) {
                r.resolve(orderBook);
            }
            this.orderBookResolvers.set(marketPubkey, []);
        }
    }

    async close(connection: Connection): Promise<void> {
        for (const [, subId] of this.subscriptions) {
            await connection.removeAccountChangeListener(subId);
        }
        this.subscriptions.clear();

        // Reject pending resolvers
        for (const [, resolvers] of this.orderBookResolvers) {
            for (const r of resolvers) {
                r.reject(new Error('WebSocket closed'));
            }
        }
        this.orderBookResolvers.clear();
    }
}
