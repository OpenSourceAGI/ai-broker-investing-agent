'use strict';

/**
 * Generates the simple pass-through methods in pmxt/client.ts from BaseExchange.ts.
 *
 * Every public method in BaseExchange.ts that is not in SKIP_GENERATE is templated
 * as a fetch call to the sidecar and injected between the generation markers in
 * client.ts. This ensures the TypeScript SDK surface stays in sync with the core.
 *
 * Run: node sdks/typescript/scripts/generate-client-methods.js
 */

const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const BASE_EXCHANGE_PATH = path.join(__dirname, '../../../core/src/BaseExchange.ts');
const CLIENT_PATH = path.join(__dirname, '../pmxt/client.ts');

const MARKER_BEGIN = '    // BEGIN GENERATED METHODS';
const MARKER_END = '    // END GENERATED METHODS';

// Methods kept hand-maintained in client.ts (special logic, streaming, local-only)
const SKIP_GENERATE = new Set([
    'callApi',
    'defineImplicitApi',
    'fetchOHLCV',             // date object preprocessing
    'fetchTrades',            // resolution parameter handling
    'watchOrderBook',         // streaming
    'watchTrades',            // streaming
    'createOrder',            // outcome shorthand logic
    'getExecutionPrice',      // delegates to getExecutionPriceDetailed
    'getExecutionPriceDetailed', // complex args format
    'filterMarkets',          // pure local computation, no sidecar
    'filterEvents',           // pure local computation, no sidecar
]);

// Return type config for each generated method.
// returnTs: TypeScript return type for the Promise
// pattern:  how to handle response.data
// converter: converter function name (for array/single/record patterns)
const METHOD_RETURN_CONFIG = {
    loadMarkets:           { returnTs: 'Record<string, UnifiedMarket>', pattern: 'record',          converter: 'convertMarket' },
    fetchMarkets:          { returnTs: 'UnifiedMarket[]',              pattern: 'array',           converter: 'convertMarket' },
    fetchMarketsPaginated: { returnTs: 'PaginatedMarketsResult',       pattern: 'paginatedMarkets'                             },
    fetchEvents:           { returnTs: 'UnifiedEvent[]',               pattern: 'array',           converter: 'convertEvent'  },
    fetchMarket:           { returnTs: 'UnifiedMarket',                pattern: 'single',          converter: 'convertMarket' },
    fetchEvent:            { returnTs: 'UnifiedEvent',                 pattern: 'single',          converter: 'convertEvent'  },
    fetchOrderBook:        { returnTs: 'OrderBook',                    pattern: 'single',          converter: 'convertOrderBook' },
    cancelOrder:           { returnTs: 'Order',                        pattern: 'single',          converter: 'convertOrder'  },
    fetchOrder:            { returnTs: 'Order',                        pattern: 'single',          converter: 'convertOrder'  },
    fetchOpenOrders:       { returnTs: 'Order[]',                      pattern: 'array',           converter: 'convertOrder'  },
    fetchMyTrades:         { returnTs: 'UserTrade[]',                  pattern: 'array',           converter: 'convertUserTrade' },
    fetchClosedOrders:     { returnTs: 'Order[]',                      pattern: 'array',           converter: 'convertOrder'  },
    fetchAllOrders:        { returnTs: 'Order[]',                      pattern: 'array',           converter: 'convertOrder'  },
    fetchPositions:        { returnTs: 'Position[]',                   pattern: 'array',           converter: 'convertPosition' },
    fetchBalance:          { returnTs: 'Balance[]',                    pattern: 'array',           converter: 'convertBalance' },
    close:                 { returnTs: 'void',                         pattern: 'void'                                        },
};

// SDK types that can be used in generated signatures without import issues
const SDK_PARAM_TYPES = new Set([
    'UnifiedMarket', 'UnifiedEvent', 'OrderBook', 'Order', 'Trade',
    'UserTrade', 'Position', 'Balance', 'PriceCandle', 'PaginatedMarketsResult',
]);

