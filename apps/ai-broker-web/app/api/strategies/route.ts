import { NextResponse } from 'next/server';
// Bundled at build time: Cloudflare Workers has no filesystem to read from at
// request time.
import algoStrategies from '@/packages/investing/src/algo-stategies/algo-strategies.json';
import { TECHNICAL_STRATEGIES } from '@/lib/technical-strategies';

interface AlgoStrategy {
  url: string;
  description?: string;
  source?: string;
  likes?: number;
  [key: string]: unknown;
}

type StrategyProvider = 'builtin' | 'tradingview';

interface CatalogStrategy extends AlgoStrategy {
  provider: StrategyProvider;
}

const builtinStrategies: CatalogStrategy[] = TECHNICAL_STRATEGIES.map(({ id, name, description }) => ({
  url: id,
  name,
  description,
  source: '',
  author: 'Indicator TS',
  likes: 0,
  script_type: 'strategy',
  provider: 'builtin',
}));

const scripts: CatalogStrategy[] = [
  ...builtinStrategies,
  ...(algoStrategies as AlgoStrategy[]).map((strategy) => ({ ...strategy, provider: 'tradingview' as const })),
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
