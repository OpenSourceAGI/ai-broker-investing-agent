/**
 * @file layout.config.tsx
 * @description Configuration for the documentation layout, including navigation and links.
 *
 * Branding and URLs come from `lib/fumadocs/customize-docs.ts` — edit that file
 * rather than this one.
 */
import type { LinkItemType } from 'fumadocs-ui/layouts/shared'
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'
import { BookOpen, Link2 } from 'lucide-react'
import { ThemeDropdown } from '@/components/fumadocs/layout/theme-dropdown'
import { docsConfig } from '@/lib/fumadocs/customize-docs'

const topLinks: LinkItemType[] = (docsConfig.topLinks ?? []).map((link) => ({
  text: link.text,
  url: link.url,
  external: link.external ?? false,
  icon: link.url === '/docs' ? <BookOpen /> : undefined,
}))

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <span className='inline-flex items-center gap-2'>
        {docsConfig.favicon ? (
          <img
            src={docsConfig.favicon}
            alt={docsConfig.title ?? 'Logo'}
            className='size-5'
          />
        ) : (
          <Link2 />
        )}
        {docsConfig.title}
      </span>
    ),
  },
  links: [
    ...topLinks,
    {
      type: 'custom' as const,
      children: <ThemeDropdown />,
    },
  ],
  githubUrl: docsConfig.github,
}