// ---------------------------------------------------------------------------
// TypeScript AST helpers
// ---------------------------------------------------------------------------

function typeNodeToTS(node, sf) {
    if (!node) return 'any';
    switch (node.kind) {
        case ts.SyntaxKind.StringKeyword:    return 'string';
        case ts.SyntaxKind.NumberKeyword:    return 'number';
        case ts.SyntaxKind.BooleanKeyword:   return 'boolean';
        case ts.SyntaxKind.VoidKeyword:      return 'void';
        case ts.SyntaxKind.AnyKeyword:       return 'any';
        case ts.SyntaxKind.UndefinedKeyword: return 'undefined';
        case ts.SyntaxKind.TypeReference: {
            const name = node.typeName.kind === ts.SyntaxKind.Identifier
                ? node.typeName.text
                : node.typeName.right.text;
            if (name === 'Promise' && node.typeArguments) {
                return typeNodeToTS(node.typeArguments[0], sf);
            }
            if (name === 'Record' && node.typeArguments) {
                const k = typeNodeToTS(node.typeArguments[0], sf);
                const v = typeNodeToTS(node.typeArguments[1], sf);
                return `Record<${k}, ${v}>`;
            }
            return SDK_PARAM_TYPES.has(name) ? name : 'any';
        }
        case ts.SyntaxKind.UnionType: {
            const nonNull = node.types.filter(t =>
                t.kind !== ts.SyntaxKind.UndefinedKeyword &&
                t.kind !== ts.SyntaxKind.NullKeyword
            );
            if (nonNull.length === 1) return typeNodeToTS(nonNull[0], sf);
            // Multi-member union — just use any for generated params
            return 'any';
        }
        case ts.SyntaxKind.LiteralType: {
            const lit = node.literal;
            if (lit.kind === ts.SyntaxKind.StringLiteral) return `'${lit.text}'`;
            return 'any';
        }
        default: return 'any';
    }
}

function isPublicMethod(node) {
    if (!node.modifiers) return true;
    for (const mod of node.modifiers) {
        if (
            mod.kind === ts.SyntaxKind.PrivateKeyword ||
            mod.kind === ts.SyntaxKind.ProtectedKeyword ||
            mod.kind === ts.SyntaxKind.AbstractKeyword
        ) return false;
    }
    return true;
}

