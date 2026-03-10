# SDK Development Guide

This document explains how the PMXT SDK generation works and how to maintain it.

## Architecture

PMXT uses a **"Sidecar" architecture** for multi-language support:

```
┌─────────────────┐
│  Language Client│
│   (pmxt SDK)    │
└────────┬────────┘
         │ HTTP
         ▼
┌─────────────────┐
│  Node.js Server │ ◄── The "Sidecar"
│   (pmxt-server) │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌────────┐
│Polymarket│ │Kalshi│
└────────┘ └────────┘
```

### Why This Approach?

1. **Single Source of Truth**: The implementation in `core/` is the canonical version
2. **Consistency**: All languages get identical behavior
3. **Rapid Iteration**: Update the server, all SDKs update automatically
4. **Quality**: We can write the core logic once, in TypeScript, with full testing

## General Directory Structure

All SDKs follow this pattern:

```
sdks/
└── {language}/
    ├── pmxt/                    # Human-written wrapper (EDIT THIS)
    │   └── ...                 # Clean, idiomatic code
    ├── {generated}/             # Auto-generated client (DO NOT EDIT)
    │   └── ...                 # Raw OpenAPI client
    ├── examples/
    └── {package-manager-files}
```

### The Golden Rule

**NEVER manually edit files in the generated directory**. They will be overwritten.

All human logic goes in the `pmxt/` directory (the wrapper).

## Supported Languages

### 1. Python (`sdks/python`)

- **Reference**: [sdks/python/README.md](./python/README.md)
- **Generator**: `python`
- **Generated Dir**: `sdks/python/generated/`
- **Wrapper Dir**: `sdks/python/pmxt/`

### 2. TypeScript (`sdks/typescript`)

- **Reference**: [sdks/typescript/README.md](./typescript/README.md)
- **Generator**: `typescript-fetch`
- **Generated Dir**: `sdks/typescript/src/`
- **Wrapper Dir**: `sdks/typescript/pmxt/`

## Generating SDKs

To regenerate all SDKs after updating the server specification:

```bash
# In the root or core directory
npm run generate:sdk:all
```

To generate a specific language:

```bash
# Python
npm run generate:sdk:python

# TypeScript
npm run generate:sdk:typescript
```

## The Human Wrapper Pattern

The "wrapper" is a handwritten layer that sits on top of the auto-generated code. Its job is to make the API feel native and clean for that language.

### Responsibilities

1.  **Hide the Ugly**: Generated code is often verbose. The wrapper hides this.
2.  **Provide Idiomatic API**: Use language-specific features (e.g., Python properties, TypeScript interfaces).
3.  **Manage Server Lifecycle**: Include the `ServerManager` to auto-start the sidecar.
4.  **Simplify Models**: Convert complex generated schemas into simple data classes/interfaces.

### Example: Python vs TypeScript

**Python Wrapper (`sdks/python/pmxt/client.py`)**:

```python
class Exchange(ABC):
    def search_markets(self, query):
        # Calls self._api.search_markets()
        # Converts response to UnifiedMarket dataclass
        pass
```

**TypeScript Wrapper (`sdks/typescript/pmxt/client.ts`)**:

```typescript
export abstract class Exchange {
  async searchMarkets(query: string): Promise<UnifiedMarket[]> {
    // Calls this.api.searchMarkets()
    // Converts response to UnifiedMarket interface
    return markets;
  }
}
```

## Maintaining the SDKs

When you add a new endpoint to the OpenAPI spec:

1.  **Update `src/server/openapi.yaml`** with the new endpoint.
2.  **Regenerate** SDKs: `npm run generate:sdk:all`.
3.  **Update the wrappers**:
    *   **Python**: Update `sdks/python/pmxt/client.py` & `models.py`.
    *   **TypeScript**: Update `sdks/typescript/pmxt/client.ts` & `models.ts`.

## Testing

Always test your changes in **both** languages.

### Python

```bash
cd sdks/python
pip install -e ".[dev]"
python examples/*
```

### TypeScript

```bash
cd sdks/typescript
npm install
npm run build
npx tsx examples/*
```

## Publishing

### Python (PyPI)

```bash
cd sdks/python
python -m build
python -m twine upload dist/*
```

### TypeScript (NPM)

```bash
cd sdks/typescript
npm publish --access public
```

## Version Bumping

When releasing a new version:

1.  Update `core/package.json` version.
2.  Update `sdks/python/pyproject.toml` version.
3.  Update `sdks/typescript/package.json` version.
4.  Regenerate SDKs: `npm run generate:sdk:all`.
5.  Commit and tag.

## Future: Native Bindings (v2.0.0)

Eventually, we'll move to native bindings (Rust + FFI) to eliminate the sidecar dependency. But for v1.0.0, the sidecar approach lets us move fast and support many languages with minimal effort.

## Questions?

See the main [ROADMAP.md](../ROADMAP.md) for the overall project vision.
