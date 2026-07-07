const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '../dist/esm');

function addJsExtension(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    // Replace import/export statements with missing .js extensions
    // Matches: import ... from "./path"; export ... from "./path"; import "./path";
    const newContent = content.replace(
        /((?:import|export)\s+(?:[\s\S]*?from\s+)?['"])(\.\.?\/[^'"]+)(['"])/g,
        (match, prefix, modulePath, suffix) => {
            if (modulePath.endsWith('.js')) {
                return match;
            }
            return `${prefix}${modulePath}.js${suffix}`;
        }
    );

    if (content !== newContent) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log(`Updated imports in ${path.relative(distDir, filePath)}`);
    }
}

function processDirectory(directory) {
    if (!fs.existsSync(directory)) return;

    const files = fs.readdirSync(directory);

    for (const file of files) {
        const fullPath = path.join(directory, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            processDirectory(fullPath);
        } else if (file.endsWith('.js') || file.endsWith('.d.ts')) {
            addJsExtension(fullPath);
        }
    }
}

console.log('Fixing ESM imports in:', distDir);
processDirectory(distDir);
console.log('ESM imports fixed.');
