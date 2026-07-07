import axios from "axios";
import { HistoryFilterParams, TradesParams } from "../../BaseExchange";
import { Trade } from "../../types";
import { kalshiErrorMapper } from "./errors";
import { getMarketsUrl } from "./config";

export async function fetchTrades(
  baseUrl: string,
  id: string,
  params: TradesParams | HistoryFilterParams,
): Promise<Trade[]> {
  try {
    const ticker = id.replace(/-NO$/, "");
    const url = getMarketsUrl(baseUrl, undefined, ["trades"]);
    const response = await axios.get(url, {
      params: {
        ticker: ticker,
        limit: params.limit || 100,
      },
    });
    const trades = response.data.trades || [];

    return trades.map((t: any) => ({
      id: t.trade_id,
      timestamp: new Date(t.created_time).getTime(),
      price: t.yes_price / 100,
      amount: t.count,
      side: t.taker_side === "yes" ? "buy" : "sell",
    }));
  } catch (error: any) {
    throw kalshiErrorMapper.mapError(error);
  }
}
