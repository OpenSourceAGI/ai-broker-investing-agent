/**
 * @file customize-docs.ts
 * @description Documentation configuration object and types.
 *
 * Single source of truth for the branding, GitHub links, and nav links used by
 * the docs shell (`app/layout.config.tsx`, `app/docs/**`). Change the values
 * here rather than editing the layout components.
 */
export const docsConfig: DocsConfig = {
  title: 'AI Broker',
  description:
    'Trading bots with news research analysts, algorithmic entry/exit signals, copy experts, and prediction markets',
  github: 'https://github.com/OpenSourceAGI/ai-broker-investing-agent',
  githubPackages:
    'https://github.com/OpenSourceAGI/ai-broker-investing-agent/tree/main/packages',
  githubDocs:
    'https://github.com/OpenSourceAGI/ai-broker-investing-agent/tree/main/apps/ai-broker-web/content/docs',
  favicon: '/favicon.ico',
  apiDocsPath: './content/docs/ai-broker-openapi.json',
  topLinks: [
    {
      text: 'Docs',
      url: '/docs',
    },
    {
      text: 'Dashboard',
      url: '/dashboard',
    },
    {
      text: 'GitHub',
      url: 'https://github.com/OpenSourceAGI/ai-broker-investing-agent',
      external: true,
    },
  ],
}

export interface DocsConfig {
  /** The title of the documentation site */
  title?: string
  /** A short description of the project */
  description?: string
  /** URL to the GitHub repository */
  github?: string
  /** Base URL for editing the docs pages on GitHub */
  githubDocs?: string
  /** Base URL for the packages directory on GitHub */
  githubPackages?: string
  /** Path to the favicon */
  favicon?: string
  /** Path to the OpenAPI specification file */
  apiDocsPath?: string
  /** Links to be displayed in the navigation bar */
  topLinks?: {
    text: string
    url: string
    external?: boolean
  }[]
}
