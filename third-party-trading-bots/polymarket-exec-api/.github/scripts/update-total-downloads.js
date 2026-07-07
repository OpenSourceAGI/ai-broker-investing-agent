
const fs = require('fs');
const https = require('https');
const path = require('path');

const PACKAGES = [
    { type: 'pypi', name: 'pmxt' },
    { type: 'npm', name: 'pmxtjs' },
    { type: 'npm', name: 'pmxt-core' }
];

const README_PATH = process.env.README_PATH || path.join(__dirname, '../../readme.md');

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function getNpmDownloads(pkg) {
    const start = '2020-01-01'; // Project start roughly
    const end = new Date().toISOString().split('T')[0];
    const url = `https://api.npmjs.org/downloads/range/${start}:${end}/${pkg}`;
    try {
        const data = await fetchJson(url);
        if (data.downloads && Array.isArray(data.downloads)) {
            return data.downloads.reduce((acc, day) => acc + day.downloads, 0);
        }
        return 0;
    } catch (e) {
        console.warn(`Warning: Could not fetch NPM stats for ${pkg} (might be new or network issue).`);
        return 0;
    }
}

async function getPypiDownloads(pkg) {
    const url = `https://api.pepy.tech/api/v2/projects/${pkg}`;
    const apiKey = process.env.PEPY_API_KEY;

    if (!apiKey) {
        console.warn('Warning: PEPY_API_KEY not found. PyPI stats might fail.');
    }

    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'X-API-Key': apiKey
            }
        };

        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    console.warn(`Warning: PyPI stats for ${pkg} returned status ${res.statusCode}`);
                    resolve(0);
                    return;
                }
                try {
                    const json = JSON.parse(data);
                    resolve(json.total_downloads || 0);
                } catch (e) {
                    resolve(0);
                }
            });
        }).on('error', (e) => {
            console.error(`Error fetching PyPI stats for ${pkg}:`, e.message);
            resolve(0);
        });
    });
}

async function main() {
    let total = 0;
    console.log('Fetching download stats...');

    for (const pkg of PACKAGES) {
        let count = 0;
        if (pkg.type === 'npm') {
            count = await getNpmDownloads(pkg.name);
        } else if (pkg.type === 'pypi') {
            count = await getPypiDownloads(pkg.name);
        }
        console.log(`${pkg.name}: ${count}`);
        total += count;
    }

    console.log(`Total Downloads: ${total}`);

    // Format number (e.g. 1.2k, 1.5M, 20.4k)
    const formatNumber = (num) => {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
        return num.toString();
    };

    const formattedTotal = formatNumber(total);
    // Using a custom shield style
    const badgeUrl = `https://img.shields.io/badge/downloads-${formattedTotal}-blue`;

    // Read README
    let readme;
    try {
        readme = fs.readFileSync(README_PATH, 'utf8');
    } catch (e) {
        console.error(`Error reading README at ${README_PATH}:`, e);
        process.exit(1);
    }

    // We look for the existing badge to replace
    // Implementation note: We look for the <a> tag wrapping the shield, which we added/will add.
    // Match pattern: <a href="..." id="total-downloads-badge"><img src="..." alt="Total Downloads"></a>
    // Or just a flexible match for the image we know we want to replace.

    // To make this robust, let's look for our specific 'npm downloads' badge if it exists (first run)
    // and replace it with a marked version that we can find easily later.

    // Target to replace (Example from README):
    // <a href="https://www.npmjs.com/package/pmxtjs"><img src="https://img.shields.io/npm/dt/pmxtjs" alt="Downloads"></a>

    const originalNpmBadgePattern = /<a href="https:\/\/www\.npmjs\.com\/package\/pmxtjs"><img src="https:\/\/img\.shields\.io\/npm\/dt\/pmxtjs" alt="Downloads"><\/a>/;

    // Future proof pattern for our own badge (once we've replaced it)
    // We'll use a specific alt text "Total Downloads" to find it again.
    const ourBadgePattern = /<a href="[^"]+"><img src="https:\/\/img\.shields\.io\/badge\/downloads-[^"]+" alt="Total Downloads"><\/a>/;

    const newBadgeHtml = `<a href="https://github.com/qoery-com/pmxt"><img src="${badgeUrl}" alt="Total Downloads"></a>`;

    let newReadme = readme;
    if (ourBadgePattern.test(readme)) {
        console.log('Updating existing Total Downloads badge...');
        newReadme = readme.replace(ourBadgePattern, newBadgeHtml);
    } else if (originalNpmBadgePattern.test(readme)) {
        console.log('Replacing NPM downloads badge with Total Downloads badge...');
        newReadme = readme.replace(originalNpmBadgePattern, newBadgeHtml);
    } else {
        console.log('Could not find badge to replace. Please manually ensure the badge exists or check the pattern.');
        // If we can't find it, we shouldn't break the file blindly. 
        // But for this task, the user *expects* us to modify it.
        // Let's print a warning but saving anyways if we want to force it?
        // No, let's just exit if we can't find a safe insertion point to avoid corrupting the file.
        // Actually, looking at the file content provided earlier, the pattern *should* match.
        // line 17: <a href="https://www.npmjs.com/package/pmxtjs"><img src="https://img.shields.io/npm/dt/pmxtjs" alt="Downloads"></a>
    }

    if (newReadme !== readme) {
        fs.writeFileSync(README_PATH, newReadme);
        console.log('README.md updated successfully.');
    } else {
        console.log('No changes needed or matching badge found.');
    }
}

main();
