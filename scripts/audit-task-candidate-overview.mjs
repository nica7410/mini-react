import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const directory = 'docs/bench/task-candidate-v1';
const diagnosticDirectory = 'docs/bench/task-diagnostic-candidate-v1';
const report = 'docs/task-app-engine-candidate.md';
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const json = file => JSON.parse(readFileSync(file));
const statistics = json(`${directory}/statistics-audit.json`), policy = json(`${directory}/policy-audit.json`);
assert.equal(statistics.status, 'passed'); assert.equal(policy.status, 'passed');
assert.equal(policy.statisticsAuditSha256, sha(`${directory}/statistics-audit.json`));
assert.equal(statistics.summarySha256, sha(`${directory}/summary.json`));
const contrasts = JSON.parse(gunzipSync(readFileSync(`${directory}/contrasts.json.gz`)));
assert.equal(policy.contrastsSha256, sha(`${directory}/contrasts.json.gz`));
const text = readFileSync(report, 'utf8'), sourceRows = [];
for (const workload of ['counter', 'search', 'sort', 'move']) {
  const rows = contrasts.filter(row => row.comparison === 'A1: E1 -> E3' && row.regime === 'persistent' && row.workload === workload && row.size === 10000 && row.scope === 'workload' && row.metric === 'totalCpuMs').sort((a, b) => a.session - b.session);
  assert.deepEqual(rows.map(row => row.session), [1, 2, 3]);
  const cells = ['median', 'p95'].map(field => rows.map(row => {
    const value = row.delta[field].percent;
    return `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(2)}%`;
  }).join(' / '));
  assert(text.includes(`| ${workload} / 10,000 | ${cells.join(' | ')} |`), `Candidate table: ${workload}`);
  sourceRows.push(...rows.map(row => ({ before: row.baseline.key, after: row.candidate.key, delta: row.delta })));
}
const diagnosticReport = `${diagnosticDirectory}/diagnostic-report-audit.json`, diagnostic = json(diagnosticReport);
assert.equal(diagnostic.status, 'passed');
assert.equal(diagnostic.sourceSummarySha256, sha(`${diagnosticDirectory}/diagnostic-summary.json`));
assert.equal(diagnostic.reportSha256, sha(`${diagnosticDirectory}/diagnostics.md`));
const names = ['e1', 'e2', 'e3'];
for (const [index, label] of [[1, 'mount 직후 MiB'], [2, '마지막 작업 뒤 MiB'], [3, 'dispose 뒤 MiB']]) {
  const values = names.map(engine => (diagnostic.memoryRows.find(row => row.name === `task-${engine}-a1-v1-10000-memory-mixed`).usedBytes[index] / 1048576).toFixed(3));
  assert(text.includes(`| ${label} | ${values.join(' | ')} |`), `Candidate memory: ${label}`);
}
for (const engine of ['e2', 'e3']) for (const workload of ['sort', 'crud']) {
  const row = diagnostic.cpuRows.find(row => row.name === `task-${engine}-a1-v1-10000-cpu-${workload}`);
  assert(text.includes(`${row.freezePercent.toFixed(3)}%`));
  assert(text.includes(row.primaryGcCategoryMs.toFixed(3)));
  assert(text.includes((row.allocationEstimatedBytes / 1048576).toFixed(3)));
}
for (const engine of ['e1', 'e3']) for (const workload of ['counter', 'move']) {
  const row = diagnostic.visualRows.find(row => row.name === `task-${engine}-a1-v1-10000-visual-${workload}`);
  assert(text.includes(`${row.paintMs.map(value => value.toFixed(3)).join('/')}ms`));
}
const decisions = json(`${directory}/decisions.json`);
const gates = ['A1: E1 -> E3', 'E3: A0 -> A1'].map(comparison => {
  const selected = decisions.filter(row => row.comparison === comparison);
  return { comparison, inspected: selected.length, exceeded: selected.filter(row => row.medianGateExceedances || row.p95GateExceedances).length };
});
assert(text.includes(`엔진 비교 ${gates[0].inspected}개 중 ${gates[0].exceeded}개, E3의 앱 비교 ${gates[1].inspected}개 중 ${gates[1].exceeded}개`));
const result = { status: 'passed', checkedAt: new Date().toISOString(), report, reportSha256: sha(report),
  scriptSha256: sha('scripts/audit-task-candidate-overview.mjs'), statisticsAuditSha256: sha(`${directory}/statistics-audit.json`),
  policyAuditSha256: sha(`${directory}/policy-audit.json`), diagnosticReportSha256: sha(diagnosticReport),
  percentageRows: 4, memoryRows: 3, cpuExamples: 4, visualExamples: 4, gates, sourceRows,
  note: 'Candidate overview checked against the independent per-session statistical audit and separate diagnostic report. No timing/profiling distributions pooled.' };
writeFileSync(`${directory}/overview-audit.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ status: result.status, percentageRows: result.percentageRows, memoryRows: result.memoryRows, gates }));
