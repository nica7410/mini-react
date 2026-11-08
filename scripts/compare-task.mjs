import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const directory = process.argv[2];
assert(directory, 'Usage: node scripts/compare-task.mjs docs/bench/tag');
const read = name => JSON.parse(readFileSync(`${directory}/${name}.json`));
const env = read('environment'), audit = read('analysis'), summary = read('summary');
assert.equal(env.status, 'passed'); assert.equal(audit.status, 'passed');
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const knownEngines = { '7757e3c': 'E0', '8b302de': 'E1', 'c4a2fe1': 'E2' };
const knownApps = { '4d5a66f': 'A0', '5ed7f34': 'A1' };
const builds = env.builds.map(build => ({ ...build,
  engine: knownEngines[build.engineCommit.slice(0, 7)] ?? build.tag.match(/-(e\d+[a-z]*)-/)?.[1].toUpperCase() ?? build.engineCommit.slice(0, 7),
  app: knownApps[build.appCommit.slice(0, 7)] ?? build.appCommit.slice(0, 7),
}));
const byTag = new Map(builds.map(build => [build.tag, build]));
const indexed = new Map(summary.map(row => [row.key, row]));
const pairs = [];
for (const before of builds) for (const after of builds) {
  assert.equal(before.harnessHash, after.harnessHash); assert.equal(before.dependencyHash, after.dependencyHash);
  if (before.appHash !== after.appHash && before.engineHash === after.engineHash && before.app === 'A0' && after.app === 'A1') {
    pairs.push({ kind: 'app', label: `${before.engine}: A0 -> A1`, before, after });
  }
  if (before.appHash === after.appHash && before.engineHash !== after.engineHash && before.engine < after.engine) {
    pairs.push({ kind: 'engine', label: `${before.app}: ${before.engine} -> ${after.engine}`, before, after });
  }
}
const contrasts = [], decisions = new Map();
for (const pair of pairs) for (const baseline of summary) {
  const [session, regime, workload, size, tag, scope, metric] = baseline.key.split(',');
  if (tag !== pair.before.tag) continue;
  const candidate = indexed.get([session, regime, workload, size, pair.after.tag, scope, metric].join(','));
  assert(candidate, `Missing comparison: ${baseline.key}`); assert.equal(baseline.n, candidate.n);
  const delta = {};
  for (const field of ['median', 'p95']) delta[field] = { ms: candidate[field] - baseline[field], percent: baseline[field] ? 100 * (candidate[field] / baseline[field] - 1) : null };
  const row = { comparison: pair.label, kind: pair.kind, before: pair.before.tag, after: pair.after.tag,
    session: Number(session), regime, workload, size: Number(size), scope, metric, baseline, candidate, delta };
  // Apply the already committed gates only to complete, non-overlapping CPU totals.
  // Nested phase metrics remain descriptive and are never added together here.
  if ((metric === 'totalCpuMs' && (scope === 'workload' || scope === 'lifecycle' || scope.startsWith('action-'))) || (scope === 'initialization' && metric === 'cpuMs')) {
    const appReuseTarget = pair.kind === 'app' && regime === 'persistent' && ['draft', 'counter', 'equal'].includes(workload) && Number(size) >= 1000;
    const enginePolicy = pair.kind === 'engine' && pair.before.engine === 'E1' && pair.before.app === 'A1';
    const appGate = pair.kind === 'app' && !appReuseTarget;
    if (enginePolicy || appGate || appReuseTarget) {
      const absolute = pair.kind === 'app' ? { median: .5, p95: 1 } : { median: 1, p95: 2 };
      row.gate = {
        medianAllowanceMs: Math.max(baseline.median * .05, absolute.median),
        p95AllowanceMs: Math.max(baseline.p95 * .10, absolute.p95),
        medianExceeded: delta.median.ms > Math.max(baseline.median * .05, absolute.median),
        p95Exceeded: delta.p95.ms > Math.max(baseline.p95 * .10, absolute.p95),
        reuseTarget: appReuseTarget || (enginePolicy && regime === 'persistent' && ['draft', 'counter', 'equal'].includes(workload) && Number(size) >= 1000),
        medianGainAtLeast10Percent: baseline.median > 0 && candidate.median <= baseline.median * .9,
      };
      if (scope === 'workload' || scope === 'lifecycle' || scope === 'initialization' || (workload === 'crud' && scope.startsWith('action-'))) {
        const key = [pair.label, regime, workload, size, scope].join(',');
        if (!decisions.has(key)) decisions.set(key, { key, comparison: pair.label, kind: pair.kind, regime, workload, size: Number(size), scope,
          before: pair.before.tag, after: pair.after.tag, sessions: [], reuseTarget: row.gate.reuseTarget });
        decisions.get(key).sessions.push({ session: row.session, n: baseline.n, baseline, candidate, delta, ...row.gate });
      }
    }
  }
  contrasts.push(row);
}
const decisionsArray = [...decisions.values()].map(row => {
  assert.equal(row.sessions.length, env.sessions);
  const exceeded = row.sessions.filter(s => s.medianExceeded || s.p95Exceeded);
  const tail = row.sessions.filter(s => s.p95Exceeded);
  return { ...row, gainsOf10Percent: row.sessions.filter(s => s.medianGainAtLeast10Percent).length,
    medianGateExceedances: row.sessions.filter(s => s.medianExceeded).length, p95GateExceedances: tail.length,
    needsFinalPolicyTailSupplement: !env.smoke && !env.supplement && exceeded.length > 0,
    conclusion: env.smoke ? 'smoke only' : env.sessions < 3 ? 'insufficient independent sessions' : exceeded.length ? 'gate exceeded; investigate, supplement or restrict policy' : row.reuseTarget && row.sessions.filter(s => s.medianGainAtLeast10Percent).length < 2 ? 'reuse target not demonstrated' : 'within preregistered gates in this run',
  };
});
const lifeRows = read('lifecycles').rows;
const lifeIndex = new Map(lifeRows.map(row => [[row.session, row.key, row.index].join(','), row]));
const amortization = [];
for (const pair of pairs) for (const before of lifeRows) {
  const [regime, workload, size, tag] = before.key.split(','); if (tag !== pair.before.tag) continue;
  const after = lifeIndex.get([before.session, regime, workload, size, pair.after.tag, before.index].join(',')); assert(after);
  assert.equal(before.updates, after.updates);
  amortization.push({ comparison: pair.label, session: before.session, regime, workload, size: Number(size), index: before.index, sampleKind: before.sampleKind, updatesIncludingWarmup: before.updates,
    beforeCpuMs: before.cpu, afterCpuMs: after.cpu, beforePerUpdateMs: before.amortizedCpuMs, afterPerUpdateMs: after.amortizedCpuMs,
    beforeInitialCpuMs: before.initialCpuMs, afterInitialCpuMs: after.initialCpuMs,
    cumulativeDifferenceMs: after.cpu - before.cpu });
}
const trajectories = new Map();
for (const point of amortization) {
  const key = [point.comparison, point.session, point.regime, point.workload, point.size].join(',');
  if (!trajectories.has(key)) trajectories.set(key, []); trajectories.get(key).push(point);
}
const recovery = [...trajectories].map(([key, points]) => {
  points.sort((a, b) => a.updatesIncludingWarmup - b.updatesIncludingWarmup);
  const lastPositive = points.findLastIndex(point => point.cumulativeDifferenceMs > 0);
  const stable = points[lastPositive + 1];
  return { key, comparison: points[0].comparison, session: points[0].session, workload: points[0].workload, size: points[0].size,
    initialDifferenceMs: points[0].afterInitialCpuMs - points[0].beforeInitialCpuMs,
    firstObservedNonpositiveAt: points.find(point => point.cumulativeDifferenceMs <= 0)?.updatesIncludingWarmup ?? null,
    nonpositiveThroughObservedEndFrom: stable?.updatesIncludingWarmup ?? null,
    observedUpdates: points.at(-1).updatesIncludingWarmup, finalDifferenceMs: points.at(-1).cumulativeDifferenceMs,
    note: 'A pair of observed lifecycle trajectories, including warm-up. Updates count workload cycles: CRUD has five user actions, other workloads one. They are not root-render or flush counts. The crossing can be affected by JIT/GC/noise and is not a universal reuse threshold or an IID statistic.' };
});
writeFileSync(`${directory}/contrasts.json.gz`, gzipSync(JSON.stringify(contrasts)));
writeFileSync(`${directory}/decisions.json`, JSON.stringify(decisionsArray, null, 2));
writeFileSync(`${directory}/amortization.json.gz`, gzipSync(JSON.stringify(amortization)));
writeFileSync(`${directory}/recovery.json`, JSON.stringify(recovery, null, 2));
const selected = contrasts.filter(row => (row.metric === 'totalCpuMs' && ['workload', 'lifecycle'].includes(row.scope)) || (row.scope === 'initialization' && row.metric === 'cpuMs'));
writeFileSync(`${directory}/contrasts.csv`, 'comparison,session,regime,workload,size,scope,n,before_median,before_IQR,before_p95,after_median,after_IQR,after_p95,median_delta_ms,median_delta_percent,p95_delta_ms,p95_delta_percent\n' + selected.map(r => [r.comparison, r.session, r.regime, r.workload, r.size, r.scope, r.baseline.n, r.baseline.median, r.baseline.iqr, r.baseline.p95, r.candidate.median, r.candidate.iqr, r.candidate.p95, r.delta.median.ms, r.delta.median.percent, r.delta.p95.ms, r.delta.p95.percent].join(',') + '\n').join(''));
const report = ['# TaskApp 고정 앱·고정 엔진 비교', '', '단위 ms, 각 행은 동일 세션·앱 또는 엔진·하네스의 쌍이다. +는 악화, −는 개선이다. 표본 제거·세션 합산 없음. 사전 gate 초과는 원인 조사·보충 또는 적용 범위 제한이 필요한 조건이며 자동 채택 판단이 아니다.', '', '`totalCpuMs`는 primary와 겹치지 않는 후속 flush/Effect의 경과 시간을 표본별로 합산한 값이다. primary는 dispatch closure 진입부터이며 counter/move/delete/add의 대상 검색과 dirty의 setter 조회도 포함한다. 순수 엔진 CPU, 실제 이벤트 전달 시각부터의 지연, Paint 완료 시간이 아니다. 명시적인 40ms Effect 대기는 제외하며 render/diff/commit 등 중첩 구간을 다시 더하지 않는다.', '', '| 비교 | S | 조건 | n | 이전 median / IQR / p95 | 이후 median / IQR / p95 | median 변화 | p95 변화 |', '|---|---:|---|---:|---:|---:|---:|---:|'];
const f = value => value.toFixed(3), pc = value => value === null ? 'n/a' : `${value.toFixed(1)}%`;
for (const r of selected) report.push(`| ${r.comparison} | ${r.session} | ${r.regime}/${r.workload}/${r.size}/${r.scope} | ${r.baseline.n} | ${f(r.baseline.median)} / ${f(r.baseline.iqr)} / ${f(r.baseline.p95)} | ${f(r.candidate.median)} / ${f(r.candidate.iqr)} / ${f(r.candidate.p95)} | ${pc(r.delta.median.percent)} | ${pc(r.delta.p95.percent)} |`);
writeFileSync(`${directory}/comparisons.md`, report.join('\n') + '\n');
const metadata = { status: 'passed', createdAt: new Date().toISOString(), scriptSha256: sha('scripts/compare-task.mjs'),
  environmentSha256: sha(`${directory}/environment.json`), summarySha256: sha(`${directory}/summary.json`),
  pairs: pairs.map(({ kind, label, before, after }) => ({ kind, label, before: before.tag, after: after.tag })),
  contrasts: contrasts.length, decisionConditions: decisionsArray.length, amortizationPoints: amortization.length,
  note: 'Lifecycle trajectories include initialization and warm-up; these correlated points are not an IID sample distribution. Gate failures and low-n tails are retained; final policy needs interpretation and prescribed supplementary sessions.' };
writeFileSync(`${directory}/comparison-audit.json`, JSON.stringify(metadata, null, 2));
console.log(JSON.stringify({ ...metadata, pairs: metadata.pairs.length }));
