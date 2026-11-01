import { NextResponse } from 'next/server';
// Bundled at build time: Cloudflare Workers has no filesystem to read from at
// request time.
import algoStrategies from '@/packages/investing/src/algo-stategies/algo-strategies.json';
import { BACKTESTABLE_STRATEGIES, CUSTOM_TECHNICAL_STRATEGIES } from '@/lib/technical-strategies';
import { registeredSources } from '@/packages/investing/src/strategy-signals/registry';

const CUSTOM_IDS = new Set<string>(CUSTOM_TECHNICAL_STRATEGIES.map(({ id }) => id));

interface AlgoStrategy {
  url: string;
  description?: string;
  source?: string;
  likes?: number;
  [key: string]: unknown;
}

type StrategyProvider = 'builtin' | 'tradingview' | 'third-party';

interface CatalogStrategy extends AlgoStrategy {
  provider: StrategyProvider;
  /** Whether /api/backtest-technical can run it; TradingView Pine is converted offline only. */
  backtestable: boolean;
  provenance?: { upstream: string; license: string; fidelity: string; venue: string; backtest: string };
}

const builtinStrategies: CatalogStrategy[] = BACKTESTABLE_STRATEGIES.map(({ id, name, description }) => ({
  url: id,
  name,
  description,
  source: '',
  author: CUSTOM_IDS.has(id) ? 'AI Broker (Pine port)' : 'Indicator TS',
  likes: 0,
  script_type: 'strategy',
  provider: 'builtin',
  backtestable: true,
}));

// Sources from third-party-trading-bots/, ported into packages/investing/src/strategy-signals.
const thirdPartyStrategies: CatalogStrategy[] = registeredSources.map(
  ({ source, name, upstreamRepo, license, fidelity, venue, backtest }) => ({
    url: source.id,
    name,
    description: `Signal source derived from third-party-trading-bots/${source.upstream}.`,
    source: '',
    author: upstreamRepo,
    likes: 0,
    script_type: 'strategy',
    provider: 'third-party',
    backtestable: backtest === 'daily-bars',
    provenance: { upstream: source.upstream, license, fidelity, venue, backtest },
  }),
);

const scripts: CatalogStrategy[] = [
  ...builtinStrategies,
  ...thirdPartyStrategies,
  ...(algoStrategies as AlgoStrategy[]).map((strategy) => ({
    ...strategy,
    provider: 'tradingview' as const,
    backtestable: false,
  })),
];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
        const script = scripts.find((s) => s.url === id);
        if (script) {
            return NextResponse.json(script);
        } else {
            return NextResponse.json({ error: 'Script not found' }, { status: 404 });
        }
    }

    // Return summary list (exclude description and source, map likes_count to likes)
    const summaryScripts = scripts.map(({ description, source, likes, ...rest }) => ({
      ...rest,
      likes,
      // description: description.slice(0,500),
      source:  '',
    })).sort((a, b) => {
          return (b.likes || 0) - (a.likes || 0)
  })
    return NextResponse.json(summaryScripts)
  } catch (error) {
    console.error('Error reading algo scripts:', error);
    return NextResponse.json({ error: 'Failed to fetch algo scripts' }, { status: 500 });
  }
}
