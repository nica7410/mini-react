// Independently verify comparison completeness and the preregistered gate decisions.
// Quantiles come from a summary whose exact bytes already passed the raw-data audit.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const directory = process.argv[2]; assert(directory, 'Usage: node scripts/audit-task-policy.mjs docs/bench/tag');
const json = name => JSON.parse(readFileSync(`${directory}/${name}.json`));
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const environment = json('environment'), statistics = json('statistics-audit'), summary = json('summary');
assert.equal(environment.status, 'passed'); assert.equal(statistics.status, 'passed');
assert.equal(statistics.summarySha256, sha(`${directory}/summary.json`));
const summaries = new Map(summary.map(row => [row.key, row]));
const engineCommits = { '7757e3c': 'E0', '8b302de': 'E1', 'c4a2fe1': 'E2' };
const appCommits = { '4d5a66f': 'A0', '5ed7f34': 'A1' };
const builds = environment.builds.map(build => {
  const engine = build.tag.match(/-(e\d+[a-z]*)-/)?.[1].toUpperCase(); assert(engine);
  if (engineCommits[build.engineCommit.slice(0, 7)]) assert.equal(engine, engineCommits[build.engineCommit.slice(0, 7)]);
  const app = appCommits[build.appCommit.slice(0, 7)]; assert(app, 'This audit covers the fixed A0/A1 sources');
  return { ...build, engine, app };
});
const expectedPairs = [];
for (const before of builds) for (const after of builds) {
  if (before.engineHash === after.engineHash && before.app === 'A0' && after.app === 'A1') {
    expectedPairs.push({ kind: 'app', label: `${before.engine}: A0 -> A1`, before: before.tag, after: after.tag });
  } else if (before.appHash === after.appHash && before.engineHash !== after.engineHash && before.engine < after.engine) {
    expectedPairs.push({ kind: 'engine', label: `${before.app}: ${before.engine} -> ${after.engine}`, before: before.tag, after: after.tag });
  }
}
const sortPairs = rows => rows.toSorted((a, b) => a.label.localeCompare(b.label));
assert.equal(new Set(expectedPairs.map(pair => pair.label)).size, expectedPairs.length, 'Ambiguous variant labels');
assert.deepEqual(sortPairs(json('comparison-audit').pairs), sortPairs(expectedPairs));
const expectedContrasts = new Map(), expectedDecisions = new Map();
for (const pair of expectedPairs) for (const baseline of summary) {
  const key = baseline.key.split(','); if (key[4] !== pair.before) continue;
  const candidateKey = [...key]; candidateKey[4] = pair.after;
  const candidate = summaries.get(candidateKey.join(',')); assert(candidate); assert.equal(baseline.n, candidate.n);
  const [session, regime, workload, size, , scope, metric] = key;
  expectedContrasts.set(`${pair.label}/${baseline.key}`, { baseline, candidate, pair });
  const total = (metric === 'totalCpuMs' && (scope === 'workload' || scope === 'lifecycle' || (workload === 'crud' && scope.startsWith('action-'))))
    || (metric === 'cpuMs' && scope === 'initialization');
  if (!total || (pair.kind === 'engine' && !pair.label.startsWith('A1: E1 -> '))) continue;
  const decisionKey = [pair.label, regime, workload, size, scope].join(',');
  if (!expectedDecisions.has(decisionKey)) expectedDecisions.set(decisionKey, []);
  const absolute = pair.kind === 'app' ? [.5, 1] : [1, 2];
  const medianAllowanceMs = Math.max(.05 * baseline.median, absolute[0]);
  const p95AllowanceMs = Math.max(.10 * baseline.p95, absolute[1]);
  expectedDecisions.get(decisionKey).push({ session: Number(session), baseline, candidate,
    medianAllowanceMs, p95AllowanceMs,
    medianExceeded: candidate.median - baseline.median > medianAllowanceMs,
    p95Exceeded: candidate.p95 - baseline.p95 > p95AllowanceMs,
    reuseTarget: regime === 'persistent' && Number(size) >= 1000 && ['draft', 'counter', 'equal'].includes(workload),
    medianGainAtLeast10Percent: baseline.median > 0 && candidate.median <= .9 * baseline.median });
}
const contrasts = JSON.parse(gunzipSync(readFileSync(`${directory}/contrasts.json.gz`)));
const remaining = new Set(expectedContrasts.keys());
for (const row of contrasts) {
  const key = `${row.comparison}/${row.baseline.key}`; assert(remaining.delete(key), `Unexpected/duplicate contrast: ${key}`);
  const expected = expectedContrasts.get(key);
  assert.equal(row.candidate.key, expected.candidate.key); assert.equal(row.before, expected.pair.before); assert.equal(row.after, expected.pair.after);
  const [session, regime, workload, size, , scope, metric] = row.baseline.key.split(',');
  assert.equal(row.session, Number(session)); assert.equal(row.size, Number(size)); assert.equal(row.kind, expected.pair.kind);
  for (const [name, value] of Object.entries({ regime, workload, scope, metric })) assert.equal(row[name], value);
  for (const name of ['baseline', 'candidate']) for (const field of ['n', 'median', 'iqr', 'p95']) assert.equal(row[name][field], expected[name][field]);
}
assert.equal(remaining.size, 0, 'Missing comparisons');
const decisions = json('decisions');
function verifyDecisions(rows) {
  const keys = new Set(expectedDecisions.keys());
  for (const row of rows) {
    assert(keys.delete(row.key), `Unexpected/duplicate decision: ${row.key}`);
    const expected = expectedDecisions.get(row.key).toSorted((a, b) => a.session - b.session);
    const [comparison, regime, workload, size, scope] = row.key.split(',');
    const pair = expectedPairs.find(pair => pair.label === comparison); assert(pair);
    for (const [name, value] of Object.entries({ comparison, regime, workload, scope, kind: pair.kind, before: pair.before, after: pair.after })) assert.equal(row[name], value);
    assert.equal(row.size, Number(size));
    assert.equal(row.sessions.length, environment.sessions); assert.equal(expected.length, environment.sessions);
    for (const [index, actual] of row.sessions.entries()) {
      const e = expected[index]; assert.equal(actual.session, e.session); assert.equal(actual.n, e.baseline.n);
      for (const name of ['baseline', 'candidate']) {
        assert.equal(actual[name].key, e[name].key);
        for (const field of ['n', 'median', 'iqr', 'p95']) assert.equal(actual[name][field], e[name][field]);
      }
      for (const field of ['medianAllowanceMs', 'p95AllowanceMs', 'medianExceeded', 'p95Exceeded', 'reuseTarget', 'medianGainAtLeast10Percent']) assert.equal(actual[field], e[field], `${row.key}/${actual.session}/${field}`);
      for (const field of ['median', 'p95']) {
        assert.equal(actual.delta[field].ms, e.candidate[field] - e.baseline[field]);
        assert.equal(actual.delta[field].percent, e.baseline[field] ? 100 * (e.candidate[field] / e.baseline[field] - 1) : null);
      }
    }
    assert.equal(row.medianGateExceedances, expected.filter(e => e.medianExceeded).length);
    assert.equal(row.p95GateExceedances, expected.filter(e => e.p95Exceeded).length);
    assert.equal(row.gainsOf10Percent, expected.filter(e => e.medianGainAtLeast10Percent).length);
    assert.equal(row.reuseTarget, expected[0].reuseTarget);
    assert.equal(row.needsFinalPolicyTailSupplement, !environment.smoke && !environment.supplement && expected.some(e => e.medianExceeded || e.p95Exceeded));
  }
  assert.equal(keys.size, 0, 'Missing policy conditions');
}
verifyDecisions(decisions);
let wrongGateRejected = null;
if (decisions.length) {
  const changed = structuredClone(decisions); changed[0].sessions[0].p95Exceeded = !changed[0].sessions[0].p95Exceeded;
  assert.throws(() => verifyDecisions(changed)); wrongGateRejected = true;
}
const result = { status: 'passed', checkedAt: new Date().toISOString(), pairs: expectedPairs.length,
  completeContrasts: contrasts.length, decisionConditions: decisions.length, decisionSessions: decisions.reduce((n, row) => n + row.sessions.length, 0),
  wrongGateRejected, sourceEnvironmentSha256: sha(`${directory}/environment.json`), summarySha256: sha(`${directory}/summary.json`),
  statisticsAuditSha256: sha(`${directory}/statistics-audit.json`), decisionsSha256: sha(`${directory}/decisions.json`),
  contrastsSha256: sha(`${directory}/contrasts.json.gz`), scriptSha256: sha('scripts/audit-task-policy.mjs'),
  note: 'All defined same-engine app pairs and same-app engine pairs, every paired distribution and every applicable preregistered policy condition/session checked. Quantiles are tied by hash to the independent raw-data audit. A deliberately inverted tail gate is rejected.' };
writeFileSync(`${directory}/policy-audit.json`, JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
