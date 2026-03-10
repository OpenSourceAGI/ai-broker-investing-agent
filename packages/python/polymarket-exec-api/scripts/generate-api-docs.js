const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Handlebars = require('handlebars');

const CORE_DIR = path.resolve(__dirname, '../core');
const SPECS_DIR = path.join(CORE_DIR, 'specs');
const OPENAPI_PATH = path.join(CORE_DIR, 'src/server/openapi.yaml');
const GENERATED_CONFIG_PATH = path.join(CORE_DIR, 'api-doc-config.generated.json');
const PYTHON_OUT = path.resolve(__dirname, '../sdks/python/API_REFERENCE.md');
const TS_OUT = path.resolve(__dirname, '../sdks/typescript/API_REFERENCE.md');

// Exchange spec files in order of display
const EXCHANGE_SPECS = [
    {
        exchange: 'polymarket', displayName: 'Polymarket', files: [
            path.join(SPECS_DIR, 'polymarket/PolymarketGammaAPI.yaml'),
            path.join(SPECS_DIR, 'polymarket/PolymarketClobAPI.yaml'),
            path.join(SPECS_DIR, 'polymarket/Polymarket_Data_API.yaml'),
        ]
    },
    {
        exchange: 'kalshi', displayName: 'Kalshi', files: [
            path.join(SPECS_DIR, 'kalshi/Kalshi.yaml'),
        ]
    },
    {
        exchange: 'limitless', displayName: 'Limitless', files: [
            path.join(SPECS_DIR, 'limitless/Limitless.yaml'),
        ]
    },
    {
        exchange: 'probable', displayName: 'Probable', files: [
            path.join(SPECS_DIR, 'probable/probable.yaml'),
        ]
    },
    {
        exchange: 'myriad', displayName: 'Myriad', files: [
            path.join(SPECS_DIR, 'myriad/myriad.yaml'),
        ]
    },
];

// --- Helper Functions ---

function toSnakeCase(str) {
    // Handle consecutive uppercase letters and mixed-case acronyms (like PnL)
    // Insert underscore before uppercase letter if:
    // 1. Preceded by lowercase letter, UNLESS that lowercase is part of an acronym
    //    (e.g., testData -> test_data, but PnL -> pnl)
    // 2. Preceded by uppercase AND followed by lowercase (XMLParser -> xml_parser)
    return str
        .replace(/(?<![A-Z])([a-z])([A-Z])/g, '$1_$2')  // aB -> a_B, but not after uppercase
        .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')       // ABc -> A_Bc
        .toLowerCase();
}

function getRefName(ref) {
    if (!ref) return 'any';
    const parts = ref.split('/');
    return parts[parts.length - 1];
}

// --- Load Sources ---

function loadSpecs() {
    const openapi = yaml.load(fs.readFileSync(OPENAPI_PATH, 'utf8'));

    if (!fs.existsSync(GENERATED_CONFIG_PATH)) {
        console.error(`Error: ${GENERATED_CONFIG_PATH} not found. Run 'npm run extract:jsdoc' first.`);
        process.exit(1);
    }
    const config = JSON.parse(fs.readFileSync(GENERATED_CONFIG_PATH, 'utf8'));

    return { openapi, config };
}

// --- Method Parsing (from JSDoc-extracted config) ---

function parseMethods(config) {
    const methods = [];

    for (const [name, data] of Object.entries(config.methods)) {
        methods.push({
            name,
            summary: data.summary || name,
            description: data.description || data.summary || '',
            params: (data.params || []).map(p => ({
                name: p.name,
                type: p.type || 'any',
                optional: p.optional || false,
                description: p.description || p.name
            })),
            subParams: data.subParams || null,
            returns: data.returns || { type: 'any', description: 'Result' },
            python: data.python || { examples: [] },
            typescript: data.typescript || { examples: [] },
            notes: data.notes || null,
            exchangeOnly: data.exchangeOnly || null
        });
    }

    return methods;
}

// --- Model Parsing (from OpenAPI spec - unchanged) ---

