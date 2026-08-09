import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    // The app runs from apps/ai-broker-web; the workspace packages live two
    // levels up at the monorepo root.
    const filePath = path.join(process.cwd(), '../../packages/investing/src/algo-stategies/algo-strategies.json');
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Algo scripts file not found' }, { status: 404 });
    }

    const fileContents = fs.readFileSync(filePath, 'utf8');
    const scripts = JSON.parse(fileContents);

    if (id) {
        const script = scripts.find((s: any) => s.url === id);
        if (script) {
            return NextResponse.json(script);
        } else {
            return NextResponse.json({ error: 'Script not found' }, { status: 404 });
        }
    }

    // Return summary list (exclude description and source, map likes_count to likes)
    const summaryScripts = scripts.map(({ description, source, likes, ...rest }: any) => ({
      ...rest,
      likes,
      // description: description.slice(0,500),
      source:  '',
    })).sort((a : any, b: any) => {
          return (b.likes || 0) - (a.likes || 0)
  })
    return NextResponse.json(summaryScripts)
  } catch (error) {
    console.error('Error reading algo scripts:', error);
    return NextResponse.json({ error: 'Failed to fetch algo scripts' }, { status: 500 });
  }
}
