/**
 * @file source.tsx
 * @description Fumadocs source loader configuration and page structure.
 *
 * `docs` is generated from `source.config.ts` by the fumadocs-mdx Vite plugin
 * (see `vite.config.ts`, which aliases `fumadocs-mdx:collections/server` to
 * `.source/server.ts`).
 */
import {
  type InferMetaType,
  type InferPageType,
  type LoaderPlugin,
  loader,
} from 'fumadocs-core/source'
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons'
import { docs } from 'fumadocs-mdx:collections/server'
import { openapiPlugin } from 'fumadocs-openapi/server'

export const source = loader({
  baseUrl: '/docs',
  plugins: [pageTreeCodeTitles(), lucideIconsPlugin(), openapiPlugin()],
  source: docs.toFumadocsSource(),
})

/**
 * Renders sidebar entries that name a function (`foo()`) or a component
 * (`<Foo />`) as inline code so API pages stand out from prose pages.
 */
function pageTreeCodeTitles(): LoaderPlugin {
  return {
    transformPageTree: {
      file(node) {
        if (
          typeof node.name === 'string' &&
          (node.name.endsWith('()') || node.name.match(/^<\w+ \/>$/))
        ) {
          return {
            ...node,
            name: <code className='text-[0.8125rem]'>{node.name}</code>,
          }
        }
        return node
      },
    },
  }
}

/**
 * Plain-text rendering of a page, used by the `llms.txt` style routes and by
 * the "Copy for LLM" button.
 */
export async function getLLMText(page: InferPageType<typeof source>) {
  const processed = await page.data.getText('processed')

  return `# ${page.data.title} (${page.url})

${processed}`
}

export type Page = InferPageType<typeof source>
export type Meta = InferMetaType<typeof source>
