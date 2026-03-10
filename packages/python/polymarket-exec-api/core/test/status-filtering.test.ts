
import axios from 'axios';
import { PolymarketExchange } from '../src/exchanges/polymarket';
import { KalshiExchange } from '../src/exchanges/kalshi';
import { LimitlessExchange } from '../src/exchanges/limitless';

jest.mock('axios', () => {
    const mockInstance: any = {
        get: jest.fn(),
        post: jest.fn(),
        delete: jest.fn(),
        request: jest.fn(),
        interceptors: {
            request: { use: jest.fn() },
            response: { use: jest.fn() },
        },
        defaults: { headers: { common: {} } },
    };
    const actualAxios = jest.requireActual('axios');
    mockInstance.create = jest.fn(() => mockInstance);
    mockInstance.isAxiosError = actualAxios.isAxiosError;
    return {
        __esModule: true,
        default: mockInstance,
        ...mockInstance,
    };
});
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Exchange Status Filtering Implementation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Polymarket Status Mapping', () => {
        const poly = new PolymarketExchange();

        it('should default to active=true, closed=false when no status is provided', async () => {
            mockedAxios.get.mockResolvedValue({ data: [] });
            await poly.fetchMarkets({ limit: 1 });

            expect(mockedAxios.get).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    params: expect.objectContaining({
                        active: 'true',
                        closed: 'false'
                    })
                })
            );
        });

        it('should map status: "closed" to active=false, closed=true', async () => {
            mockedAxios.get.mockResolvedValue({ data: [] });
            await poly.fetchMarkets({ status: 'closed' });

            expect(mockedAxios.get).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    params: expect.objectContaining({
                        active: 'false',
                        closed: 'true'
                    })
                })
            );
        });

        it('should omit status filters when status is "all"', async () => {
            mockedAxios.get.mockResolvedValue({ data: [] });
            await poly.fetchMarkets({ status: 'all' });

            const callParams = mockedAxios.get.mock.calls[0][1]?.params;
            expect(callParams).not.toHaveProperty('active');
            expect(callParams).not.toHaveProperty('closed');
        });
    });

    describe('Kalshi Status Mapping', () => {
        const kalshi = new KalshiExchange();

        it('should map status: "active" to status="open"', async () => {
            (mockedAxios as any).request.mockResolvedValue({ data: { events: [] } });
            await kalshi.fetchMarkets({ status: 'active' });

            expect((mockedAxios as any).request).toHaveBeenCalledWith(
                expect.objectContaining({
                    params: expect.objectContaining({
                        status: 'open'
                    })
                })
            );
        });

        it('should map status: "closed" to status="closed"', async () => {
            (mockedAxios as any).request.mockResolvedValue({ data: { events: [] } });
            await kalshi.fetchMarkets({ status: 'closed' });

            expect((mockedAxios as any).request).toHaveBeenCalledWith(
                expect.objectContaining({
                    params: expect.objectContaining({
                        status: 'closed'
                    })
                })
            );
        });
    });

    describe('Limitless Safeguards', () => {
        const limitless = new LimitlessExchange();

        it('should return empty array for status: "closed" without hitting network', async () => {
            const markets = await limitless.fetchMarkets({ status: 'closed' });
            expect(markets).toEqual([]);
            // Ensure no axios calls were made (SDK uses axios internally or via HttpClient)
            expect(mockedAxios.get).not.toHaveBeenCalled();
        });
    });
});
