'use strict';

/**
 * Generates openapi.yaml from BaseExchange.ts using the TypeScript compiler AST.
 * Run: node core/scripts/generate-openapi.js
 * Adding a public method to BaseExchange.ts is sufficient to include it in the spec.
 */

const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const BASE_EXCHANGE_PATH = path.join(__dirname, '../src/BaseExchange.ts');
const OPENAPI_OUT_PATH = path.join(__dirname, '../src/server/openapi.yaml');

const EXCLUDED_METHODS = new Set(['callApi', 'defineImplicitApi']);

// Map TypeScript type names to OpenAPI component schema names
const TYPE_REF_MAP = {
  UnifiedMarket: 'UnifiedMarket',
  UnifiedEvent: 'UnifiedEvent',
  MarketOutcome: 'MarketOutcome',
  Order: 'Order',
  Trade: 'Trade',
  UserTrade: 'UserTrade',
  Position: 'Position',
  Balance: 'Balance',
  PriceCandle: 'PriceCandle',
  OrderBook: 'OrderBook',
  OrderLevel: 'OrderLevel',
  ExecutionPriceResult: 'ExecutionPriceResult',
  PaginatedMarketsResult: 'PaginatedMarketsResult',
  // MarketFetchParams is an alias for MarketFilterParams
  MarketFetchParams: 'MarketFilterParams',
  MarketFilterParams: 'MarketFilterParams',
  EventFetchParams: 'EventFetchParams',
  OHLCVParams: 'OHLCVParams',
  HistoryFilterParams: 'HistoryFilterParams',
  TradesParams: 'TradesParams',
  CreateOrderParams: 'CreateOrderParams',
  MyTradesParams: 'MyTradesParams',
  OrderHistoryParams: 'OrderHistoryParams',
};

// ---------------------------------------------------------------------------
// Type node → OpenAPI schema
// ---------------------------------------------------------------------------

