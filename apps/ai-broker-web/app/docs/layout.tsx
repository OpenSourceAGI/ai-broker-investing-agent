/**
 * @file layout.tsx
 * @description Layout component for documentation pages.
 */
import { NextProvider } from 'fumadocs-core/framework/next'
import { DocsLayout } from 'fumadocs-ui/layouts/notebook'
import { RootProvider } from 'fumadocs-ui/provider/base'
import type { ReactNode } from 'react'
import { baseOptions } from '@/app/layout.config'
import DocsSearchDialog from '@/components/fumadocs/layout/search'
import { source } from '@/lib/fumadocs/source'
import 'fumadocs-ui/style.css'
import 'fumadocs-twoslash/twoslash.css'
import 'fumadocs-openapi/css/preset.css'
import 'katex/dist/katex.min.css'

export default function RootDocsLayout({ children }: { children: ReactNode }) {
  return (
    <NextProvider>
      <RootProvider
        search={{ SearchDialog: DocsSearchDialog }}
        // The app's root layout already mounts next-themes; a second provider
        // here would fight it, and the nav uses the app's own ThemeDropdown.
        theme={{ enabled: false }}
      >
        <DocsLayout tree={source.pageTree} {...baseOptions}>
          {children}
        </DocsLayout>
      </RootProvider>
    </NextProvider>
  )
}
