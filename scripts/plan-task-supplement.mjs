// Prepare, but never execute, the preregistered tail follow-ups for a proposed policy.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const [tag, engine] = process.argv.slice(2);
assert(tag && /^[a-z0-9-]+$/.test(tag) && /^E\d+[A-Z]*$/.test(engine), 'Usage: node scripts/plan-task-supplement.mjs run-tag E3');
const directory = `docs/bench/${tag}`;
const read = name => JSON.parse(readFileSync(`${directory}/${name}.json`));
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const environment = read('environment'), audit = read('statistics-audit'), decisions = read('decisions');
assert.equal(environment.status, 'passed'); assert.equal(audit.status, 'passed');
const policyAudit = read('policy-audit'); assert.equal(policyAudit.status, 'passed');
assert.equal(policyAudit.decisionsSha256, sha(`${directory}/decisions.json`));
assert.equal(policyAudit.statisticsAuditSha256, sha(`${directory}/statistics-audit.json`));
assert.equal(environment.smoke, false); assert.equal(environment.supplement, false); assert.equal(environment.sessions, 3);
const comparisons = [`A1: E1 -> ${engine}`, `${engine}: A0 -> A1`];
const rows = decisions.filter(row => comparisons.includes(row.comparison));
for (const comparison of comparisons) assert(rows.some(row => row.comparison === comparison), `Missing engine/app comparison: ${comparison}`);
const selected = rows.filter(row => row.medianGateExceedances || row.p95GateExceedances);
const groups = new Map();
for (const row of selected) {
  const key = `${row.regime}/${row.size}`;
  if (!groups.has(key)) groups.set(key, { regime: row.regime, size: row.size, workloads: new Set(), conditions: [] });
  const group = groups.get(key); group.workloads.add(row.workload); group.conditions.push(row.key);
}
const builds = environment.builds.map(build => build.tag);
const runs = [...groups.values()].map(group => {
  const workloads = environment.workloads.filter(workload => group.workloads.has(workload));
  const newTag = `${tag}-tail-${group.regime}-${group.size}-v1`;
  return { tag: newTag, regime: group.regime, size: group.size, workloads, reasons: group.conditions,
    args: ['scripts/benchmark-task.mjs', `--tag=${newTag}`, `--builds=${builds.join(',')}`, `--sizes=${group.size}`,
      `--regimes=${group.regime}`, `--workloads=${workloads.join(',')}`, '--sessions=3', '--supplement'] };
});
const result = {
  status: 'planned, not executed; final policy selection remains separate', createdAt: new Date().toISOString(), engine,
  sourceRun: tag, sourceEnvironmentSha256: sha(`${directory}/environment.json`),
  sourceDecisionsSha256: sha(`${directory}/decisions.json`), statisticsAuditSha256: sha(`${directory}/statistics-audit.json`),
  policyAuditSha256: sha(`${directory}/policy-audit.json`),
  plannerSha256: sha('scripts/plan-task-supplement.mjs'), comparisons, inspectedConditions: rows.length,
  selectedConditions: selected.map(row => ({ key: row.key, medianGateExceedances: row.medianGateExceedances,
    p95GateExceedances: row.p95GateExceedances, affectedSessions: row.sessions.filter(s => s.medianExceeded || s.p95Exceeded).map(s => s.session) })),
  runs,
  note: 'All median/p95 gate exceedances for the proposed final engine and its app pair are retained, including initialization/lifecycle and individual CRUD actions. One exceeding session is sufficient, covering mixed tail pass/fail judgments. Workload reruns also retain all subordinate actions; all original comparators, warm-ups, harness, seed and oracles stay fixed. Three new sessions each with n=180; no pooling with initial runs. This plan is not an adoption or a claim that nonselected conditions improved.'
};
const output = `${directory}/tail-supplement-plan-${engine.toLowerCase()}.json`;
assert(!existsSync(output), 'Preserve an existing supplement plan');
writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ output, inspectedConditions: rows.length, selectedConditions: selected.length, runs }));
