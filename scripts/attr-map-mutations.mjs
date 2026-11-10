// Bounded mutation check for the attribute-map builder (max 4 mutants, no campaign).
// Each mutant edits one source file in place, runs the attribute-map test, and the original
// file is restored afterwards.
// Usage: node scripts/attr-map-mutations.mjs [--stage=candidate|default] [--out=<file>]
//   candidate: the files under research/attr-maps (before adoption)
//   default:   src/core/attrMap.ts, src/runtime/resolve.ts, src/core/capture.ts (after adoption)
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.split('=')[1];
const stage = argument('stage') ?? 'default';
const files = stage === 'candidate'
  ? { helper: 'research/attr-maps/attrMap.ts', resolve: 'research/attr-maps/resolve.candidate.ts', capture: 'research/attr-maps/capture.candidate.ts' }
  : { helper: 'src/core/attrMap.ts', resolve: 'src/runtime/resolve.ts', capture: 'src/core/capture.ts' };
const tests = ['tests/unit/attr-maps.test.ts'];
const out = argument('out') ?? '.validation/attr-map-mutations.json';
const edit = (from, to) => text => {
  if (text.split(from).length !== 2) throw new Error(`mutation anchor must match once: ${from}`);
  return text.replace(from, to);
};
const mutants = [
  { name: 'M1 the finished map keeps the builder prototype', file: 'helper', apply: edit('return Object.setPrototypeOf(attrs, null); }', 'return attrs; }') },
  { name: 'M2 the map is built on a plain object', file: 'helper', apply: edit('return new AttrMap(); }', 'return {}; }') },
  { name: 'M3 the resolver does not finish the map', file: 'resolve', apply: edit('    finishAttrMap(attrs);\n', '') },
  { name: 'M4 the DOM reader does not finish the map', file: 'capture', apply: edit('    finishAttrMap(attrs);\n', '') },
];

function run(label) {
  const report = '.validation/attr-map-mutation-run.json';
  const started = Date.now();
  const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...tests, '--reporter=json', `--outputFile=${report}`], { encoding: 'utf8' });
  const json = JSON.parse(readFileSync(report, 'utf8'));
  const failed = json.testResults.flatMap(file => file.assertionResults.filter(test => test.status === 'failed').map(test => test.fullName ?? test.title));
  return { label, exitCode: result.status, total: json.numTotalTests, failed: json.numFailedTests, failedTests: failed, ms: Date.now() - started };
}

mkdirSync('.validation', { recursive: true });
const results = { stage, files, tests, sourceSha256: Object.fromEntries(Object.values(files).map(file => [file, execFileSync('git', ['hash-object', file], { encoding: 'utf8' }).trim()])), runs: [] };
const originals = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, readFileSync(file, 'utf8').replaceAll('\r\n', '\n')]));
const onDisk = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, readFileSync(file, 'utf8')]));
try {
  results.runs.push({ ...run('unchanged source'), expected: 'pass' });
  for (const mutant of mutants) {
    writeFileSync(files[mutant.file], mutant.apply(originals[mutant.file]));
    try { results.runs.push({ ...run(mutant.name), expected: 'fail' }); }
    finally { writeFileSync(files[mutant.file], onDisk[mutant.file]); }
  }
} finally {
  for (const [key, file] of Object.entries(files)) writeFileSync(file, onDisk[key]);
}
results.restored = Object.entries(files).every(([key, file]) => readFileSync(file, 'utf8') === onDisk[key]);
results.ok = results.restored && results.runs.every(entry => entry.expected === 'pass' ? entry.failed === 0 && entry.exitCode === 0 : entry.failed > 0);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
for (const entry of results.runs) console.log(`${entry.expected === 'pass' ? (entry.failed === 0 ? 'PASS' : 'UNEXPECTED FAIL') : (entry.failed > 0 ? 'KILLED' : 'SURVIVED')}  ${entry.label}: ${entry.failed}/${entry.total} failed (${entry.ms} ms)`);
if (!results.ok) process.exitCode = 1;
