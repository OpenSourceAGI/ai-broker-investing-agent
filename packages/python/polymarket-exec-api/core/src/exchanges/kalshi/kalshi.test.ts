import { KalshiExchange } from "../kalshi";
import { CreateOrderParams } from "../../types";
import axios from "axios";
import { KalshiAuth } from "./auth";
import { KALSHI_PROD_API_URL, getApiPath } from "./config";

// Jest hoisting means we can't use outer variables in jest.mock factory
// unless they start with 'mock'. However, let's just define it inline to be safe and simple.
// To access the inner methods, we'll grab the instance returned by axios.create().

jest.mock("axios", () => {
  const mockInstance = {
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
    request: jest.fn(),
    defaults: { headers: { common: {} } },
  };
  const actualAxios = jest.requireActual("axios");
  const mockAxios = {
    create: jest.fn(() => mockInstance),
    isAxiosError: actualAxios.isAxiosError,
  };
  // Support both default and named exports
  return {
    __esModule: true,
    ...mockAxios,
    default: mockAxios,
  };
});

// Access the mocked instance for assertions
// Since our factory returns the same object reference, this works.
const mockAxiosInstance = axios.create();
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock KalshiAuth
jest.mock("./auth");
const MockedKalshiAuth = KalshiAuth as jest.MockedClass<typeof KalshiAuth>;