function parseModels(openapi) {
    const dataModels = [];
    const filterModels = [];

    const schemas = openapi.components.schemas;
    for (const [name, schema] of Object.entries(schemas)) {
        if (name.endsWith('Response') || name === 'BaseResponse' || name === 'ErrorDetail' || name === 'ErrorResponse') continue;

        const fields = [];
        if (schema.properties) {
            for (const [fname, fschema] of Object.entries(schema.properties)) {
                let type = fschema.type;
                if (fschema.$ref) type = getRefName(fschema.$ref);
                if (type === 'array' && fschema.items) {
                    const itype = fschema.items.$ref ? getRefName(fschema.items.$ref) : fschema.items.type;
                    type = `${itype}[]`;
                }

                fields.push({
                    name: fname,
                    type: type,
                    description: fschema.description || '',
                    required: (schema.required && schema.required.includes(fname))
                });
            }
        }

        const model = {
            name,
            description: schema.description || '',
            fields
        };

        if (name.endsWith('Params') || name.endsWith('Request')) {
            filterModels.push(model);
        } else {
            dataModels.push(model);
        }
    }

    return { dataModels, filterModels };
}

// --- Exchange Endpoint Parsing (from per-exchange OpenAPI YAML files) ---

function generateCallApiName(httpMethod, urlPath) {
    const segments = urlPath
        .split('/')
        .filter(s => s && !s.startsWith('{'));
    const pascal = segments.map(s =>
        s.split(/[-_]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('')
    );
    return httpMethod.toLowerCase() + pascal.join('');
}

function parseExchangeEndpoints() {
    const groups = [];

    for (const { exchange, displayName, files } of EXCHANGE_SPECS) {
        const endpoints = [];

        for (const filePath of files) {
            if (!fs.existsSync(filePath)) {
                console.warn(`Warning: Exchange spec not found: ${filePath}`);
                continue;
            }

            const spec = yaml.load(fs.readFileSync(filePath, 'utf8'));
            const topLevelSecurity = !!(spec.security && spec.security.length > 0);
            const paths = spec.paths || {};

            for (const [urlPath, pathItem] of Object.entries(paths)) {
                // Collect path-level parameters
                const pathLevelParams = (pathItem.parameters || [])
                    .filter(p => p.in === 'path' || p.in === 'query');

                for (const [httpMethod, operation] of Object.entries(pathItem)) {
                    if (!['get', 'post', 'put', 'patch', 'delete'].includes(httpMethod.toLowerCase())) continue;

                    const name = operation.operationId || generateCallApiName(httpMethod, urlPath);
                    const isPrivate = operation.security !== undefined
                        ? !!(operation.security && operation.security.length > 0)
                        : topLevelSecurity;

                    // Merge path-level and operation-level parameters
                    const allParams = [...pathLevelParams, ...(operation.parameters || [])];
                    const params = allParams.map(p => ({
                        name: p.name,
                        in: p.in,
                        required: p.required || p.in === 'path',
                        type: (p.schema && p.schema.type) || 'string',
                        description: p.description || '',
                        enum: (p.schema && p.schema.enum) || null,
                    }));

                    endpoints.push({
                        name,
                        method: httpMethod.toUpperCase(),
                        path: urlPath,
                        summary: operation.summary || name,
                        params,
                        isPrivate,
                    });
                }
            }
        }

        if (endpoints.length > 0) {
            groups.push({ exchange, displayName, endpoints });
        }
    }

    return groups;
}

// --- Format Examples ---

function formatExamples(examples, commentPrefix) {
    if (!examples || examples.length === 0) {
        return `${commentPrefix} No example available`;
    }
    return examples.map(ex => {
        const title = ex.title ? `${commentPrefix} ${ex.title}\n` : '';
        return `${title}${ex.code}`;
    }).join('\n\n');
}

// --- Main Execution ---

const { openapi, config } = loadSpecs();
const methods = parseMethods(config);
const { dataModels, filterModels } = parseModels(openapi);
const exchangeGroups = parseExchangeEndpoints();

// --- Handlebars Setup ---

// Create a set of linkable types regardless of case for easier matching
const linkableTypes = new Set([
    ...dataModels.map(m => m.name.toLowerCase()),
    ...filterModels.map(m => m.name.toLowerCase())
]);

function linkify(type) {
    if (!type) return type;
    if (linkableTypes.has(type.toLowerCase())) {
        return `[${type}](#${type.toLowerCase()})`;
    }
    return type;
}

Handlebars.registerHelper('pythonName', (name) => toSnakeCase(name));

Handlebars.registerHelper('pythonType', (type) => {
    if (!type) return 'Any';

    // Handle Arrays: UnifiedMarket[] -> List[UnifiedMarket]
    if (type.endsWith('[]')) {
        const inner = type.slice(0, -2);
        const linkedInner = linkify(inner);
        return `List[${linkedInner}]`;
    }

    // Handle Generics: Record<string, UnifiedMarket>
    if (type.startsWith('Record<')) {
        // Simple regex to extract Key, Value from Record<Key, Value>
        const match = type.match(/^Record<(.+),\s*(.+)>/);
        if (match) {
            const [_, key, value] = match;
            const map = { string: 'str', number: 'float', integer: 'int', boolean: 'bool', any: 'Any' };
            const pyKey = map[key] || linkify(key);
            const pyValue = map[value] || linkify(value);
            return `Dict[${pyKey}, ${pyValue}]`;
        }
    }

    const map = { string: 'str', number: 'float', integer: 'int', boolean: 'bool', any: 'Any' };
    if (map[type]) return map[type];

    return linkify(type);
});

Handlebars.registerHelper('pythonTypeClean', (type) => {
    let t = Handlebars.helpers.pythonType(type);
    // Strip markdown links [Text](url) -> Text
    return t.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
});

Handlebars.registerHelper('pythonParams', (params) => {
    if (!params) return '';
    return params.map(p => {
        const pname = toSnakeCase(p.name);
        // Use clean type for parameters (inside code block)
        let ptype = Handlebars.helpers.pythonTypeClean(p.type);
        if (p.optional) return `${pname}: Optional[${ptype}] = None`;
        return `${pname}: ${ptype}`;
    }).join(', ');
});

Handlebars.registerHelper('tsType', (type) => {
    if (!type) return 'any';

    if (type.endsWith('[]')) {
        const inner = type.slice(0, -2);
        const linkedInner = linkify(inner);
        return `${linkedInner}[]`;
    }

    const map = { integer: 'number' };
    if (map[type]) return map[type];

    return linkify(type);
});

Handlebars.registerHelper('tsTypeClean', (type) => {
    let t = Handlebars.helpers.tsType(type);
    return t.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
});
Handlebars.registerHelper('tsParams', (params) => {
    if (!params) return '';
    return params.map(p => {
        return `${p.name}${p.optional ? '?' : ''}: ${Handlebars.helpers.tsTypeClean(p.type)}`;
    }).join(', ');
});
Handlebars.registerHelper('tsOptional', (required) => required ? '' : '?');


// --- Render Python ---
const pythonTemplate = Handlebars.compile(
    fs.readFileSync(path.join(__dirname, 'templates/api-reference.python.md.hbs'), 'utf8'),
    { noEscape: true }
);

const pythonMethods = methods.map(m => ({
    ...m,
    example: formatExamples(m.python.examples, '#'),
    exchangeNote: m.exchangeOnly ? `> **Note**: This method is only available on **${m.exchangeOnly}** exchange.\n` : ''
}));

const pythonOut = pythonTemplate({
    methods: pythonMethods,
    dataModels,
    filterModels,
    exchangeGroups,
    workflowExample: config.workflowExample.python
});
fs.writeFileSync(PYTHON_OUT, pythonOut);
console.log(`Generated Python Docs: ${PYTHON_OUT}`);


// --- Render TypeScript ---
const tsTemplate = Handlebars.compile(
    fs.readFileSync(path.join(__dirname, 'templates/api-reference.typescript.md.hbs'), 'utf8'),
    { noEscape: true }
);

const tsMethods = methods.map(m => ({
    ...m,
    example: formatExamples(m.typescript.examples, '//'),
    exchangeNote: m.exchangeOnly ? `> **Note**: This method is only available on **${m.exchangeOnly}** exchange.\n` : ''
}));

const tsOut = tsTemplate({
    methods: tsMethods,
    dataModels,
    filterModels,
    exchangeGroups,
    workflowExample: config.workflowExample.typescript
});
fs.writeFileSync(TS_OUT, tsOut);
console.log(`Generated TypeScript Docs: ${TS_OUT}`);
