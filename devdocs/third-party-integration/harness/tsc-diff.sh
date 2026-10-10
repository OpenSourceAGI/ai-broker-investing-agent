#!/usr/bin/env bash
set -euo pipefail
baseline="$(dirname "$0")/../findings/03-typescript-baseline.md"
bun - "$baseline" "${1:?tsc output file required}" "${2:-0}" "${3:-tsconfig.json}" <<'JS'
const [baseline, current, status, scope] = process.argv.slice(2);
function diagnostics(text) {
  const counts = new Map();
  for (const line of text.split('\n')) {
    const m = line.match(/^(.+?)\(\d+,\d+\): error (TS\d+): (.*)$/);
    if (!m) continue;
    const key = `${m[1]}|${m[2]}|${m[3]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
if (!['tsconfig.json', 'tsconfig.test.json'].includes(scope)) throw new Error('Unknown type baseline scope');
const sections = (await Bun.file(baseline).text()).split('## Existing test and example diagnostics (Docker reference)');
const before = diagnostics(sections[scope === 'tsconfig.test.json' ? 1 : 0] ?? '');
if (!before.size) throw new Error(`Missing type baseline for ${scope}`);
const output = await Bun.file(current).text();
const after = diagnostics(output);
let failed = false;
for (const [key, n] of after) if (n > (before.get(key) ?? 0)) { console.error(`NEW ${n - (before.get(key) ?? 0)}: ${key}`); failed = true; }
for (const [key, n] of before) if ((after.get(key) ?? 0) < n) console.log(`REMOVED ${n - (after.get(key) ?? 0)}: ${key}`);
if ((/error TS\d+/.test(output) || status !== '0') && !after.size) { console.error('Compiler failed without parseable diagnostics'); failed = true; }
console.log(`Type gate: ${failed ? 'FAILED' : 'no new diagnostics'} (${[...after.values()].reduce((a,b)=>a+b,0)} diagnostics)`);
process.exit(failed ? 1 : 0);
JS
