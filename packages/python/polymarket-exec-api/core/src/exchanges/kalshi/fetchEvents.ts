import { EventFetchParams } from "../../BaseExchange";
import { UnifiedEvent, UnifiedMarket } from "../../types";
import { mapMarketToUnified } from "./utils";
import { kalshiErrorMapper } from "./errors";

type CallApi = (
  operationId: string,
  params?: Record<string, any>,
) => Promise<any>;

async function fetchEventByTicker(
  eventTicker: string,
  callApi: CallApi,
): Promise<UnifiedEvent[]> {
  const normalizedTicker = eventTicker.toUpperCase();
  const data = await callApi("GetEvent", {
    event_ticker: normalizedTicker,
    with_nested_markets: true,
  });

  const event = data.event;
  if (!event) return [];

  const markets: UnifiedMarket[] = [];
  if (event.markets) {
    for (const market of event.markets) {
      const unifiedMarket = mapMarketToUnified(event, market);
      if (unifiedMarket) {
        markets.push(unifiedMarket);
      }
    }
  }

  const unifiedEvent: UnifiedEvent = {
    id: event.event_ticker,
    title: event.title,
    description: event.mututals_description || "",
    slug: event.event_ticker,
    markets: markets,
    url: `https://kalshi.com/events/${event.event_ticker}`,
    image: event.image_url,
    category: event.category,
    tags: event.tags || [],
  };

  return [unifiedEvent];
}

function rawEventToUnified(event: any): UnifiedEvent {
  const markets: UnifiedMarket[] = [];
  if (event.markets) {
    for (const market of event.markets) {
      const unifiedMarket = mapMarketToUnified(event, market);
      if (unifiedMarket) {
        markets.push(unifiedMarket);
      }
    }
  }
  const unifiedEvent: UnifiedEvent = {
    id: event.event_ticker,
    title: event.title,
    description: event.mututals_description || "",
    slug: event.event_ticker,
    markets: markets,
    url: `https://kalshi.com/events/${event.event_ticker}`,
    image: event.image_url,
    category: event.category,
    tags: event.tags || [],
  };

  return unifiedEvent;
}

async function fetchAllWithStatus(
  callApi: CallApi,
  apiStatus: string,
): Promise<any[]> {
  let allEvents: any[] = [];
  let cursor = null;
  let page = 0;

  const MAX_PAGES = 1000;
  const BATCH_SIZE = 200;

  do {
    const queryParams: any = {
      limit: BATCH_SIZE,
      with_nested_markets: true,
      status: apiStatus,
    };
    if (cursor) queryParams.cursor = cursor;

    const data = await callApi("GetEvents", queryParams);
    const events = data.events || [];

    if (events.length === 0) break;

    allEvents = allEvents.concat(events);
    cursor = data.cursor;
    page++;
  } while (cursor && page < MAX_PAGES);

  return allEvents;
}

export async function fetchEvents(
  params: EventFetchParams,
  callApi: CallApi,
): Promise<UnifiedEvent[]> {
  try {
    // Handle eventId lookup (direct API call)
    if (params.eventId) {
      return await fetchEventByTicker(params.eventId, callApi);
    }

    // Handle slug lookup (slug IS the event ticker on Kalshi)
    if (params.slug) {
      return await fetchEventByTicker(params.slug, callApi);
    }

    const status = params?.status || "active";
    const limit = params?.limit || 10000;
    const query = (params?.query || "").toLowerCase();

    let events: any[] = [];
    if (status === "all") {
      const [openEvents, closedEvents, settledEvents] = await Promise.all([
        fetchAllWithStatus(callApi, "open"),
        fetchAllWithStatus(callApi, "closed"),
        fetchAllWithStatus(callApi, "settled"),
      ]);
      events = [...openEvents, ...closedEvents, ...settledEvents];
    } else if (status === "closed" || status === "inactive") {
      const [closedEvents, settledEvents] = await Promise.all([
        fetchAllWithStatus(callApi, "closed"),
        fetchAllWithStatus(callApi, "settled"),
      ]);
      events = [...closedEvents, ...settledEvents];
    } else {
      events = await fetchAllWithStatus(callApi, "open");
    }

    // Apply keyword filter if a query was provided
    const filtered = query
      ? events.filter((event: any) =>
        (event.title || "").toLowerCase().includes(query),
      )
      : events;

    // Client-side sort — Kalshi's /events endpoint has no sort param.
    // We aggregate stats from nested markets and sort the full set before slicing.
    const sort = params?.sort || "volume";
    const sorted = sortRawEvents(filtered, sort);

    const unifiedEvents: UnifiedEvent[] = sorted.map(rawEventToUnified);
    return unifiedEvents.slice(0, limit);
  } catch (error: any) {
    throw kalshiErrorMapper.mapError(error);
  }
}

function eventVolume(event: any): number {
  return (event.markets || []).reduce(
    (sum: number, m: any) => sum + Number(m.volume || 0),
    0,
  );
}

function eventLiquidity(event: any): number {
  return (event.markets || []).reduce(
    (sum: number, m: any) => sum + Number(m.open_interest || m.liquidity || 0),
    0,
  );
}

function eventNewest(event: any): number {
  // Use the earliest close_time across markets as a proxy for "newness"
  const times = (event.markets || [])
    .map((m: any) => (m.close_time ? new Date(m.close_time).getTime() : 0))
    .filter((t: number) => t > 0);
  return times.length > 0 ? Math.min(...times) : 0;
}

function sortRawEvents(events: any[], sort: string): any[] {
  const copy = [...events];
  if (sort === "newest") {
    copy.sort((a, b) => eventNewest(b) - eventNewest(a));
  } else if (sort === "liquidity") {
    copy.sort((a, b) => eventLiquidity(b) - eventLiquidity(a));
  } else {
    // Default: volume
    copy.sort((a, b) => eventVolume(b) - eventVolume(a));
  }
  return copy;
}
