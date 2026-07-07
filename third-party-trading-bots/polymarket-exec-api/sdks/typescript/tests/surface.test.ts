/**
 * SDK Surface Area Tests
 *
 * Verifies that every public method defined in BaseExchange.ts is exposed
 * on each SDK exchange class. No server required — checks prototypes only.
 */

import { describe, test, expect } from '@jest/globals';
import { Polymarket, Kalshi, KalshiDemo, Limitless, Myriad, Probable, Baozi } from '../index';

const PUBLIC_METHODS = [
    'loadMarkets',
    'fetchMarkets',
    'fetchMarketsPaginated',
    'fetchEvents',
    'fetchMarket',
    'fetchEvent',
    'fetchOHLCV',
    'fetchOrderBook',
    'fetchTrades',
    'createOrder',
    'cancelOrder',
    'fetchOrder',
    'fetchOpenOrders',
    'fetchMyTrades',
    'fetchClosedOrders',
    'fetchAllOrders',
    'fetchPositions',
    'fetchBalance',
    'getExecutionPrice',
    'getExecutionPriceDetailed',
    'filterMarkets',
    'filterEvents',
    'watchOrderBook',
    'watchTrades',
    'close',
];

const exchangeClasses = [Polymarket, Kalshi, KalshiDemo, Limitless, Myriad, Probable, Baozi];

describe('SDK Surface Area', () => {
    for (const ExchangeClass of exchangeClasses) {
        describe(ExchangeClass.name, () => {
            for (const method of PUBLIC_METHODS) {
                test(`has ${method}()`, () => {
                    expect(typeof (ExchangeClass.prototype as any)[method]).toBe('function');
                });
            }
        });
    }
});
