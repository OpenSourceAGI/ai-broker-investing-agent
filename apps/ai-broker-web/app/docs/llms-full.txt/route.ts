/**
 * @file route.ts
 * @description API route that generates a full text version of the documentation for LLM consumption.
 */
import { getLLMText, source } from '@/lib/fumadocs/source'

export const revalidate = false

export async function GET() {
  const scan = source.getPages().map(getLLMText)
  const scanned = await Promise.all(scan)

  return new Response(scanned.join('\n\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
}
