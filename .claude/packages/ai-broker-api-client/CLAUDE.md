# CLAUDE.md — `ai-broker-api-client`

Private (not published from CI). A typed TypeScript client for the Auto
Investment Broker API, **generated** from the project's OpenAPI specification
with [`@hey-api/openapi-ts`](https://heyapi.dev).

## Do not hand-edit the generated files

`src/client.gen.ts`, `src/sdk.gen.ts`, `src/types.gen.ts` and `src/core/` are
output. Editing them works until the next regeneration silently reverts it.

To change the client, change the API:

1. Edit the route in `apps/ai-broker-web/app/api/…`.
2. Update the spec at `apps/ai-broker-web/app/api/openapi.json`.
3. Regenerate: `cd packages/ai-broker-api-client && bun run build:api`.
4. Commit the regenerated files as part of the same change.

Hand-written wrappers, if you need one, go in a new non-`.gen` file next to
`src/index.ts` — never inside the generated ones.

## Commands

```bash
cd packages/ai-broker-api-client
bun run build:api      # regenerate from the OpenAPI spec
bun run test           # vitest
bun run test:api
```
