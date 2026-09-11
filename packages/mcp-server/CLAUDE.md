# CLAUDE.md — `api-mcp-server`

Private (not published). An MCP server exposing the broker API as 33 tools,
**generated** from the same OpenAPI specification as
`packages/ai-broker-api-client`, using the [mcp-use](https://mcp-use.com)
framework. Streamable HTTP transport, with a built-in inspector at
`/inspector`.

## Do not hand-edit

`src/tools-config.js`, `src/http-client.js` and `src/index.js` are generated
output. Change the route and the spec in `apps/ai-broker-web`, then regenerate.
A hand-edit here survives exactly until the next regeneration.

There is **no test script** in this workspace, and that is deliberate — it has
no hand-written behaviour to test. If you find yourself wanting one, the logic
you are adding probably belongs in `packages/investing` instead.

## Commands

```bash
cd packages/mcp-server
bun run dev
bun run start
```
