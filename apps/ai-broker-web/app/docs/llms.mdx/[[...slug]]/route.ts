/**
 * @file route.ts
 * @description Serves the raw Markdown of a docs page for LLMs and the "Copy" button.
 *
 * `/docs/llms.mdx/<slug>` mirrors the page at `/docs/<slug>`.
 */
import { notFound } from 'next/navigation'
import { getLLMText, source } from '@/lib/fumadocs/source'

export const revalidate = false

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug?: string[] }> }
) {
  const { slug } = await params
  // Tolerate a trailing `.mdx` so both `/docs/llms.mdx/a/b` and
  // `/docs/llms.mdx/a/b.mdx` resolve to the same page.
  const cleanSlug = slug?.map((segment, i) =>
    i === slug.length - 1 ? segment.replace(/\.mdx$/, '') : segment
  )
  const page = source.getPage(cleanSlug)
  if (!page) notFound()

  return new Response(await getLLMText(page), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
}

export function generateStaticParams() {
  return source.generateParams()
}