function typeNodeToSchema(node, sourceFile) {
  if (!node) return {};

  switch (node.kind) {
    case ts.SyntaxKind.StringKeyword:
      return { type: 'string' };
    case ts.SyntaxKind.NumberKeyword:
      return { type: 'number' };
    case ts.SyntaxKind.BooleanKeyword:
      return { type: 'boolean' };
    case ts.SyntaxKind.VoidKeyword:
    case ts.SyntaxKind.NullKeyword:
    case ts.SyntaxKind.UndefinedKeyword:
      return null;

    case ts.SyntaxKind.ArrayType: {
      const items = typeNodeToSchema(node.elementType, sourceFile);
      return { type: 'array', items: items || {} };
    }

    case ts.SyntaxKind.TypeReference: {
      const typeName = node.typeName;
      const name =
        typeName.kind === ts.SyntaxKind.Identifier
          ? typeName.text
          : typeName.right.text; // QualifiedName: take the rightmost part

      if (name === 'Promise') {
        const arg = node.typeArguments && node.typeArguments[0];
        return typeNodeToSchema(arg, sourceFile);
      }

      if (name === 'Record') {
        const valTypeNode = node.typeArguments && node.typeArguments[1];
        const valSchema = typeNodeToSchema(valTypeNode, sourceFile);
        return { type: 'object', additionalProperties: valSchema || {} };
      }

      if (TYPE_REF_MAP[name]) {
        return { $ref: `#/components/schemas/${TYPE_REF_MAP[name]}` };
      }

      // Unknown type reference — approximate as generic object
      return { type: 'object' };
    }

    case ts.SyntaxKind.UnionType: {
      const members = node.types;
      const nonNull = members.filter(
        t =>
          t.kind !== ts.SyntaxKind.NullKeyword &&
          t.kind !== ts.SyntaxKind.UndefinedKeyword
      );

      if (nonNull.length === 0) return null;

      // All string literals → enum
      if (
        nonNull.every(
          t =>
            t.kind === ts.SyntaxKind.LiteralType &&
            t.literal.kind === ts.SyntaxKind.StringLiteral
        )
      ) {
        return { type: 'string', enum: nonNull.map(t => t.literal.text) };
      }

      if (nonNull.length === 1) return typeNodeToSchema(nonNull[0], sourceFile);

      const schemas = nonNull
        .map(t => typeNodeToSchema(t, sourceFile))
        .filter(s => s !== null);
      if (schemas.length === 0) return null;
      if (schemas.length === 1) return schemas[0];
      return { oneOf: schemas };
    }

    case ts.SyntaxKind.LiteralType: {
      const lit = node.literal;
      if (lit.kind === ts.SyntaxKind.StringLiteral) {
        return { type: 'string', enum: [lit.text] };
      }
      if (lit.kind === ts.SyntaxKind.NumericLiteral) {
        return { type: 'number' };
      }
      if (
        lit.kind === ts.SyntaxKind.TrueKeyword ||
        lit.kind === ts.SyntaxKind.FalseKeyword
      ) {
        return { type: 'boolean' };
      }
      return {};
    }

    case ts.SyntaxKind.TypeLiteral: {
      // Inline object type: { key?: T; ... }
      const properties = {};
      const requiredProps = [];
      for (const member of node.members) {
        if (member.kind !== ts.SyntaxKind.PropertySignature || !member.name) {
          continue;
        }
        let propName;
        if (member.name.kind === ts.SyntaxKind.Identifier) {
          propName = member.name.text;
        } else if (member.name.kind === ts.SyntaxKind.StringLiteral) {
          propName = member.name.text;
        } else {
          continue; // Skip computed property names
        }
        const isOptional = !!member.questionToken;
        const propSchema = typeNodeToSchema(member.type, sourceFile);
        if (propSchema !== null) {
          properties[propName] = propSchema;
          if (!isOptional) requiredProps.push(propName);
        }
      }
      const result = { type: 'object', properties };
      if (requiredProps.length > 0) result.required = requiredProps;
      return result;
    }

    case ts.SyntaxKind.FunctionType:
    case ts.SyntaxKind.ConstructorType:
      // Function types can't cross an HTTP boundary; approximate as object
      return { type: 'object' };

    case ts.SyntaxKind.ParenthesizedType:
      return typeNodeToSchema(node.type, sourceFile);

    default:
      return { type: 'object' };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function camelToTitle(name) {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}

function getJSDocDescription(node, sourceFile) {
  const ranges = ts.getLeadingCommentRanges(sourceFile.text, node.pos);
  if (!ranges || ranges.length === 0) return null;

  for (let i = ranges.length - 1; i >= 0; i--) {
    const r = ranges[i];
    const text = sourceFile.text.slice(r.pos, r.end);
    if (!text.startsWith('/**')) continue;

    // Strip /** ... */ and leading " * " on each line
    const inner = text.slice(3, -2);
    const lines = inner
      .split('\n')
      .map(l => l.replace(/^\s*\*\s?/, '').trimEnd());

    // Collect lines until we hit a @tag
    const descLines = [];
    for (const line of lines) {
      if (line.trimStart().startsWith('@')) break;
      descLines.push(line);
    }

    const description = descLines
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return description || null;
  }
  return null;
}

function isPublicMethod(node) {
  if (!node.modifiers) return true;
  for (const mod of node.modifiers) {
    if (
      mod.kind === ts.SyntaxKind.PrivateKeyword ||
      mod.kind === ts.SyntaxKind.ProtectedKeyword ||
      mod.kind === ts.SyntaxKind.AbstractKeyword
    ) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Build a single OpenAPI path entry from a MethodDeclaration node
// ---------------------------------------------------------------------------

function buildPathSpec(method, sourceFile) {
  const name = method.name.text;
  const params = method.parameters;

  let requiredCount = 0;
  for (const p of params) {
    if (!p.questionToken && !p.initializer) requiredCount++;
  }
  const totalCount = params.length;

  // Build the args array schema
  let argsSchema;
  if (totalCount === 0) {
    argsSchema = { type: 'array', maxItems: 0, items: {} };
  } else if (totalCount === 1) {
    const p = params[0];
    const itemSchema = typeNodeToSchema(p.type, sourceFile) || {};
    argsSchema = { type: 'array', maxItems: 1, items: itemSchema };
    if (requiredCount === 1) argsSchema.minItems = 1;
  } else {
    const itemSchemas = params.map(p => typeNodeToSchema(p.type, sourceFile) || {});
    argsSchema = {
      type: 'array',
      minItems: requiredCount,
      maxItems: totalCount,
      items: { oneOf: itemSchemas },
    };
  }

  // Build the response schema from the return type
  const returnSchema = method.type ? typeNodeToSchema(method.type, sourceFile) : null;

  let responseSchema;
  if (returnSchema === null) {
    // void — just reference BaseResponse
    responseSchema = { $ref: '#/components/schemas/BaseResponse' };
  } else {
    responseSchema = {
      allOf: [
        { $ref: '#/components/schemas/BaseResponse' },
        { type: 'object', properties: { data: returnSchema } },
      ],
    };
  }

  const requestBodySchema = {
    title: name.charAt(0).toUpperCase() + name.slice(1) + 'Request',
    type: 'object',
    properties: {
      args: argsSchema,
      credentials: { $ref: '#/components/schemas/ExchangeCredentials' },
    },
  };
  if (requiredCount > 0) {
    requestBodySchema.required = ['args'];
  }

  const description = getJSDocDescription(method, sourceFile);
  const summary = camelToTitle(name);

  const pathObj = {
    post: {
      summary,
      operationId: name,
      parameters: [{ $ref: '#/components/parameters/ExchangeParam' }],
      requestBody: {
        content: {
          'application/json': { schema: requestBodySchema },
        },
      },
      responses: {
        '200': {
          description: `${summary} response`,
          content: {
            'application/json': { schema: responseSchema },
          },
        },
      },
    },
  };

  if (description) {
    pathObj.post.description = description;
  }

  return { name, pathObj };
}

// ---------------------------------------------------------------------------
// Parse BaseExchange.ts and extract public MethodDeclaration nodes
// ---------------------------------------------------------------------------

function extractMethods(sourceFile) {
  const methods = [];

  function visitClass(classNode) {
    for (const member of classNode.members) {
      if (member.kind !== ts.SyntaxKind.MethodDeclaration) continue;
      if (!isPublicMethod(member)) continue;

      const name =
        member.name && member.name.kind === ts.SyntaxKind.Identifier
          ? member.name.text
          : null;
      if (!name) continue;
      if (EXCLUDED_METHODS.has(name)) continue;

      methods.push(member);
    }
  }

  function visit(node) {
    if (node.kind === ts.SyntaxKind.ClassDeclaration) {
      visitClass(node);
      return; // Don't descend into nested classes
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return methods;
}

// ---------------------------------------------------------------------------
// Static component schemas (embedded — not parsed from source)
// ---------------------------------------------------------------------------

const SCHEMAS = {
  // Response wrappers
  BaseResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      error: { $ref: '#/components/schemas/ErrorDetail' },
    },
  },
  ErrorDetail: {
    type: 'object',
    properties: {
      message: { type: 'string' },
    },
  },
  BaseRequest: {
    type: 'object',
    description: 'Base request structure with optional credentials',
    properties: {
      credentials: { $ref: '#/components/schemas/ExchangeCredentials' },
    },
  },
  ErrorResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      error: { $ref: '#/components/schemas/ErrorDetail' },
    },
  },

  // Core data models
  UnifiedMarket: {
    type: 'object',
    properties: {
      marketId: { type: 'string', description: 'The unique identifier for this market' },
      title: { type: 'string' },
      description: { type: 'string' },
      outcomes: { type: 'array', items: { $ref: '#/components/schemas/MarketOutcome' } },
      eventId: { type: 'string', description: 'Link to parent event' },
      resolutionDate: { type: 'string', format: 'date-time' },
      volume24h: { type: 'number' },
      volume: { type: 'number' },
      liquidity: { type: 'number' },
      openInterest: { type: 'number' },
      url: { type: 'string' },
      image: { type: 'string' },
      category: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      yes: { $ref: '#/components/schemas/MarketOutcome' },
      no: { $ref: '#/components/schemas/MarketOutcome' },
      up: { $ref: '#/components/schemas/MarketOutcome' },
      down: { $ref: '#/components/schemas/MarketOutcome' },
    },
  },
  MarketOutcome: {
    type: 'object',
    properties: {
      outcomeId: {
        type: 'string',
        description:
          'Outcome ID for trading operations (CLOB Token ID for Polymarket, Market Ticker for Kalshi)',
      },
      marketId: {
        type: 'string',
        description: 'The market this outcome belongs to (set automatically)',
      },
      label: { type: 'string' },
      price: { type: 'number' },
      priceChange24h: { type: 'number' },
      metadata: {
        type: 'object',
        additionalProperties: true,
        description: 'Exchange-specific metadata (e.g., clobTokenId for Polymarket)',
      },
    },
  },
  UnifiedEvent: {
    type: 'object',
    description:
      'A grouped collection of related markets (e.g., "Who will be Fed Chair?" contains multiple candidate markets)',
    properties: {
      id: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
      slug: { type: 'string' },
      markets: { type: 'array', items: { $ref: '#/components/schemas/UnifiedMarket' } },
      url: { type: 'string' },
      image: { type: 'string' },
      category: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
    },
  },
  PriceCandle: {
    type: 'object',
    properties: {
      timestamp: { type: 'integer' },
      open: { type: 'number' },
      high: { type: 'number' },
      low: { type: 'number' },
      close: { type: 'number' },
      volume: { type: 'number' },
    },
  },
  OrderBook: {
    type: 'object',
    properties: {
      bids: { type: 'array', items: { $ref: '#/components/schemas/OrderLevel' } },
      asks: { type: 'array', items: { $ref: '#/components/schemas/OrderLevel' } },
      timestamp: { type: 'integer' },
    },
  },
  OrderLevel: {
    type: 'object',
    properties: {
      price: { type: 'number' },
      size: { type: 'number' },
    },
  },
  Trade: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      price: { type: 'number' },
      amount: { type: 'number' },
      side: { type: 'string', enum: ['buy', 'sell', 'unknown'] },
      timestamp: { type: 'integer' },
    },
  },
  UserTrade: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      price: { type: 'number' },
      amount: { type: 'number' },
      side: { type: 'string', enum: ['buy', 'sell', 'unknown'] },
      timestamp: { type: 'integer' },
      orderId: { type: 'string' },
      outcomeId: { type: 'string' },
      marketId: { type: 'string' },
    },
  },

  // Trading data models
  Order: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      marketId: { type: 'string' },
      outcomeId: { type: 'string' },
      side: { type: 'string', enum: ['buy', 'sell'] },
      type: { type: 'string', enum: ['limit', 'market'] },
      price: { type: 'number' },
      amount: { type: 'number' },
      status: {
        type: 'string',
        enum: ['pending', 'open', 'filled', 'cancelled', 'rejected'],
      },
      filled: { type: 'number' },
      remaining: { type: 'number' },
      timestamp: { type: 'integer' },
      fee: { type: 'number' },
    },
  },
  Position: {
    type: 'object',
    properties: {
      marketId: { type: 'string' },
      outcomeId: { type: 'string' },
      outcomeLabel: { type: 'string' },
      size: { type: 'number' },
      entryPrice: { type: 'number' },
      currentPrice: { type: 'number' },
      unrealizedPnL: { type: 'number' },
      realizedPnL: { type: 'number' },
    },
  },
  Balance: {
    type: 'object',
    properties: {
      currency: { type: 'string' },
      total: { type: 'number' },
      available: { type: 'number' },
      locked: { type: 'number' },
    },
  },
  ExecutionPriceResult: {
    type: 'object',
    properties: {
      price: { type: 'number' },
      filledAmount: { type: 'number' },
      fullyFilled: { type: 'boolean' },
    },
  },
  PaginatedMarketsResult: {
    type: 'object',
    properties: {
      data: { type: 'array', items: { $ref: '#/components/schemas/UnifiedMarket' } },
      total: { type: 'integer' },
      nextCursor: { type: 'string' },
    },
  },

  // Input parameter schemas
  MarketFilterParams: {
    type: 'object',
    properties: {
      limit: { type: 'integer', default: 10000 },
      offset: { type: 'integer' },
      sort: { type: 'string', enum: ['volume', 'liquidity', 'newest'] },
      status: {
        type: 'string',
        enum: ['active', 'closed', 'all'],
        description: 'Filter by market status (default: active)',
      },
      searchIn: { type: 'string', enum: ['title', 'description', 'both'] },
      query: { type: 'string' },
      slug: { type: 'string' },
      marketId: { type: 'string', description: 'Direct lookup by market ID' },
      outcomeId: {
        type: 'string',
        description: 'Reverse lookup -- find market containing this outcome',
      },
      eventId: { type: 'string', description: 'Find markets belonging to an event' },
      page: { type: 'integer' },
      similarityThreshold: { type: 'number' },
    },
  },
  EventFetchParams: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      sort: { type: 'string', enum: ['volume', 'liquidity', 'newest'] },
      limit: { type: 'integer', default: 10000 },
      offset: { type: 'integer' },
      status: {
        type: 'string',
        enum: ['active', 'closed', 'all'],
        description: 'Filter by event status (default: active)',
      },
      searchIn: { type: 'string', enum: ['title', 'description', 'both'] },
      eventId: { type: 'string', description: 'Direct lookup by event ID' },
      slug: { type: 'string', description: 'Lookup by event slug' },
    },
  },
  HistoryFilterParams: {
    type: 'object',
    description:
      'Deprecated - use OHLCVParams or TradesParams instead. Resolution is optional for backward compatibility.',
    properties: {
      resolution: { type: 'string', enum: ['1m', '5m', '15m', '1h', '6h', '1d'] },
      start: { type: 'string', format: 'date-time' },
      end: { type: 'string', format: 'date-time' },
      limit: { type: 'integer' },
    },
  },
  OHLCVParams: {
    type: 'object',
    required: ['resolution'],
    properties: {
      resolution: {
        type: 'string',
        enum: ['1m', '5m', '15m', '1h', '6h', '1d'],
        description: 'Candle interval for aggregation',
      },
      start: { type: 'string', format: 'date-time' },
      end: { type: 'string', format: 'date-time' },
      limit: { type: 'integer' },
    },
  },
  TradesParams: {
    type: 'object',
    description:
      'Parameters for fetching trade history. No resolution parameter - trades are discrete events.',
    properties: {
      start: { type: 'string', format: 'date-time' },
      end: { type: 'string', format: 'date-time' },
      limit: { type: 'integer' },
    },
  },
  CreateOrderParams: {
    type: 'object',
    required: ['marketId', 'outcomeId', 'side', 'type', 'amount'],
    properties: {
      marketId: { type: 'string' },
      outcomeId: { type: 'string' },
      side: { type: 'string', enum: ['buy', 'sell'] },
      type: { type: 'string', enum: ['limit', 'market'] },
      amount: { type: 'number' },
      price: { type: 'number' },
      fee: { type: 'number' },
    },
  },
  MyTradesParams: {
    type: 'object',
    properties: {
      outcomeId: { type: 'string', description: 'Filter to specific outcome/ticker' },
      marketId: { type: 'string', description: 'Filter to specific market' },
      since: { type: 'string', format: 'date-time' },
      until: { type: 'string', format: 'date-time' },
      limit: { type: 'integer' },
      cursor: { type: 'string', description: 'For Kalshi cursor pagination' },
    },
  },
  OrderHistoryParams: {
    type: 'object',
    properties: {
      marketId: { type: 'string', description: 'Required for Limitless (slug)' },
      since: { type: 'string', format: 'date-time' },
      until: { type: 'string', format: 'date-time' },
      limit: { type: 'integer' },
      cursor: { type: 'string' },
    },
  },
  ExchangeCredentials: {
    type: 'object',
    description: 'Optional authentication credentials for exchange operations',
    properties: {
      apiKey: { type: 'string', description: 'API key for the exchange' },
      privateKey: { type: 'string', description: 'Private key for signing transactions' },
      apiSecret: { type: 'string', description: 'API secret (if required by exchange)' },
      passphrase: { type: 'string', description: 'Passphrase (if required by exchange)' },
      funderAddress: {
        type: 'string',
        description: 'The address funding the trades (Proxy address)',
      },
      signatureType: {
        oneOf: [{ type: 'integer' }, { type: 'string' }],
        description:
          "Signature type (0=EOA, 1=Poly Proxy, 2=Gnosis Safe, or names like 'gnosis_safe')",
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Assemble and write the full spec
// ---------------------------------------------------------------------------

function buildSpec(methodSpecs) {
  const paths = {};

  // Static health endpoint
  paths['/health'] = {
    get: {
      summary: 'Server Health Check',
      operationId: 'healthCheck',
      responses: {
        '200': {
          description: 'Server is consistent and running.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', example: 'ok' },
                  timestamp: { type: 'integer', format: 'int64' },
                },
              },
            },
          },
        },
      },
    },
  };

  for (const { name, pathObj } of methodSpecs) {
    paths[`/api/{exchange}/${name}`] = pathObj;
  }

  return {
    openapi: '3.0.0',
    info: {
      title: 'PMXT Sidecar API',
      description:
        'A unified local sidecar API for prediction markets (Polymarket, Kalshi, Limitless). ' +
        'This API acts as a JSON-RPC-style gateway. Each endpoint corresponds to a specific method ' +
        'on the generic exchange implementation.',
      version: '0.4.4',
    },
    servers: [
      { url: 'http://localhost:3847', description: 'Local development server' },
    ],
    paths,
    components: {
      parameters: {
        ExchangeParam: {
          in: 'path',
          name: 'exchange',
          schema: {
            type: 'string',
            enum: ['polymarket', 'kalshi', 'limitless', 'probable', 'baozi', 'myriad'],
          },
          required: true,
          description: 'The prediction market exchange to target.',
        },
      },
      schemas: SCHEMAS,
    },
  };
}

function main() {
  const source = fs.readFileSync(BASE_EXCHANGE_PATH, 'utf-8');
  const sourceFile = ts.createSourceFile(
    'BaseExchange.ts',
    source,
    ts.ScriptTarget.ES2022,
    /* setParentNodes */ true
  );

  const methodNodes = extractMethods(sourceFile);
  const methodSpecs = methodNodes.map(m => buildPathSpec(m, sourceFile));
  const spec = buildSpec(methodSpecs);

  const yamlStr = yaml.dump(spec, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
  });

  fs.writeFileSync(OPENAPI_OUT_PATH, yamlStr, 'utf-8');
  console.log(`Generated ${path.relative(process.cwd(), OPENAPI_OUT_PATH)}`);
  console.log(`  ${methodSpecs.length} endpoints extracted from BaseExchange.ts:`);
  for (const { name } of methodSpecs) {
    console.log(`  - ${name}`);
  }
}

main();
