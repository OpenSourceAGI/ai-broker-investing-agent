const fs = require('fs');
const path = require('path');

const generatedModelsDir = path.resolve(__dirname, '../generated/src/models');

function fixOneOfFile(typeName) {
    const targetFile = path.join(generatedModelsDir, `${typeName}.ts`);
    const functionName = `instanceOf${typeName}`;

    if (!fs.existsSync(targetFile)) {
        return false;
    }

    let content = fs.readFileSync(targetFile, 'utf8');

    // Check if the instanceOf function already exists
    if (content.includes(`export function ${functionName}`)) {
        return false;
    }

    // Extract the type definition to determine return logic
    const typeMatch = content.match(new RegExp(`export type ${typeName} = ([^;]+);`));
    if (!typeMatch) {
        return false;
    }

    const typeUnion = typeMatch[1];
    // Parse the union types to generate appropriate checks
    const types = typeUnion.split('|').map(t => t.trim());

    let instanceOfBody = '';
    if (types.length === 1) {
        // Single type, should not happen but handle it
        instanceOfBody = 'return false;';
    } else if (types.includes('string')) {
        // Union with string type - check if it's a string (but not an array)
        instanceOfBody = `if (Array.isArray(value)) return false;\n    if (typeof value === 'string') return true;\n    return false;`;
    } else {
        // For object unions, we can't reliably check without knowing the types
        // Return false to avoid breaking type narrowing
        instanceOfBody = 'return false;';
    }

    const fixedContent = content.replace(
        new RegExp(`export type ${typeName} = ([^;]+);`),
        `export type ${typeName} = $1;

export function ${functionName}(value: any): value is ${typeName} {
    ${instanceOfBody}
}`
    );

    fs.writeFileSync(targetFile, fixedContent, 'utf8');
    return true;
}

function fixFilterRequestsTypeIssue() {
    // Fix type narrowing issues in Filter*RequestArgsInner files
    const filesToFix = [
        'FilterEventsRequestArgsInner',
        'FilterMarketsRequestArgsInner'
    ];

    for (const fileName of filesToFix) {
        const filePath = path.join(generatedModelsDir, `${fileName}.ts`);
        if (!fs.existsSync(filePath)) continue;

        let content = fs.readFileSync(filePath, 'utf8');
        const originalContent = content;

        // The issue: after instanceof check fails, TypeScript loses type info
        // The problematic pattern is:
        // if (value.every(item => typeof item === 'object')) { ... return value.map(value => ...) }
        // Fix by casting value to any in the .every() and .map() calls

        // Replace: if (value.every(item => typeof item
        // With:    if ((value as any).every((item: any) => typeof item
        content = content.replace(
            /if \(value\.every\(item => typeof item/g,
            'if ((value as any).every((item: any) => typeof item'
        );

        // Replace: if (value.every(item => instanceOf
        // With:    if ((value as any).every((item: any) => instanceOf
        content = content.replace(
            /if \(value\.every\(item => instanceOf/g,
            'if ((value as any).every((item: any) => instanceOf'
        );

        // Replace: return value.map(value =>
        // With:    return (value as any).map((value: any) =>
        content = content.replace(
            /return value\.map\((\w+) =>/g,
            'return (value as any).map(($1: any) =>'
        );

        if (content !== originalContent) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Fixed type narrowing in ${fileName}.ts`);
        }
    }
}

console.log('Fixing generated code...');

// Fix all OneOf files that the generator creates
const oneOfFiles = [
    'FilterMarketsRequestArgsInnerOneOf',
    'FetchOHLCVRequestArgsInnerOneOf',
    'FetchTradesRequestArgsInnerOneOf'
];

let fixed = 0;
for (const file of oneOfFiles) {
    if (fixOneOfFile(file)) {
        console.log(`Added missing instanceOf function to ${file}.ts`);
        fixed++;
    }
}

fixFilterRequestsTypeIssue();

if (fixed === 0 && !fs.existsSync(path.join(generatedModelsDir, 'FilterEventsRequestArgsInner.ts'))) {
    console.log('No files needed fixing');
}
console.log('Generated code fixes complete.');
