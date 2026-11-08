// Preserve an intentionally stopped candidate. This is not a performance PASS.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import path from 'node:path';

const directory = process.argv[2];
assert(directory, 'Usage: node scripts/preserve-stopped-task-run.mjs docs/bench/tag');
const tag = path.basename(directory), temporary = `.validation/task-runs/${tag}`;
const read = name => JSON.parse(readFileSync(`${directory}/${name}.json`));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const environmentBytes = readFileSync(`${directory}/environment.json`), env = JSON.parse(environmentBytes);
const stop = read('termination-receipt');
assert.equal(env.status, 'running', 'Preserve the original unfinished runner status');
assert.equal(env.sessions, 3);
assert.equal(stop.boundary, 'Session 1 complete, session 2 raw created');
assert(!existsSync(`${directory}/stopped-run-inventory.json`), 'Do not overwrite preservation evidence');
const files = readdirSync(temporary).filter(file => /^session-\d+\.jsonl$/.test(file)).sort();
const sessions = [];
for (const file of files) {
  const number = Number(/session-(\d+)/.exec(file)[1]);
  const bytes = readFileSync(`${temporary}/${file}`);
  assert(bytes.length === 0 || bytes.at(-1) === 10, 'Partial JSON line: preserve without claiming a complete record');
  const rows = bytes.toString().split('\n').filter(Boolean).map(JSON.parse);
  const completed = existsSync(`${directory}/session-${number}.json`);
  const archiveName = completed ? `${file}.gz` : `session-${number}.partial.jsonl.gz`;
  if (completed) assert.deepEqual(gunzipSync(readFileSync(`${directory}/${archiveName}`)), bytes);
  else writeFileSync(`${directory}/${archiveName}`, gzipSync(bytes));
  const counts = {}, keys = new Set(), expected = new Set();
  for (const size of env.sizes) for (const regime of env.regimes) for (const workload of env.workloads.filter(w => regime === 'persistent' || w === 'equal')) for (const build of env.builds) {
    const key = [regime, workload, size, build.tag].join(',');
    expected.add(`${key},counts,0`);
    if (regime === 'persistent') expected.add(`${key},initialization,null`);
    const policy = env.repetitions[regime], warmup = regime === 'persistent' && size === 10000 ? policy.stressWarmup : policy.warmup;
    for (let index = -warmup; index < policy.samples; index++) expected.add(`${key},${index < 0 ? 'warmup' : 'sample'},${index}`);
  }
  let measuredActions = 0;
  for (const row of rows) {
    assert.equal(row.session, number);
    const key = [row.regime, row.workload, row.size, row.build, row.sampleKind, String(row.index)].join(',');
    assert(!keys.has(key) && expected.delete(key), 'Unexpected or duplicate retained row'); keys.add(key);
    counts[row.sampleKind] = (counts[row.sampleKind] ?? 0) + 1;
    if (row.sampleKind === 'sample') measuredActions += row.result.actions.length;
  }
  let passedProcesses = 0;
  if (completed) {
    assert.equal(expected.size, 0, 'Completed session is missing rows');
    const metadata = read(`session-${number}`);
    for (const process of metadata.processes) { assert.equal(process.status, 'passed'); assert.equal(process.disposed, true); }
    passedProcesses = metadata.processes.length;
  }
  sessions.push({ session: number, completed, rawBytes: bytes.length, rawSha256: sha(bytes), archive: archiveName,
    archiveSha256: sha(readFileSync(`${directory}/${archiveName}`)), rows: rows.length, counts, measuredActions,
    recordedPassedProcesses: passedProcesses, missingPlannedRows: expected.size });
}
assert.equal(sessions.filter(session => session.completed).length, 1);
assert(sessions.some(session => session.session === 2 && !session.completed));
const receipt = {
  schemaVersion: 1, preservedAt: new Date().toISOString(), executionStatus: 'stopped-rejected-candidate',
  preservationIntegrity: 'passed', environmentSha256: sha(environmentBytes),
  terminationReceiptSha256: sha(readFileSync(`${directory}/termination-receipt.json`)),
  scriptSha256: sha(readFileSync('scripts/preserve-stopped-task-run.mjs')), sessions,
  interpretation: 'Only archive equality, row identities/completeness and existing runner process statuses were checked here. No statistics, policy PASS or three-session tail conclusion is produced. Every complete and partial raw record is retained; the original environment file remains unchanged.',
  monitoring: 'After candidate rejection, a lightweight PowerShell file/process boundary watcher ran once per second during the final part of session 1. These stopped data are not used for adoption or cross-run performance claims.',
};
writeFileSync(`${directory}/stopped-run-inventory.json`, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt));