function extractMethods(sourceFile) {
    const methods = [];

    function visitClass(classNode) {
        for (const member of classNode.members) {
            if (member.kind !== ts.SyntaxKind.MethodDeclaration) continue;
            if (!isPublicMethod(member)) continue;
            const name = member.name && member.name.kind === ts.SyntaxKind.Identifier
                ? member.name.text
                : null;
            if (!name) continue;
            if (SKIP_GENERATE.has(name)) continue;
            if (!METHOD_RETURN_CONFIG[name]) {
                console.warn(`  WARNING: no return config for public method '${name}', skipping`);
                continue;
            }
            methods.push(member);
        }
    }

    function visit(node) {
        if (node.kind === ts.SyntaxKind.ClassDeclaration) {
            visitClass(node);
            return;
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return methods;
}

// ---------------------------------------------------------------------------
// Code generation helpers
// ---------------------------------------------------------------------------

function buildSignatureParams(params, sf) {
    return params.map(p => {
        const name = p.name.getText(sf);
        const isOptional = !!p.questionToken;
        const hasDefault = !!p.initializer;
        const typeStr = p.type ? typeNodeToTS(p.type, sf) : 'any';
        if (isOptional) return `${name}?: ${typeStr}`;
        if (hasDefault) return `${name}: ${typeStr} = ${p.initializer.getText(sf)}`;
        return `${name}: ${typeStr}`;
    }).join(', ');
}

function buildArgsLines(params, sf) {
    const lines = ['const args: any[] = [];'];
    for (const p of params) {
        const name = p.name.getText(sf);
        if (p.initializer) {
            lines.push(`args.push(${name});`);
        } else if (p.questionToken) {
            lines.push(`if (${name} !== undefined) args.push(${name});`);
        } else {
            lines.push(`args.push(${name});`);
        }
    }
    return lines.join('\n            ');
}

function buildReturnLines(config) {
    const { pattern, converter } = config;
    const i = '            '; // 12 spaces (3 levels of indent inside try block)
    switch (pattern) {
        case 'array':
            return `${i}const data = this.handleResponse(json);\n${i}return data.map(${converter});`;
        case 'single':
            return `${i}const data = this.handleResponse(json);\n${i}return ${converter}(data);`;
        case 'record':
            return [
                `${i}const data = this.handleResponse(json);`,
                `${i}const result: Record<string, UnifiedMarket> = {};`,
                `${i}for (const [key, value] of Object.entries(data as any)) {`,
                `${i}    result[key] = ${converter}(value);`,
                `${i}}`,
                `${i}return result;`,
            ].join('\n');
        case 'paginatedMarkets':
            return [
                `${i}const data = this.handleResponse(json);`,
                `${i}return {`,
                `${i}    data: (data.data || []).map(convertMarket),`,
                `${i}    total: data.total,`,
                `${i}    nextCursor: data.nextCursor,`,
                `${i}};`,
            ].join('\n');
        case 'void':
            return `${i}this.handleResponse(json);`;
        default:
            return `${i}return this.handleResponse(json);`;
    }
}

function generateMethod(name, params, config, sf) {
    const sig = buildSignatureParams(params, sf);
    const argsCode = buildArgsLines(params, sf);
    const returnCode = buildReturnLines(config);
    const { returnTs } = config;

    return [
        `    async ${name}(${sig}): Promise<${returnTs}> {`,
        `        await this.initPromise;`,
        `        try {`,
        `            ${argsCode}`,
        `            const response = await fetch(\`\${this.config.basePath}/api/\${this.exchangeName}/${name}\`, {`,
        `                method: 'POST',`,
        `                headers: { 'Content-Type': 'application/json', ...this.config.headers },`,
        `                body: JSON.stringify({ args, credentials: this.getCredentials() }),`,
        `            });`,
        `            if (!response.ok) {`,
        `                const error = await response.json().catch(() => ({}));`,
        `                throw new Error(error.error?.message || response.statusText);`,
        `            }`,
        `            const json = await response.json();`,
        returnCode,
        `        } catch (error) {`,
        `            throw new Error(\`Failed to ${name}: \${error}\`);`,
        `        }`,
        `    }`,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
    const source = fs.readFileSync(BASE_EXCHANGE_PATH, 'utf-8');
    const sf = ts.createSourceFile('BaseExchange.ts', source, ts.ScriptTarget.ES2022, true);

    const methods = extractMethods(sf);

    const generated = methods.map(m => {
        const name = m.name.text;
        const config = METHOD_RETURN_CONFIG[name];
        return generateMethod(name, m.parameters, config, sf);
    }).join('\n\n');

    let client = fs.readFileSync(CLIENT_PATH, 'utf-8');

    const beginIdx = client.indexOf(MARKER_BEGIN);
    const endIdx = client.indexOf(MARKER_END);

    if (beginIdx === -1 || endIdx === -1) {
        throw new Error(`Generation markers not found in ${CLIENT_PATH}.\nAdd:\n  ${MARKER_BEGIN}\n  ${MARKER_END}`);
    }

    const before = client.slice(0, beginIdx + MARKER_BEGIN.length);
    const after = client.slice(endIdx);

    client = `${before}\n\n${generated}\n\n${after}`;

    fs.writeFileSync(CLIENT_PATH, client, 'utf-8');

    console.log(`Generated ${methods.length} methods in client.ts:`);
    for (const m of methods) {
        console.log(`  + ${m.name.text}`);
    }
}

main();
