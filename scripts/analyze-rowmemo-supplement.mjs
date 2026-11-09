import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { distribution } from '../src/bench/statistics.ts';

const pairs = {
  app: { before: 'task-e9-a0-v1', after: 'task-e9-a2-v1', median: .5, p95: 1 },
  engine: { before: 'task-e7-a0-v1', after: 'task-e9-a0-v1', median: 1, p95: 2 },
};
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const raw = file => gunzipSync(readFileSync(file)).toString().trim().split('\n').filter(Boolean).map(JSON.parse);
const prefix = (row, tag = row.build) => [row.session, row.regime, row.workload, row.size, tag].join(',');

function collect(directory, environment) {
  const samples = new Map();
  const collectValue = (key, value) => {
    if (!samples.has(key)) samples.set(key, []);
    samples.get(key).push(value);
  };
  for (let session = 1; session <= environment.sessions; session++) {
    const metadata = `${directory}/session-${session}.json`;
    if (!existsSync(metadata)) {
      assert.notEqual(environment.status, 'passed', 'Missing completed session');
      continue;
    }
    const completed = read(metadata).processes.filter(p => p.status === 'passed' && p.disposed);
    const byProcess = new Map(completed.map(p => [prefix({ ...p, session }), new Set()]));
    for (const row of raw(`${directory}/session-${session}.jsonl.gz`)) {
      const key = prefix(row);
      if (row.sampleKind !== 'sample' || !byProcess.has(key)) continue;
      const indices = byProcess.get(key);
      assert(Number.isInteger(row.index) && !indices.has(row.index), `Duplicate or invalid sample: ${key}`);
      indices.add(row.index);
      const actions = row.result.actions;
      const workloadTotal = actions.reduce((sum, action) => sum + action.timings.totalCpuMs, 0);
      assert.equal(workloadTotal, row.result.totalCpuMs, key);
      collectValue(`${key},workload,totalCpuMs`, workloadTotal);
      if (row.workload === 'crud') {
        assert.deepEqual(actions.map(action => action.action.kind), ['draft', 'add', 'rename', 'toggle', 'delete']);
        actions.forEach(({ action, timings }, index) => {
          collectValue(`${key},action-${index}-${action.kind},totalCpuMs`, timings.totalCpuMs);
        });
      }
      if (row.regime === 'fresh') {
        assert.equal(row.lifecycleCpuMs, row.initialization.cpuMs + workloadTotal, key);
        collectValue(`${key},initialization,cpuMs`, row.initialization.cpuMs);
        collectValue(`${key},lifecycle,totalCpuMs`, row.lifecycleCpuMs);
      }
    }
    for (const [key, indices] of byProcess) {
      const regime = key.split(',')[1];
      const n = environment.repetitions[regime].samples;
      assert.equal(indices.size, n, key);
      assert([...indices].every(index => index >= 0 && index < n), key);
    }
  }
  return new Map([...samples].map(([key, values]) => [key, { key, ...distribution(values) }]));
}

function compare(summary, kind, run, allowIncomplete = false) {
  const pair = pairs[kind];
  const rows = [];
  for (const baseline of summary.values()) {
    const [session, regime, workload, size, tag, scope, metric] = baseline.key.split(',');
    if (tag !== pair.before) continue;
    const candidate = summary.get([session, regime, workload, size, pair.after, scope, metric].join(','));
    if (!candidate && allowIncomplete) continue;
    assert(candidate, baseline.key);
    assert.equal(baseline.n, candidate.n);
    const gate = {};
    for (const [statistic, rate] of [['median', .05], ['p95', .10]]) {
      const deltaMs = candidate[statistic] - baseline[statistic];
      const allowanceMs = Math.max(baseline[statistic] * rate, pair[statistic]);
      gate[statistic] = {
        deltaMs,
        deltaPercent: baseline[statistic] ? deltaMs / baseline[statistic] * 100 : null,
        allowanceMs,
        exceeded: deltaMs > allowanceMs,
      };
    }
    rows.push({ run, kind, condition: `${regime}/${workload}/${size}`, scope, metric, session: Number(session), baseline, candidate, gate });
  }
  return rows;
}

const exceeds = row => row.gate.median.exceeded || row.gate.p95.exceeded;
const history = {};
const reference = read('docs/bench/followup-rowmemo-confirm-v2/environment.json');
for (const version of ['v1', 'v2']) {
  const directory = `docs/bench/followup-rowmemo-confirm-${version}`;
  const environment = read(`${directory}/environment.json`);
  assert.equal(environment.status, 'passed');
  assert.deepEqual(environment.builds, reference.builds);
  const original = new Map(read(`${directory}/summary.json`).map(row => [row.key, row]));
  const recalculated = collect(directory, environment);
  for (const [key, stats] of recalculated) assert.deepEqual(stats, original.get(key), key);
  history[version] = {};
  for (const kind of Object.keys(pairs)) {
    const rows = compare(recalculated, kind, version);
    assert.equal(rows.length, 3 * 3 * (9 + 5 + 3), `${version} ${kind} decision rows`);
    history[version][kind] = { compared: rows.length, exceeded: rows.filter(exceeds) };
  }
}
const historicalConditions = Object.fromEntries(Object.keys(pairs).map(kind => [kind, [...new Set(
  Object.values(history).flatMap(version => version[kind].exceeded.map(row => row.condition)),
)].sort()]));
console.log(JSON.stringify(historicalConditions, null, 2));

const directory = process.argv[2];
if (directory) {
  const execution = read(`${directory}/execution.json`);
  const supplement = execution.runs.map(run => {
    const path = `${directory}/${run.tag}`;
    if (!existsSync(`${path}/environment.json`)) return { tag: run.tag, rows: [] };
    const environment = read(`${path}/environment.json`);
    assert(environment.supplement && !environment.smoke);
    assert.deepEqual(environment.sizes, [run.size]);
    assert.deepEqual(environment.workloads, [run.workload]);
    assert.deepEqual(environment.regimes, ['persistent']);
    assert.equal(environment.sessions, 3);
    assert.equal(environment.repetitions.persistent.warmup, 10);
    assert.equal(environment.repetitions.persistent.samples, 180);
    assert.equal(environment.seed, reference.seed);
    assert.deepEqual(environment.viewport, reference.viewport);
    assert.equal(environment.deadlineAt, execution.deadlineAt);
    assert.equal(environment.alternatePairOrder, true);
    const { before, after } = pairs[run.kind];
    assert.deepEqual(environment.builds.map(build => build.tag).sort(), [before, after].sort());
    for (const build of environment.builds) {
      assert.deepEqual(build, reference.builds.find(fixed => fixed.tag === build.tag));
    }
    if (environment.status === 'passed') {
      const tags = environment.builds.map(build => build.tag);
      for (let session = 1; session <= environment.sessions; session++) {
        const { processes } = read(`${path}/session-${session}.json`);
        assert.deepEqual(processes.map(process => process.build), session % 2 ? tags : [...tags].reverse());
      }
    }
    const rows = compare(collect(path, environment), run.kind, 'supplement', environment.status !== 'passed');
    if (environment.status === 'passed') assert.equal(rows.length, 3 * (run.workload === 'crud' ? 6 : 1));
    return { tag: run.tag, status: environment.status, rows };
  });
  writeFileSync(`${directory}/comparison.json`, JSON.stringify({ pairs, historicalConditions, history, supplement }, null, 2) + '\n', { flag: 'wx' });
}
