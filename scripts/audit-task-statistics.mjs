// Independent quantile/report check; deliberately does not import statistics.ts.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const directory = process.argv[2];
assert(directory, 'Usage: node scripts/audit-task-statistics.mjs docs/bench/tag');
const json = name => JSON.parse(readFileSync(`${directory}/${name}.json`));
const compressed = name => JSON.parse(gunzipSync(readFileSync(`${directory}/${name}.json.gz`)));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const env = json('environment'), analysis = json('analysis'), summary = json('summary');
assert.equal(env.status, 'passed'); assert.equal(analysis.status, 'passed');
const samples = new Map(), trajectories = new Map(), initializations = new Map(), trajectoryGroups = new Map();
const put = (key, value) => { assert(Number.isFinite(value) && value >= 0); if (!samples.has(key)) samples.set(key, []); samples.get(key).push(value); };
for (let session = 1; session <= env.sessions; session++) {
  const raw = gunzipSync(readFileSync(`${directory}/session-${session}.jsonl.gz`)).toString().trim().split('\n');
  for (const line of raw) {
    const row = JSON.parse(line);
    const prefix = [session, row.regime, row.workload, row.size, row.build].join(',');
    if (row.sampleKind === 'initialization') initializations.set(prefix, row.initialization.cpuMs);
    if (!['sample', 'warmup'].includes(row.sampleKind)) continue;
    if (row.regime === 'persistent') {
      const point = { cpu: row.lifecycleCpuMs, updates: row.updateCount, perUpdate: row.amortizedCpuMs, initialCpuMs: initializations.get(prefix) };
      trajectories.set(`${prefix},${row.index}`, point);
      if (!trajectoryGroups.has(prefix)) trajectoryGroups.set(prefix, []); trajectoryGroups.get(prefix).push(point);
    }
    if (row.sampleKind !== 'sample') continue;
    let total = 0;
    for (const [index, action] of row.result.actions.entries()) {
      total += action.timings.primaryMs + action.followups.reduce((sum, followup) => sum + followup.flushMs + followup.effectMs, 0);
      for (const [metric, value] of Object.entries(action.timings)) put(`${prefix},action-${index}-${action.action.kind},${metric}`, value);
    }
    assert(Math.abs(total - row.result.totalCpuMs) < .00001);
    put(`${prefix},workload,totalCpuMs`, total);
    if (row.regime === 'fresh') {
      put(`${prefix},lifecycle,totalCpuMs`, total + row.initialization.cpuMs);
      put(`${prefix},initialization,cpuMs`, row.initialization.cpuMs);
      put(`${prefix},initialization,elapsedMs`, row.initialization.elapsedMs);
    }
  }
}
function independentDistribution(input) {
  const sorted = input.toSorted((a, b) => a - b);
  const percentile = numerator => {
    const rank = (sorted.length - 1) * numerator / 100;
    if (Number.isInteger(rank)) return sorted[rank];
    const lower = Math.trunc(rank), fraction = rank % 1;
    return sorted[lower] * (1 - fraction) + sorted[lower + 1] * fraction;
  };
  const q1 = percentile(25), q3 = percentile(75);
  return { n: sorted.length, median: percentile(50), q1, q3, iqr: q3 - q1, p95: percentile(95), min: sorted[0], max: sorted.at(-1) };
}
const close = (actual, expected, message) => assert(Math.abs(actual - expected) < .000001, message);
const independentlyCalculated = new Map([...samples].map(([key, values]) => [key, independentDistribution(values)]));
function verifySummary(rows) {
  const remaining = new Set(samples.keys());
  for (const row of rows) {
    assert(remaining.delete(row.key), `Duplicate/unexpected summary key: ${row.key}`);
    const expected = independentlyCalculated.get(row.key);
    for (const [field, value] of Object.entries(expected)) close(row[field], value, `${row.key}/${field}`);
  }
  assert.equal(remaining.size, 0);
}
verifySummary(summary);
const tampered = structuredClone(summary); tampered[0].p95 += 1;
assert.throws(() => verifySummary(tampered), 'A changed percentile must be detected');
assert.throws(() => verifySummary([...summary, summary[0]]), 'A duplicate row must be detected');
const csv = readFileSync(`${directory}/summary.csv`, 'utf8').trim().split('\n').slice(1);
assert.equal(csv.length, summary.length);
const csvKeys = new Set(samples.keys());
for (const line of csv) {
  const values = line.split(','), key = values.slice(0, 7).join(','), expected = independentlyCalculated.get(key); assert(expected);
  assert(csvKeys.delete(key), `Duplicate/unexpected summary CSV: ${key}`);
  assert.equal(values.length, 15);
  for (const [offset, field] of ['n', 'median', 'q1', 'q3', 'iqr', 'p95', 'min', 'max'].entries()) close(Number(values[7 + offset]), expected[field], `CSV ${key}/${field}`);
}
assert.equal(csvKeys.size, 0);
const tableRows = readFileSync(`${directory}/all-results.md`, 'utf8').split('\n').filter(line => /^\| \d+,/.test(line));
assert.equal(tableRows.length, summary.filter(row => /,(workload|lifecycle),totalCpuMs$/.test(row.key)).length);
const tableKeys = new Set([...samples.keys()].filter(key => /,(workload|lifecycle),totalCpuMs$/.test(key)));
for (const line of tableRows) {
  const values = line.split('|').slice(1, -1).map(s => s.trim()), expected = independentlyCalculated.get(`${values[0]},totalCpuMs`); assert(expected);
  assert(tableKeys.delete(`${values[0]},totalCpuMs`), 'Duplicate/unexpected summary table row');
  assert.equal(Number(values[1]), expected.n);
  for (const [index, field] of ['median', 'iqr', 'p95'].entries()) assert.equal(values[index + 2], expected[field].toFixed(3));
}
assert.equal(tableKeys.size, 0);
for (const build of env.builds) {
  for (const group of ['engine', 'app', 'harness']) assert.equal(build[`${group}Hash`], sha(JSON.stringify(build.groups[group])));
  assert.equal(build.dependencyHash, sha(JSON.stringify(build.groups.dependencies)));
}
let contrastsChecked = 0, comparisonCsvRows = 0, comparisonMarkdownRows = 0, amortizationChecked = 0;
if (existsSync(`${directory}/contrasts.json.gz`)) {
  const contrastRows = compressed('contrasts');
  for (const row of contrastRows) {
    for (const name of ['baseline', 'candidate']) {
      const source = independentlyCalculated.get(row[name].key); assert(source);
      for (const [field, value] of Object.entries(source)) close(row[name][field], value, `Contrast ${name}/${field}`);
    }
    for (const field of ['median', 'p95']) {
      close(row.delta[field].ms, row.candidate[field] - row.baseline[field], 'Contrast absolute delta');
      if (row.baseline[field] !== 0) close(row.delta[field].percent, 100 * (row.candidate[field] / row.baseline[field] - 1), 'Contrast percent');
      else assert.equal(row.delta[field].percent, null);
    }
    contrastsChecked++;
  }
  const reported = contrastRows.filter(row => (row.metric === 'totalCpuMs' && ['workload', 'lifecycle'].includes(row.scope)) || (row.scope === 'initialization' && row.metric === 'cpuMs'));
  const reportKey = row => [row.comparison, row.session, row.regime, row.workload, row.size, row.scope].join(',');
  const reports = new Map(reported.map(row => [reportKey(row), row]));
  assert.equal(reports.size, reported.length);
  const csvRemaining = new Set(reports.keys());
  for (const line of readFileSync(`${directory}/contrasts.csv`, 'utf8').trim().split('\n').slice(1)) {
    const fields = line.split(','), key = fields.slice(0, 6).join(','); assert(csvRemaining.delete(key), `Duplicate/unexpected comparison CSV: ${key}`);
    const row = reports.get(key);
    const expected = [row.baseline.n, row.baseline.median, row.baseline.iqr, row.baseline.p95, row.candidate.median, row.candidate.iqr, row.candidate.p95, row.delta.median.ms, row.delta.median.percent, row.delta.p95.ms, row.delta.p95.percent];
    assert.equal(fields.length, 6 + expected.length);
    expected.forEach((value, index) => value === null ? assert.equal(fields[index + 6], '') : close(Number(fields[index + 6]), value, `Comparison CSV ${key}/${index}`));
    comparisonCsvRows++;
  }
  assert.equal(csvRemaining.size, 0);
  const mdRemaining = new Set(reports.keys());
  for (const line of readFileSync(`${directory}/comparisons.md`, 'utf8').split('\n').filter(line => /^\| [AE]\d+:/.test(line))) {
    const fields = line.split('|').slice(1, -1).map(value => value.trim());
    const key = [fields[0], fields[1], ...fields[2].split('/')].join(','); assert(mdRemaining.delete(key), `Duplicate/unexpected comparison table: ${key}`);
    const row = reports.get(key); assert.equal(Number(fields[3]), row.baseline.n);
    assert.equal(fields[4], [row.baseline.median, row.baseline.iqr, row.baseline.p95].map(value => value.toFixed(3)).join(' / '));
    assert.equal(fields[5], [row.candidate.median, row.candidate.iqr, row.candidate.p95].map(value => value.toFixed(3)).join(' / '));
    for (const [index, statistic] of ['median', 'p95'].entries()) assert.equal(fields[6 + index], row.delta[statistic].percent === null ? 'n/a' : `${row.delta[statistic].percent.toFixed(1)}%`);
    comparisonMarkdownRows++;
  }
  assert.equal(mdRemaining.size, 0);
  const pairs = new Map(json('comparison-audit').pairs.map(pair => [pair.label, pair]));
  for (const row of compressed('amortization')) {
    const pair = pairs.get(row.comparison); assert(pair);
    const key = tag => [row.session, row.regime, row.workload, row.size, tag, row.index].join(',');
    const before = trajectories.get(key(pair.before)), after = trajectories.get(key(pair.after)); assert(before && after);
    assert.equal(row.updatesIncludingWarmup, before.updates); assert.equal(before.updates, after.updates);
    close(row.beforeCpuMs, before.cpu, 'Lifecycle before CPU'); close(row.afterCpuMs, after.cpu, 'Lifecycle after CPU');
    close(row.beforeInitialCpuMs, before.initialCpuMs, 'Initial CPU before'); close(row.afterInitialCpuMs, after.initialCpuMs, 'Initial CPU after');
    close(row.beforePerUpdateMs, before.perUpdate, 'Amortization before'); close(row.afterPerUpdateMs, after.perUpdate, 'Amortization after');
    close(row.cumulativeDifferenceMs, after.cpu - before.cpu, 'Cumulative difference'); amortizationChecked++;
  }
  for (const recovery of json('recovery')) {
    const pair = pairs.get(recovery.comparison); assert(pair);
    const prefix = tag => [recovery.session, 'persistent', recovery.workload, recovery.size, tag].join(',');
    const before = trajectoryGroups.get(prefix(pair.before)).toSorted((a, b) => a.updates - b.updates);
    const after = trajectoryGroups.get(prefix(pair.after)).toSorted((a, b) => a.updates - b.updates);
    assert.equal(before.length, after.length); assert(before.length > 0);
    const differences = before.map((value, index) => ({ updates: value.updates, delta: after[index].cpu - value.cpu }));
    assert.equal(recovery.firstObservedNonpositiveAt, differences.find(point => point.delta <= 0)?.updates ?? null);
    const stableIndex = differences.findLastIndex(point => point.delta > 0) + 1;
    assert.equal(recovery.nonpositiveThroughObservedEndFrom, differences[stableIndex]?.updates ?? null);
    close(recovery.initialDifferenceMs, after[0].initialCpuMs - before[0].initialCpuMs, 'Initial cost difference');
    close(recovery.finalDifferenceMs, differences.at(-1).delta, 'Final lifecycle difference');
  }
}
let graphPointsChecked = 0;
if (existsSync(`${directory}/plot-values.json`)) {
  const plots = json('plot-values'); assert.equal(plots.sourceSha256, sha(readFileSync(`${directory}/contrasts.json.gz`)));
  for (const figure of plots.figures) {
    for (const artifact of figure.files) assert.equal(artifact.sha256, sha(readFileSync(`${directory}/${artifact.file}`)));
    for (const point of figure.points) {
      const before = independentlyCalculated.get(point.beforeKey), after = independentlyCalculated.get(point.afterKey); assert(before && after);
      close(point.before, before[point.statistic], 'Graph before value'); close(point.after, after[point.statistic], 'Graph after value');
      assert.equal(point.n, before.n); assert.equal(before.n, after.n);
      if (before[point.statistic]) close(point.deltaPercent, 100 * (after[point.statistic] / before[point.statistic] - 1), 'Graph percent');
      else assert.equal(point.deltaPercent, null);
      graphPointsChecked++;
    }
  }
}
const result = { status: 'passed', auditedAt: new Date().toISOString(), scriptSha256: sha(readFileSync('scripts/audit-task-statistics.mjs')),
  summarySha256: sha(readFileSync(`${directory}/summary.json`)), distributions: summary.length, csvRows: csv.length, markdownRows: tableRows.length,
  contrastsChecked, comparisonCsvRows, comparisonMarkdownRows, amortizationChecked, graphPointsChecked, independentQuantiles: true, corruptedP95Rejected: true, duplicateSummaryRejected: true,
  note: 'All samples retained; independently recomputed interpolation, complete-action sums, per-session quantiles, source-group hashes, tables, contrasts and cumulative trajectories. Browser semantic assertions are separately audited by analyze-task.mjs and the frozen harness source.' };
writeFileSync(`${directory}/statistics-audit.json`, JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
