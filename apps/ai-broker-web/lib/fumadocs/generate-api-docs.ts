/**
 * @file generate-api-docs.ts
 * @description Script to generate API documentation files from an OpenAPI specification.
 *
 * Run with `bun run docs:generate:api [path-to-openapi.json]`. With no argument
 * it falls back to `docsConfig.apiDocsPath`.
 */
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { generateFiles } from 'fumadocs-openapi'
import { createOpenAPI } from 'fumadocs-openapi/server'
import { docsConfig } from './customize-docs'

const out = 'content/docs/reference/api'

async function generate(openapiPath: string | undefined) {
  if (!openapiPath || !existsSync(openapiPath)) {
    console.error(
      `Error: OpenAPI file not found${openapiPath ? ` at "${openapiPath}"` : ''}`
    )
    process.exit(1)
  }

  console.log(`Generating API docs from: ${openapiPath}`)

  // Clean the previously generated pages before regenerating.
  await rm(out, { recursive: true, force: true })

  const openapi = createOpenAPI({
    input: [openapiPath],
  })

  await generateFiles({
    input: openapi,
    output: out,
    // One page per OpenAPI tag.
    per: 'tag',
    includeDescription: true,
    addGeneratedComment: false,
    meta: true,
  })

  console.log(`API documentation generated successfully in: ${out}`)
}

const args = process.argv.slice(2)
const openapiPath = args[0] || docsConfig.apiDocsPath

if (!openapiPath) {
  console.error('Error: OpenAPI file path not provided')
  process.exit(1)
}

void generate(openapiPath)
