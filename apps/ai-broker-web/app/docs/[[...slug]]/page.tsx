/**
 * @file page.tsx
 * @description Dynamic documentation page component that renders MDX content.
 */
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/page'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AskAIDropdown } from '@/components/fumadocs/ai/ask-ai-dropdown'
import { LLMCopyButton } from '@/components/fumadocs/ai/llm-copy-button'
import { Breadcrumb } from '@/components/fumadocs/layout/breadcrumb'
import { docsConfig } from '@/lib/fumadocs/customize-docs'
import { source } from '@/lib/fumadocs/source'
import { getMDXComponents } from '@/mdx-components'

export const revalidate = false

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>
}) {
  const params = await props.params
  const page = source.getPage(params.slug)

  if (!page) {
    notFound()
  }

  const { body: MDX, toc } = await page.data.load()

  // Raw Markdown for the copy button and the "Ask AI" links. Served by
  // `app/docs/llms.mdx/[[...slug]]/route.ts`.
  const markdownUrl = ['/docs/llms.mdx', ...page.slugs].join('/')

  return (
    <DocsPage toc={toc} full={page.data.full}>
      <Breadcrumb tree={source.pageTree} />
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <div className='flex flex-row items-center gap-2 border-b pt-2 pb-6'>
          <LLMCopyButton markdownUrl={markdownUrl} />
          <AskAIDropdown
            markdownUrl={markdownUrl}
            githubUrl={
              docsConfig.githubDocs
                ? `${docsConfig.githubDocs}/${page.path}`
                : undefined
            }
          />
        </div>

        <MDX components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  )
}

export function generateStaticParams() {
  return source.generateParams()
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>
}): Promise<Metadata> {
  const params = await props.params
  const page = source.getPage(params.slug)
  if (!page) notFound()

  return {
    title: page.data.title,
    description: page.data.description ?? docsConfig.description,
  }
}
