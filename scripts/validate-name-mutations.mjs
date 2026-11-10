// Bounded mutation check for the validation name checks (max 4 mutants, no campaign).
// Each mutant edits the validation source in place, runs the equivalence test, and the
// original file is restored afterwards.
// Usage: node scripts/validate-name-mutations.mjs [--source=<file>] [--out=<file>]
//   --source defaults to src/core/validate.ts (the candidate file was used before adoption).
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.split('=')[1];
const source = argument('source') ?? 'src/core/validate.ts';
const tests = ['tests/unit/validate-names.test.ts'];
const out = argument('out') ?? '.validation/validate-name-mutations.json';
const original = readFileSync(source, 'utf8');
const edit = (from, to) => text => {
  if (text.split(from).length !== 2) throw new Error(`mutation anchor must match once: ${from}`);
  return text.replace(from, to);
};

const mutants = [
  { name: 'M1 attribute name may start with a digit, dot, colon or hyphen', apply: edit('if (i > 0 && ((c >= 48 && c <= 58) || c === 45 || c === 46)) continue;', 'if ((c >= 48 && c <= 58) || c === 45 || c === 46) continue;') },
  { name: 'M2 attribute name loses the colon (48..57 instead of 48..58)', apply: edit('if (i > 0 && ((c >= 48 && c <= 58) || c === 45 || c === 46)) continue;', 'if (i > 0 && ((c >= 48 && c <= 57) || c === 45 || c === 46)) continue;') },
  { name: 'M3 the on-prefix test is case-sensitive for the second letter', apply: edit('(name.charCodeAt(1) | 32) === 110) || blockedAttrs.has(name)', 'name.charCodeAt(1) === 110) || blockedAttrs.has(name)') },
  { name: 'M4 event name may start with a digit', apply: edit('if (!((c >= 97 && c <= 122) || (i > 0 && c >= 48 && c <= 57))) return true;', 'if (!((c >= 97 && c <= 122) || (c >= 48 && c <= 57))) return true;') },
];

function run(label) {
  const report = '.validation/validate-name-mutation-run.json';
  const started = Date.now();
  const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...tests, '--reporter=json', `--outputFile=${report}`], { encoding: 'utf8' });
  const json = JSON.parse(readFileSync(report, 'utf8'));
  const failed = json.testResults.flatMap(file => file.assertionResults.filter(test => test.status === 'failed').map(test => test.fullName ?? test.title));
  return { label, exitCode: result.status, total: json.numTotalTests, failed: json.numFailedTests, failedTests: failed, ms: Date.now() - started };
}

mkdirSync('.validation', { recursive: true });
const results = { source, tests, sourceSha256: execFileSync('git', ['hash-object', source], { encoding: 'utf8' }).trim(), runs: [] };
try {
  results.runs.push({ ...run('unchanged source'), expected: 'pass' });
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
