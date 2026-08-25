import { NextResponse } from 'next/server';
// Bundled at build time: Cloudflare Workers has no filesystem to read from at
// request time.
import algoStrategies from '@/packages/investing/src/algo-stategies/algo-strategies.json';

interface AlgoStrategy {
  url: string;
  description?: string;
  source?: string;
  likes?: number;
  [key: string]: unknown;
}

const scripts = algoStrategies as AlgoStrategy[];

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
