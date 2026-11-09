import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { distribution } from '../src/bench/statistics.ts';
import { initialTaskModel, taskActions, applyTaskAction, visibleTasks } from '../src/bench/task-model.ts';

const directory = process.argv[2];
assert(directory, 'Usage: node scripts/analyze-task.mjs docs/bench/tag');
const env = JSON.parse(readFileSync(`${directory}/environment.json`)); assert.equal(env.status, 'passed');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(readFileSync('docs/task-app-comparison-plan.md')), env.planSha256, 'Preregistered comparison plan changed');
// The runner may change after a run; verify it against the exact runner at the recorded commit instead.
const runnerAtCommit = () => sha(execFileSync('git', ['show', `${env.runnerCommit}:scripts/benchmark-task.mjs`]));
assert(sha(readFileSync('scripts/benchmark-task.mjs')) === env.runnerSha256 || runnerAtCommit() === env.runnerSha256, 'Timing runner differs from recorded source');
assert.equal(sha(readFileSync('src/bench/task-model.ts')), env.builds[0].groups.harness['src/bench/task-model.ts'], 'Audit model differs from frozen harness');
for (const build of env.builds) {
  const archive = JSON.parse(gunzipSync(readFileSync(`${directory}/${build.tag}.sources.json.gz`)));
  assert.deepEqual(archive.manifest, build);
  for (const group of ['engine', 'app', 'dependencies', 'harness']) for (const [file, hash] of Object.entries(build.groups[group])) assert.equal(sha(Buffer.from(archive.files[file], 'base64')), hash);
}
const bundle = JSON.parse(gunzipSync(readFileSync(`${directory}/builds.json.gz`)));
assert.deepEqual(bundle.builds.map(b => b.manifest), env.builds);
for (const build of bundle.builds) for (const [file, hash] of Object.entries(build.manifest.artifacts)) assert.equal(sha(Buffer.from(build.files[file], 'base64')), hash);
const byTag = new Map(env.builds.map(build => [build.tag, build]));
const groups = new Map(), countRows = [], lifecycles = [], summaries = [];
let rawRows = 0, measuredWorkloads = 0, measuredActions = 0, warmups = 0, initializations = 0;
let browserVersion = null;
function collect(key, value) { assert(Number.isFinite(value) && value >= 0, `Invalid timing ${key}`); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(value); }
const close = (a, b, message) => assert(Math.abs(a - b) < .00001, message);
for (let session = 1; session <= env.sessions; session++) {
  const rows = gunzipSync(readFileSync(`${directory}/session-${session}.jsonl.gz`)).toString().trim().split('\n').map(JSON.parse);
  const processes = JSON.parse(readFileSync(`${directory}/session-${session}.json`)).processes;
  for (const process of processes) {
    assert.equal(typeof process.browser, 'string'); assert(process.browser.length > 0);
    browserVersion ??= process.browser; assert.equal(process.browser, browserVersion, 'Browser version changed between conditions/sessions');
    assert(Number.isInteger(process.pid) && process.pid > 0);
    assert(Date.parse(process.endedAt) >= Date.parse(process.startedAt), 'Invalid process lifecycle timestamps');
  }
  const expected = new Set(), models = new Map(), accumulated = new Map();
  for (const size of env.sizes) for (const regime of env.regimes) for (const workload of env.workloads.filter(w => regime === 'persistent' || w === 'equal')) for (const build of env.builds) {
    const key = [regime, workload, size, build.tag].join(',');
    expected.add(`${key},counts,0`); if (regime === 'persistent') expected.add(`${key},initialization,null`);
    const policy = env.repetitions[regime], warmup = regime === 'persistent' && size === 10000 ? policy.stressWarmup : policy.warmup;
    for (let index = -warmup; index < policy.samples; index++) expected.add(`${key},${index < 0 ? 'warmup' : 'sample'},${index}`);
    const process = processes.filter(p => p.regime === regime && p.workload === workload && p.size === size && p.build === build.tag);
    assert.equal(process.length, 1); assert.equal(process[0].status, 'passed'); assert.equal(process[0].disposed, true);
  }
  for (const row of rows) {
    rawRows++; assert.equal(row.session, session); assert(byTag.has(row.build));
    if (row.initialization) {
      const init = row.initialization;
      for (const value of [init.cpuMs, init.elapsedMs, ...init.flushes.flatMap(flush => Object.values(flush))]) assert(Number.isFinite(value) && value >= 0, 'Invalid initialization time');
      close(init.cpuMs, init.flushes.reduce((sum, flush) => sum + flush.flushMs + flush.effectMs, 0), 'Initialization CPU');
      assert(init.elapsedMs + 1 >= init.cpuMs);
    }
    const key = [row.regime, row.workload, row.size, row.build].join(',');
    assert(expected.delete(`${key},${row.sampleKind},${row.index}`), 'Unexpected/duplicate row');
    if (row.sampleKind === 'initialization') {
      initializations++; models.set(key, initialTaskModel(row.size, env.seed)); accumulated.set(key, { cpu: row.initialization.cpuMs, updates: 0, initialCpuMs: row.initialization.cpuMs });
      assert.equal(row.initialization.validation.stateRows, row.size); continue;
    }
    const counting = row.sampleKind === 'counts';
    if (counting) countRows.push(row);
    if (row.sampleKind === 'warmup') warmups++;
    const model = row.regime === 'fresh' || counting ? initialTaskModel(row.size, env.seed) : models.get(key); assert(model);
    const actions = taskActions(row.workload, row.index, model);
    assert.deepEqual(row.result.actions.map(r => r.action), actions);
    assert.equal(row.result.visibility, 'visible'); assert.equal(row.result.focused, true);
    let total = 0;
    for (const [actionIndex, result] of row.result.actions.entries()) {
      const changedItems = applyTaskAction(model, actions[actionIndex]);
      assert.equal(result.validation.stateRows, model.items.length); assert.equal(result.validation.syncedTotal, model.items.length);
      assert.equal(result.validation.checkedRows, visibleTasks(model).length); assert.equal(result.validation.nextId, model.nextId); assert.equal(result.validation.counter, model.counter);
      assert(result.validation.retainedIdentities <= result.validation.checkedRows);
      if (counting) {
        assert.equal(result.timings, null); assert.equal(result.followups, null); assert(result.counts);
        assert.equal(result.counts.primary.rootExecutions, actions[actionIndex].kind === 'dirty' ? 0 : 1);
        if (actions[actionIndex].kind === 'counter') assert.equal(result.counts.primary.commits, 1);
        continue;
      }
      assert.equal(result.counts, null); assert.equal(result.followups.length, changedItems ? 1 : 0);
      const timing = result.timings;
      close(timing.totalCpuMs, timing.primaryMs + timing.followupCpuMs, 'Disjoint total');
      close(timing.followupCpuMs, result.followups.reduce((sum, r) => sum + r.flushMs + r.effectMs, 0), 'Follow-up total');
      close(timing.vdomMs, Math.max(0, timing.renderMs - timing.expressionMs), 'Derived VDOM interval');
      assert(timing.settledMs + 1 >= timing.totalCpuMs && timing.primaryMs + 1 >= timing.flushMs);
      total += timing.totalCpuMs;
      if (row.sampleKind === 'sample') {
        measuredActions++;
        for (const [metric, value] of Object.entries(timing)) collect([session, key, `action-${actionIndex}-${result.action.kind}`, metric].join(','), value);
      }
    }
    if (counting) { assert.equal(row.disposed, true); continue; }
    close(total, row.result.totalCpuMs, 'Workload action sum');
    const cumulative = row.regime === 'fresh' ? { cpu: row.initialization.cpuMs, updates: 0 } : accumulated.get(key); assert(cumulative);
    cumulative.cpu += total; cumulative.updates++; close(row.lifecycleCpuMs, cumulative.cpu, 'Lifecycle CPU');
    close(row.amortizedCpuMs, cumulative.cpu / cumulative.updates, 'Amortization'); assert.equal(row.updateCount, cumulative.updates);
    if (row.regime === 'persistent') lifecycles.push({ session, key, index: row.index, sampleKind: row.sampleKind, ...cumulative, amortizedCpuMs: row.amortizedCpuMs });
    if (row.sampleKind === 'sample') {
      measuredWorkloads++; collect([session, key, 'workload', 'totalCpuMs'].join(','), total);
      if (row.regime === 'fresh') {
        collect([session, key, 'lifecycle', 'totalCpuMs'].join(','), row.lifecycleCpuMs);
        collect([session, key, 'initialization', 'cpuMs'].join(','), row.initialization.cpuMs);
        collect([session, key, 'initialization', 'elapsedMs'].join(','), row.initialization.elapsedMs);
      }
    }
  }
  assert.equal(expected.size, 0, 'Missing rows');
}
// At the same app and input, engine-only changes must preserve work semantics.
const referenceCounts = new Map();
for (const row of countRows) {
  const key = [byTag.get(row.build).appHash, row.regime, row.workload, row.size].join(',');
  const counts = row.result.actions.map(action => action.counts);
  if (referenceCounts.has(key)) assert.deepEqual(counts, referenceCounts.get(key), `Counts changed by engine/session: ${key}`);
  else referenceCounts.set(key, counts);
}
for (const [key, values] of groups) summaries.push({ key, ...distribution(values) });
writeFileSync(`${directory}/summary.json`, JSON.stringify(summaries, null, 2));
writeFileSync(`${directory}/counts.json`, JSON.stringify(countRows, null, 2));
writeFileSync(`${directory}/lifecycles.json`, JSON.stringify({ note: 'Persistent lifecycle includes initialization and warm-up costs. Trajectory points are NOT independent steady-state samples.', rows: lifecycles }, null, 2));
writeFileSync(`${directory}/summary.csv`, 'session,regime,workload,size,build,scope,metric,n,median,q1,q3,iqr,p95,min,max\n' + summaries.map(r => [r.key, r.n, r.median, r.q1, r.q3, r.iqr, r.p95, r.min, r.max].join(',')).join('\n'));
const table = ['# TaskApp — 세션별 전체 작업 결과', '', '단위 ms. steady-state workload 합계와 fresh 초기화 포함 lifecycle을 구분한다. 상세 action/render/diff/commit/Effect는 summary.csv/JSON에 있다.', '', '| session/regime/workload/size/build/scope | n | median | IQR | p95 |', '|---|---:|---:|---:|---:|'];
for (const row of summaries.filter(r => /,(workload|lifecycle),totalCpuMs$/.test(r.key))) table.push(`| ${row.key.replace(',totalCpuMs', '')} | ${row.n} | ${row.median.toFixed(3)} | ${row.iqr.toFixed(3)} | ${row.p95.toFixed(3)} |`);
writeFileSync(`${directory}/all-results.md`, table.join('\n') + '\n');
const audit = { status: 'passed', auditedAt: new Date().toISOString(), sessions: env.sessions, smoke: env.smoke, rawRows,
  scriptSha256: sha(readFileSync('scripts/analyze-task.mjs')), modelSha256: sha(readFileSync('src/bench/task-model.ts')),
  counts: countRows.length, initializations, warmups, measuredWorkloads, measuredActions, distributions: summaries.length,
  sourceAndBuildHashes: 'passed', fixedPlanAndRunnerHashes: true, browserVersion, sameBrowserAcrossConditionsAndSessions: true,
  noMissingOrDuplicateRows: true, sameAppCountsEqualAcrossEnginesAndSessions: true,
  actualModelStateAndVisibleCounts: 'passed', disjointAndLifecycleSums: 'passed', hidden: 0, unfocused: 0 };
writeFileSync(`${directory}/analysis.json`, JSON.stringify(audit, null, 2)); console.log(JSON.stringify(audit));
