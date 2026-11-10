// Bounded mutation check for the keyed boundary-run candidate (max 4 mutants, no campaign).
// Each mutant edits research/keyed-boundaries/keyed.candidate.ts in place, runs the keyed
// contract tests, and the original file is restored afterwards. The same tests also run the
// default planner (B0), so the unchanged run shows they describe behaviour B0 already has.
// Usage: node scripts/keyed-boundary-mutations.mjs [--out=<file>]
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const source = 'research/keyed-boundaries/keyed.candidate.ts';
const tests = ['tests/unit/keyed-boundaries.test.ts', 'tests/unit/keyed-boundary-counts.test.ts', 'tests/integration/keyed-boundaries.test.ts'];
const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.split('=')[1];
const out = argument('out') ?? '.validation/keyed-boundary-mutations.json';
const original = readFileSync(source, 'utf8');
const edit = pairs => text => pairs.reduce((value, [from, to]) => {
  if (!value.includes(from)) throw new Error(`mutation anchor not found: ${from}`);
  return value.replace(from, to);
}, text);

const mutants = [
  { name: 'M1 suffix raises the Greedy maximum before the middle', apply: edit([
    ['let matched = 0, maximum = prefix - 1, monotonic = true;', 'let matched = 0, maximum = suffix ? oldLength - 1 : prefix - 1, monotonic = true;'],
    ['let greedyMaximum = prefix - 1;', 'let greedyMaximum = suffix ? oldLength - 1 : prefix - 1;'],
  ]) },
  { name: 'M2 duplicate-key check skips the keys of the shared leading run', apply: edit([
    ['for (const nodes of [old.map(node => node.vnode), next]) {', 'let lead = 0; while (lead < Math.min(old.length, next.length) && old[lead].vnode.identity.key === next[lead].identity.key) lead++;\n  for (const nodes of [old.map(node => node.vnode).slice(lead), next.slice(lead)]) {'],
  ]) },
  { name: 'M3 middle Map stores middle-local old indices (offset error)', apply: edit([
    ['byKey.set(old[index].vnode.identity.key!, index);', 'byKey.set(old[index].vnode.identity.key!, index - prefix);'],
  ]) },
  { name: 'M4 LIS scans right to left (another longest run on ties)', apply: edit([
    ['for (let index = from; index < to; index++) {\n    const slot = slots[index];\n    if (slot.oldIndex === null) continue;\n    let low = 0, high = tails.length;', 'for (let index = to - 1; index >= from; index--) {\n    const slot = slots[index];\n    if (slot.oldIndex === null) continue;\n    let low = 0, high = tails.length;'],
    ['if (slots[tails[middle]].oldIndex! < slot.oldIndex) low = middle + 1; else high = middle;', 'if (slots[tails[middle]].oldIndex! > slot.oldIndex) low = middle + 1; else high = middle;'],
  ]) },
];

function run(label) {
  const report = `.validation/keyed-mutation-run.json`;
  const started = Date.now();
  const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...tests, '--reporter=json', `--outputFile=${report}`], { encoding: 'utf8' });
  const json = JSON.parse(readFileSync(report, 'utf8'));
  const failed = json.testResults.flatMap(file => file.assertionResults.filter(test => test.status === 'failed').map(test => `${file.name.replace(/\\/g, '/').split('/tests/')[1]} > ${test.title}`));
  return { label, exitCode: result.status, total: json.numTotalTests, failed: json.numFailedTests, failedTests: failed, ms: Date.now() - started };
}

const results = { source, tests, sourceSha256: execFileSync('git', ['hash-object', source], { encoding: 'utf8' }).trim(), runs: [] };
try {
  results.runs.push({ ...run('candidate and default planner (unchanged)'), expected: 'pass' });
  for (const mutant of mutants) {
    writeFileSync(source, mutant.apply(original));
    results.runs.push({ ...run(mutant.name), expected: 'fail' });
  }
} finally {
  writeFileSync(source, original);
}
results.restored = readFileSync(source, 'utf8') === original;
results.ok = results.restored && results.runs.every(entry => entry.expected === 'pass' ? entry.failed === 0 && entry.exitCode === 0 : entry.failed > 0);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
for (const entry of results.runs) console.log(`${entry.expected === 'pass' ? (entry.failed === 0 ? 'PASS' : 'UNEXPECTED FAIL') : (entry.failed > 0 ? 'KILLED' : 'SURVIVED')}  ${entry.label}: ${entry.failed}/${entry.total} failed (${entry.ms} ms)`);
if (!results.ok) process.exitCode = 1;
