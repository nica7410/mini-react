import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const directory = 'docs/bench/task-matrix-v1', report = 'docs/task-app-baseline-results.md';
const json = name => JSON.parse(readFileSync(`${directory}/${name}.json`));
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const data = JSON.parse(gunzipSync(readFileSync(`${directory}/contrasts.json.gz`))), decisions = json('decisions'), text = readFileSync(report, 'utf8');
const audit = json('statistics-audit'); assert.equal(audit.status, 'passed'); assert.equal(audit.graphPointsChecked, 240);
const summaries = new Map(json('summary').map(row => [row.key, row]));
const phases = [['root expression', 'expressionMs'], ['render', 'renderMs'], ['파생 VDOM', 'vdomMs'], ['diff', 'diffMs'], ['commit', 'commitMs'], ['Effect', 'effectMs']];
for (const [label, metric] of phases) {
  const cells = ['task-e1-a1-v1', 'task-e2-a1-v1'].map(tag => [1, 2, 3].map(session => summaries.get(`${session},persistent,sort,10000,${tag},action-0-sort,${metric}`).median.toFixed(2)).join(' / '));
  assert(text.includes(`| ${label} | ${cells.join(' | ')} |`), `Phase table: ${label}`);
}
const definitions = [
  ['E2 고정, A0→A1', 'counter / 10,000', 'E2: A0 -> A1', 'persistent', 'counter', 10000, 'workload'],
  ['E2 고정, A0→A1', 'CRUD / 10,000', 'E2: A0 -> A1', 'persistent', 'crud', 10000, 'workload'],
  ['E2 고정, A0→A1', 'sort / 10,000', 'E2: A0 -> A1', 'persistent', 'sort', 10000, 'workload'],
  ['A1 고정, E1→E2', 'counter / 10,000', 'A1: E1 -> E2', 'persistent', 'counter', 10000, 'workload'],
  ['A1 고정, E1→E2', 'search / 1,000', 'A1: E1 -> E2', 'persistent', 'search', 1000, 'workload'],
  ['A1 고정, E1→E2', 'search / 10,000', 'A1: E1 -> E2', 'persistent', 'search', 10000, 'workload'],
  ['A1 고정, E1→E2', 'move / 10,000', 'A1: E1 -> E2', 'persistent', 'move', 10000, 'workload'],
  ['A1 고정, E1→E2', 'fresh 초기화+equal / 10,000', 'A1: E1 -> E2', 'fresh', 'equal', 10000, 'lifecycle'],
];
const sourceRows = [];
for (const [axis, label, comparison, regime, workload, size, scope] of definitions) {
  const lines = text.split('\n').filter(line => line.startsWith(`| ${axis} | ${label} |`)); assert.equal(lines.length, 1);
  const cells = lines[0].split('|').slice(1, -1).map(cell => cell.trim());
  const rows = data.filter(row => row.comparison === comparison && row.regime === regime && row.workload === workload && row.size === size && row.scope === scope && row.metric === 'totalCpuMs').sort((a, b) => a.session - b.session);
  assert.deepEqual(rows.map(row => row.session), [1, 2, 3]);
  for (const [offset, statistic] of ['median', 'p95'].entries()) {
    const expected = rows.map(row => { const value = row.delta[statistic].percent; return `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(2)}%`; }).join(' / ');
    assert.equal(cells[offset + 2], expected, `${comparison}/${label}/${statistic}`);
  }
  sourceRows.push(...rows.map(row => ({ before: row.baseline.key, after: row.candidate.key, delta: row.delta })));
}
for (const comparison of ['E0: A0 -> A1', 'E1: A0 -> A1', 'E2: A0 -> A1', 'A1: E1 -> E2']) {
  const selected = decisions.filter(row => row.comparison === comparison);
  const label = comparison.replaceAll(' -> ', '→');
  const expected = `| ${label} | ${selected.length} | ${selected.filter(row => row.medianGateExceedances).length} | ${selected.filter(row => row.p95GateExceedances).length} |`;
  assert(text.includes(expected), `Gate count table: ${comparison}`);
}
const format = value => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
for (const row of data.filter(row => row.comparison === 'E2: A0 -> A1' && row.regime === 'persistent' && row.workload === 'counter' && row.size === 10000 && row.scope === 'workload' && row.metric === 'totalCpuMs')) assert(text.includes(`${format(row.baseline.median)}→${format(row.candidate.median)}ms`));
const move = data.find(row => row.comparison === 'A1: E1 -> E2' && row.session === 3 && row.regime === 'persistent' && row.workload === 'move' && row.size === 10000 && row.scope === 'workload' && row.metric === 'totalCpuMs');
assert(text.includes(`${format(move.baseline.p95)}→${format(move.candidate.p95)}ms`));
const diagnosticReport = 'docs/bench/task-diagnostic-baseline-v1/diagnostic-report-audit.json';
const diagnostic = JSON.parse(readFileSync(diagnosticReport)); assert.equal(diagnostic.status, 'passed');
for (const workload of ['sort', 'crud']) {
  const row = diagnostic.cpuRows.find(row => row.name === `task-e2-a1-v1-10000-cpu-${workload}`);
  assert(text.includes(`${row.freezePercent.toFixed(2)}%`));
}
for (const index of [1, 2, 3]) {
  const pair = ['e1', 'e2'].map(engine => diagnostic.memoryRows.find(row => row.name === `task-${engine}-a1-v1-10000-memory-mixed`).usedBytes[index]);
  assert(text.includes(`${pair.map(value => (value / 1048576).toFixed(3)).join('/')}MiB`));
}
const result = { status: 'passed', checkedAt: new Date().toISOString(), report, reportSha256: sha(report),
  scriptSha256: sha('scripts/audit-task-overview.mjs'), contrastsSha256: sha(`${directory}/contrasts.json.gz`), percentageRows: definitions.length, gateRows: 4, phaseRows: phases.length,
  sourceRows, diagnosticReportSha256: sha(diagnosticReport), diagnosticExamplesChecked: true,
  note: 'Overview percentages and gate counts checked against independently audited per-session distributions; phase tables and selected absolute-time/diagnostic examples also checked.' };
writeFileSync(`${directory}/overview-audit.json`, JSON.stringify(result, null, 2)); console.log(JSON.stringify({ status: result.status, percentageRows: result.percentageRows, gateRows: result.gateRows }));