describe("KalshiExchange", () => {
  let exchange: KalshiExchange;
  const mockCredentials = {
    apiKey: "test-api-key",
    privateKey: "mock-private-key",
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset the mock instance methods to ensure clean state
    (mockAxiosInstance.get as jest.Mock).mockReset();
    (mockAxiosInstance.post as jest.Mock).mockReset();
    (mockAxiosInstance.delete as jest.Mock).mockReset();
    (mockAxiosInstance.request as jest.Mock).mockReset();

    // Mock the getHeaders method
    MockedKalshiAuth.prototype.getHeaders = jest.fn().mockReturnValue({
      "KALSHI-ACCESS-KEY": "test-api-key",
      "KALSHI-ACCESS-TIMESTAMP": "1234567890",
      "KALSHI-ACCESS-SIGNATURE": "mock-signature",
      "Content-Type": "application/json",
    });
  });

  describe("Authentication", () => {
    it("should throw error when trading without credentials", async () => {
      exchange = new KalshiExchange();
      await expect(exchange.fetchBalance()).rejects.toThrow(
        "Trading operations require authentication",
      );
    });

    it("should initialize with credentials", () => {
      exchange = new KalshiExchange(mockCredentials);
      expect(exchange).toBeDefined();
    });
  });

  describe("Market Data Methods", () => {
    beforeEach(() => {
      exchange = new KalshiExchange();
    });

    it("should fetch markets", async () => {
      const mockResponse = {
        data: {
          markets: [
            {
              ticker: "TEST-MARKET",
              title: "Test Market",
              yes_bid: 50,
              yes_ask: 52,
              volume: 1000,
            },
          ],
        },
      };
      (mockAxiosInstance.request as jest.Mock).mockResolvedValue(mockResponse);

      const markets = await exchange.fetchMarkets();
      expect(markets).toBeDefined();
    });
  });

  describe("Trading Methods", () => {
    beforeEach(() => {
      exchange = new KalshiExchange(mockCredentials);
    });

    describe("createOrder", () => {
      it("should create buy order with yes_price for buy side", async () => {
        const orderParams: CreateOrderParams = {
          marketId: "TEST-MARKET",
          outcomeId: "yes",
          side: "buy",
          type: "limit",
          amount: 10,
          price: 0.55,
        };

        const mockResponse = {
          data: {
            order: {
              order_id: "order-123",
              ticker: "TEST-MARKET",
              status: "resting",
              count: 10,
              remaining_count: 10,
              created_time: "2026-01-13T12:00:00Z",
              queue_position: 1,
            },
          },
        };

        (mockAxiosInstance.request as jest.Mock).mockResolvedValue(
          mockResponse,
        );

        const order = await exchange.createOrder(orderParams);

        expect(mockAxiosInstance.request).toHaveBeenCalledWith(
          expect.objectContaining({
            method: "POST",
            url: "https://api.elections.kalshi.com/trade-api/v2/portfolio/orders",
            data: expect.objectContaining({
              ticker: "TEST-MARKET",
              side: "yes",
              action: "buy",
              count: 10,
              type: "limit",
              yes_price: 55, // 0.55 * 100
            }),
          }),
        );

        expect(order.id).toBe("order-123");
        expect(order.status).toBe("open");
      });

      it("should create sell order with no_price for sell side", async () => {
        const orderParams: CreateOrderParams = {
          marketId: "TEST-MARKET",
          outcomeId: "no",
          side: "sell",
          type: "limit",
          amount: 5,
          price: 0.45,
        };

        const mockResponse = {
          data: {
            order: {
              order_id: "order-456",
              ticker: "TEST-MARKET",
              status: "resting",
              count: 5,
              remaining_count: 5,
              created_time: "2026-01-13T12:00:00Z",
              queue_position: 1,
            },
          },
        };

        (mockAxiosInstance.request as jest.Mock).mockResolvedValue(
          mockResponse,
        );

        await exchange.createOrder(orderParams);

        expect(mockAxiosInstance.request).toHaveBeenCalledWith(
          expect.objectContaining({
            method: "POST",
            url: "https://api.elections.kalshi.com/trade-api/v2/portfolio/orders",
            data: expect.objectContaining({
              ticker: "TEST-MARKET",
              side: "no",
              action: "sell",
              count: 5,
              type: "limit",
              no_price: 45, // 0.45 * 100
            }),
          }),
        );
      });
    });

    describe("fetchOpenOrders", () => {
      it("should sign request without query parameters", async () => {
        const mockResponse = {
          data: {
            orders: [
              {
                order_id: "order-123",
                ticker: "TEST-MARKET",
                side: "yes",
                type: "limit",
                yes_price: 55,
                count: 10,
                remaining_count: 10,
                created_time: "2026-01-13T12:00:00Z",
              },
            ],
          },
        };

        (mockAxiosInstance.request as jest.Mock).mockResolvedValue(
          mockResponse,
        );

        await exchange.fetchOpenOrders();

        // Verify the request includes the correct params
        expect(mockAxiosInstance.request).toHaveBeenCalledWith(
          expect.objectContaining({
            method: "GET",
            url: "https://api.elections.kalshi.com/trade-api/v2/portfolio/orders",
            params: expect.objectContaining({ status: "resting" }),
          }),
        );

        // Verify getHeaders was called with base path only (no query params)
        expect(MockedKalshiAuth.prototype.getHeaders).toHaveBeenCalledWith(
          "GET",
          getApiPath("/portfolio/orders"),
        );
      });

      it("should include ticker in query params when marketId provided", async () => {
        const mockResponse = { data: { orders: [] } };
        (mockAxiosInstance.request as jest.Mock).mockResolvedValue(
          mockResponse,
        );

        await exchange.fetchOpenOrders("TEST-MARKET");

        expect(mockAxiosInstance.request).toHaveBeenCalledWith(
          expect.objectContaining({
            method: "GET",
            url: "https://api.elections.kalshi.com/trade-api/v2/portfolio/orders",
            params: expect.objectContaining({
              status: "resting",
              ticker: "TEST-MARKET",
            }),
          }),
        );
      });
    });

    describe("fetchPositions", () => {
      it("should handle positions with zero contracts", async () => {
        const mockResponse = {
          data: {
            market_positions: [
              {
                ticker: "TEST-MARKET",
                position: 0,
                total_cost: 0,
                market_exposure: 0,
                realized_pnl: 0,
              },
            ],
          },
        };

        (mockAxiosInstance.request as jest.Mock).mockResolvedValue(
          mockResponse,
        );

        const positions = await exchange.fetchPositions();

        expect(positions).toHaveLength(1);
        expect(positions[0].size).toBe(0);
        expect(positions[0].entryPrice).toBe(0); // Should not throw division by zero
      });

      it("should correctly calculate average price and PnL", async () => {
        const mockResponse = {
          data: {
            market_positions: [
              {
                ticker: "TEST-MARKET",
                position: 10,
                total_cost: 550, // 10 contracts at $0.55 each = $5.50 = 550 cents
                market_exposure: 100, // $1.00 unrealized PnL
                realized_pnl: 50, // $0.50 realized PnL
              },
            ],
          },
        };

        (mockAxiosInstance.request as jest.Mock).mockResolvedValue(
          mockResponse,
        );

        const positions = await exchange.fetchPositions();

        expect(positions).toHaveLength(1);
        expect(positions[0].size).toBe(10);
        expect(positions[0].entryPrice).toBe(0.55); // 550 / 10 / 100
        expect(positions[0].unrealizedPnL).toBe(1.0); // 100 / 100
        expect(positions[0].realizedPnL).toBe(0.5); // 50 / 100
      });

      it("should handle short positions", async () => {
        const mockResponse = {
          data: {
            market_positions: [
              {
                ticker: "TEST-MARKET",
                position: -5, // Short position
                total_cost: 250,
                market_exposure: -50,
                realized_pnl: 25,
              },
            ],
          },
        };

        (mockAxiosInstance.request as jest.Mock).mockResolvedValue(
          mockResponse,
        );

        const positions = await exchange.fetchPositions();

        expect(positions[0].size).toBe(-5); // Negative for short
        expect(Math.abs(positions[0].size)).toBe(5); // Absolute value
      });
    });

    describe("fetchBalance", () => {
      it("should correctly convert cents to dollars", async () => {
        const mockResponse = {
          data: {
            balance: 10000, // $100.00 available
            portfolio_value: 15000, // $150.00 total
          },
        };

        (mockAxiosInstance.request as jest.Mock).mockResolvedValue(
          mockResponse,
        );

        const balances = await exchange.fetchBalance();

        expect(balances).toHaveLength(1);
        expect(balances[0].currency).toBe("USD");
        expect(balances[0].available).toBe(100.0);
        expect(balances[0].total).toBe(150.0);
        expect(balances[0].locked).toBe(50.0); // 150 - 100
      });
    });

    describe("cancelOrder", () => {
      it("should cancel order successfully", async () => {
        const mockResponse = {
          data: {
            order: {
              order_id: "order-123",
              ticker: "TEST-MARKET",
              side: "yes",
              count: 10,
              remaining_count: 5,
              created_time: "2026-01-13T12:00:00Z",
            },
          },
        };

        (mockAxiosInstance.request as jest.Mock).mockResolvedValue(
          mockResponse,
        );

        const order = await exchange.cancelOrder("order-123");

        expect(order.status).toBe("cancelled");
        expect(order.filled).toBe(5); // count - remaining_count
        expect(order.remaining).toBe(0);
      });
    });

    describe("Trading History Methods", () => {
      it("should map GetFills response to UserTrade array", async () => {
        const mockResponse = {
          data: {
            fills: [
              {
                fill_id: "fill-abc",
                order_id: "order-123",
                created_time: "2026-01-13T12:00:00Z",
                yes_price: 55,
                count: 10,
                side: "yes",
              },
              {
                fill_id: "fill-def",
                order_id: "order-456",
                created_time: "2026-01-13T13:00:00Z",
                yes_price: 45,
                count: 5,
                side: "no",
              },
            ],
          },
        };
        (mockAxiosInstance.request as jest.Mock).mockResolvedValue(mockResponse);

        const trades = await exchange.fetchMyTrades();

        expect(Array.isArray(trades)).toBe(true);
        expect(trades).toHaveLength(2);

        expect(trades[0].id).toBe("fill-abc");
        expect(trades[0].orderId).toBe("order-123");
        expect(trades[0].price).toBe(0.55); // 55 / 100
        expect(trades[0].amount).toBe(10);
        expect(trades[0].side).toBe("buy"); // 'yes' => 'buy'

        expect(trades[1].id).toBe("fill-def");
        expect(trades[1].side).toBe("sell"); // 'no' => 'sell'
        expect(trades[1].price).toBe(0.45); // 45 / 100
      });

      it("should pass outcomeId as ticker (stripping -NO suffix) and date params", async () => {
        const mockResponse = { data: { fills: [] } };
        (mockAxiosInstance.request as jest.Mock).mockResolvedValue(mockResponse);

        await exchange.fetchMyTrades({
          outcomeId: "TEST-MARKET-NO",
          since: new Date("2026-01-01T00:00:00Z"),
          until: new Date("2026-01-31T00:00:00Z"),
          limit: 50,
        });

        expect(mockAxiosInstance.request).toHaveBeenCalledWith(
          expect.objectContaining({
            params: expect.objectContaining({
              ticker: "TEST-MARKET", // -NO stripped
              min_ts: Math.floor(
                new Date("2026-01-01T00:00:00Z").getTime() / 1000,
              ),
              max_ts: Math.floor(
                new Date("2026-01-31T00:00:00Z").getTime() / 1000,
              ),
              limit: 50,
            }),
          }),
        );
      });

      it("should return empty array when fills is missing", async () => {
        (mockAxiosInstance.request as jest.Mock).mockResolvedValue({ data: {} });
        const trades = await exchange.fetchMyTrades();
        expect(trades).toHaveLength(0);
      });

      describe("fetchClosedOrders", () => {
        it("should map GetHistoricalOrders response to Order array", async () => {
          const mockResponse = {
            data: {
              orders: [
                {
                  order_id: "hist-order-1",
                  ticker: "TEST-MARKET",
                  side: "yes",
                  type: "limit",
                  yes_price: 60,
                  count: 8,
                  remaining_count: 0,
                  status: "executed",
                  created_time: "2026-01-10T10:00:00Z",
                },
              ],
            },
          };
          (mockAxiosInstance.request as jest.Mock).mockResolvedValue(
            mockResponse,
          );

          const orders = await exchange.fetchClosedOrders();

          expect(orders).toHaveLength(1);
          expect(orders[0].id).toBe("hist-order-1");
          expect(orders[0].marketId).toBe("TEST-MARKET");
          expect(orders[0].side).toBe("buy"); // 'yes' => 'buy'
          expect(orders[0].price).toBe(0.6); // 60 / 100
          expect(orders[0].amount).toBe(8);
          expect(orders[0].filled).toBe(8); // count - remaining_count (0)
          expect(orders[0].remaining).toBe(0);
          expect(orders[0].status).toBe("filled"); // 'executed' => 'filled'
        });

        it("should pass marketId as ticker and limit", async () => {
          const mockResponse = { data: { orders: [] } };
          (mockAxiosInstance.request as jest.Mock).mockResolvedValue(
            mockResponse,
          );

          await exchange.fetchClosedOrders({
            marketId: "TEST-MARKET",
            limit: 25,
          });

          expect(mockAxiosInstance.request).toHaveBeenCalledWith(
            expect.objectContaining({
              params: expect.objectContaining({
                ticker: "TEST-MARKET",
                limit: 25,
              }),
            }),
          );
        });
      });

      describe("fetchAllOrders", () => {
        it("should merge live and historical orders, dedup, and sort descending by timestamp", async () => {
          const liveResponse = {
            data: {
              orders: [
                {
                  order_id: "order-live-1",
                  ticker: "TEST",
                  side: "yes",
                  type: "limit",
                  yes_price: 50,
                  count: 5,
                  remaining_count: 5,
                  status: "resting",
                  created_time: "2026-01-15T10:00:00Z",
                },
                {
                  // duplicate that also appears in historical
                  order_id: "order-hist-1",
                  ticker: "TEST",
                  side: "no",
                  type: "limit",
                  yes_price: 40,
                  count: 3,
                  remaining_count: 0,
                  status: "executed",
                  created_time: "2026-01-10T08:00:00Z",
                },
              ],
            },
          };
          const historicalResponse = {
            data: {
              orders: [
                {
                  order_id: "order-hist-1", // duplicate
                  ticker: "TEST",
                  side: "no",
                  type: "limit",
                  yes_price: 40,
                  count: 3,
                  remaining_count: 0,
                  status: "executed",
                  created_time: "2026-01-10T08:00:00Z",
                },
                {
                  order_id: "order-hist-2",
                  ticker: "TEST",
                  side: "yes",
                  type: "limit",
                  yes_price: 55,
                  count: 10,
                  remaining_count: 0,
                  status: "executed",
                  created_time: "2026-01-05T06:00:00Z",
                },
              ],
            },
          };

          (mockAxiosInstance.request as jest.Mock)
            .mockResolvedValueOnce(liveResponse)
            .mockResolvedValueOnce(historicalResponse);

          const orders = await exchange.fetchAllOrders();

          // 3 unique orders (order-hist-1 deduped)
          expect(orders).toHaveLength(3);

          // sorted descending: order-live-1, order-hist-1, order-hist-2
          expect(orders[0].id).toBe("order-live-1");
          expect(orders[1].id).toBe("order-hist-1");
          expect(orders[2].id).toBe("order-hist-2");
        });
      });
    });

    describe("Order Status Mapping", () => {
      beforeEach(() => {
        exchange = new KalshiExchange(mockCredentials);
      });

      it("should map resting to open", async () => {
        const mockResponse = {
          data: {
            order: {
              order_id: "order-123",
              ticker: "TEST",
              status: "resting",
              count: 10,
              created_time: "2026-01-13T12:00:00Z",
            },
          },
        };

        (mockAxiosInstance.request as jest.Mock).mockResolvedValue(mockResponse);
        const order = await exchange.fetchOrder("order-123");
        expect(order.status).toBe("open");
      });

      it("should map executed to filled", async () => {
        const mockResponse = {
          data: {
            order: {
              order_id: "order-123",
              ticker: "TEST",
              status: "executed",
              count: 10,
              created_time: "2026-01-13T12:00:00Z",
            },
          },
        };

        (mockAxiosInstance.request as jest.Mock).mockResolvedValue(mockResponse);
        const order = await exchange.fetchOrder("order-123");
        expect(order.status).toBe("filled");
      });
    });
  });
});
