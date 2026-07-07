# Contributing to pmxt

If you contribute, you'll get the Contributor rank on the Discord!

Welcome! We love contributors. This project is a monorepo setup to support multiple languages while keeping the core logic centralized.

## Repository Structure

- **[core](./core)**: The heart of the project. Contains the server implementation and the native Node.js library (`pmxt-core`).
- **[sdks/python](./sdks/python)**: The Python SDK. (Pip package `pmxt`).
- **[sdks/typescript](./sdks/typescript)**: The TypeScript/Node.js SDK (`pmxtjs`).

## Prerequisites

- **Node.js >= 18** (20+ recommended; used in CI)
- **npm** (comes with Node.js)

## Monorepo Basics

This project uses [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces). Run `npm install` from the **root** -- it installs dependencies for all packages. Root-level scripts delegate to the right workspace automatically:

```bash
npm run dev       # builds core in watch mode + starts server
npm run server    # starts the sidecar server (core workspace)
npm run generate  # regenerates all SDK clients from the OpenAPI spec
npm test          # runs the full verification suite
```

If you need to run a script in a specific workspace directly:

```bash
npm run build --workspace=pmxt-core
npm test --workspace=pmxtjs
```

## Getting Started

### 1. Running the Server (Core)

The server is the backbone of the SDKs. To develop on it or run it locally:

```bash
# From the root
npm run server
```

Or navigating manually:

```bash
cd core
npm install
npm run server
```

### 2. Developing the Python SDK

See the [Python SDK Development Guide](./sdks/SDK_DEVELOPMENT.md) for detailed instructions on generating and testing the Python client.

## Development Workflow

This project uses a **Sidecar Server Architecture**: the core logic is in TypeScript (`core/`), which SDKs spawn as a background process.

Exchange integrations use an **Implicit API pattern**: each exchange has an `api.ts` file (generated from the exchange's OpenAPI spec) that auto-generates callable methods. Unified exchange methods call these via `callApi('OperationId', params)`. See [Architecture Overview](./ARCHITECTURE.md) for a full explanation before touching exchange code.

### Adding Methods to the Exchange Interface

When adding a public method to `BaseExchange.ts`:

1. Add the method signature and JSDoc comment
2. Regenerate the OpenAPI spec:
   ```bash
   npm run generate:openapi --workspace=pmxt-core
   ```
3. Commit both the method and the regenerated `openapi.yaml`
4. A GitHub Actions workflow will verify the spec is in sync on your PR

The OpenAPI spec is auto-generated from `BaseExchange.ts` via TypeScript AST parsing, so no manual spec editing is needed.

### Quick Start: Single Command Dev Mode
From the root directory, run:

```bash
npm run dev
```

This starts both the build watcher and the server concurrently. The SDKs will auto-restart on code changes via a version hash.

### Manual Setup (if needed)
If you prefer to run things separately:

```bash
# Terminal 1: Build watcher
cd core && npm run build -- --watch

# Terminal 2: Server
npm run server
```

### Manual Forced Restart
If you need a guaranteed fresh server state:
```bash
export PMXT_ALWAYS_RESTART=1
# Run your SDK script
```

## Stopping the Server
If the server doesn't shut down cleanly, use:

```bash
python3 -c "import sys; sys.path.insert(0, 'sdks/python'); import pmxt; pmxt.stop_server()"
```

## Further Reading

- **[Architecture Overview](./ARCHITECTURE.md)** -- How the sidecar pattern works, request lifecycle, and where different types of changes go
- **[Adding an Exchange](./core/ADDING_AN_EXCHANGE.md)** -- Step-by-step guide for implementing a new exchange integration

Thank you for helping us build the future of prediction markets!
