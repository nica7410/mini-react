import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { distribution } from '../src/bench/statistics.ts';

const directory = process.argv[2];
if (!directory) throw new Error('Usage: node scripts/analyze-noop.mjs docs/bench/tag');
const env = JSON.parse(readFileSync(`${directory}/environment.json`));
assert.equal(env.status, 'passed');
const all = [], groups = new Map(), countRows = [], profiles = new Map();
for (let session = 1; session <= env.sessions; session++) {
  const rows = gunzipSync(readFileSync(`${directory}/session-${session}.jsonl.gz`)).toString().trim().split('\n').map(JSON.parse);
  const expected = new Set();
  for (const size of env.sizes) for (const payload of env.payloads) for (const path of env.paths) for (const build of env.builds) {
    const policy = size === 10000 ? env.repetitions.stress : env.repetitions.normal;
    for (let index = -policy.warmup - 1; index < policy.samples; index++) expected.add([path, size, payload, build.tag, index].join(','));
  }
  for (const row of rows) {
    const key = [row.input.path, row.input.size, row.input.payload, row.build, row.index].join(',');
    assert(expected.delete(key), `Unexpected/duplicate sample ${session}:${key}`);
    assert.equal(row.session, session); assert.equal(row.input.seed, env.seed);
    const policy = row.input.size === 10000 ? env.repetitions.stress : env.repetitions.normal;
    assert.equal(row.sampleKind, row.index === -policy.warmup - 1 ? 'counts' : row.index < 0 ? 'warmup' : 'sample');
    assert.equal(row.input.mode, env.profiled ? 'profile' : row.sampleKind === 'counts' ? 'counts' : 'timing');
    assert.equal(row.validation.checkedRows, row.input.size); assert.equal(row.validation.retainedIdentities, row.input.size);
    const runtime = ['memo-unrelated', 'form-update', 'dirty-controlled'].includes(row.input.path);
    assert.equal(row.validation.effectSetups, runtime && row.input.path !== 'dirty-controlled' ? 1 : 0);
    assert.equal(row.validation.effectCleanups, row.validation.effectSetups);
    if (runtime) assert.equal(row.validation.controlled, row.input.path === 'form-update' ? '1' : 'fixed');
    if (row.sampleKind === 'counts') countRows.push(row);
    if (!env.profiled) {
      assert.equal(row.profile, null);
      if (row.sampleKind === 'counts') {
        assert.equal(row.timings, null);
        assert.equal(row.counts.commits, 1); assert.equal(row.counts.createdNodes, 0); assert.equal(row.counts.removedNodes, 0);
        assert.equal(row.counts.movedRoots, row.input.path === 'reorder' ? 1 : 0);
        assert.equal(row.counts.propertyWrites, ['form-update', 'dirty-controlled'].includes(row.input.path) ? 1 : 0);
        assert.equal(row.counts.textWrites, ['form-update', 'memo-unrelated'].includes(row.input.path) ? 1 : 0);
        assert.equal(row.counts.childExecutions, 0);
      } else assert.equal(row.counts, null);
    }
    if (row.sampleKind === 'sample') {
      for (const [metric, value] of Object.entries(row.timings)) {
        const groupKey = [session, row.input.path, row.input.size, row.input.payload, row.build, metric].join(',');
        if (!groups.has(groupKey)) groups.set(groupKey, { values: [], hidden: 0, unfocused: 0 });
        const group = groups.get(groupKey); group.values.push(value);
        if (row.visibility !== 'visible') group.hidden++;
        if (!row.focused) group.unfocused++;
      }
      if (env.profiled) for (const [stage, spans] of Object.entries(row.profile)) for (const [name, span] of Object.entries(spans)) for (const metric of ['inclusiveMs', 'selfMs', 'calls']) {
        const groupKey = [session, row.input.path, row.input.size, row.input.payload, row.build, stage, name, metric].join(',');
        if (!profiles.has(groupKey)) profiles.set(groupKey, []);
        profiles.get(groupKey).push(span[metric]);
      }
    }
  }
  assert.equal(expected.size, 0, `Missing samples session ${session}`); all.push(...rows);
}
const computed = [...groups].map(([key, group]) => ({ key, ...distribution(group.values), hidden: group.hidden, unfocused: group.unfocused }));
const stored = JSON.parse(readFileSync(`${directory}/summary.json`));
assert.equal(stored.length, computed.length);
for (const row of computed) {
  const other = stored.find(item => item.key === row.key); assert(other);
  for (const key of Object.keys(row)) if (key !== 'key') assert(Math.abs(other[key] - row[key]) < 1e-8, `${row.key}/${key}`);
}
assert.deepEqual(JSON.parse(readFileSync(`${directory}/counts.json`)), countRows);
const comparisons = [];
if (env.builds.length === 2) for (let session = 1; session <= env.sessions; session++) for (const size of env.sizes) for (const payload of env.payloads) for (const path of env.paths) {
  const lookup = build => computed.find(row => row.key === [session, path, size, payload, build.tag, 'scheduledCycleMs'].join(','));
  const baseline = lookup(env.builds[0]), candidate = lookup(env.builds[1]); assert(baseline && candidate);
  comparisons.push({ session, size, payload, path, baseline, candidate,
    medianReductionPercent: baseline.median ? 100 * (1 - candidate.median / baseline.median) : null,
    p95ReductionPercent: baseline.p95 ? 100 * (1 - candidate.p95 / baseline.p95) : null });
}
const audit = { auditedAt: new Date().toISOString(), status: 'passed', profiled: env.profiled, sessions: env.sessions,
  rawRows: all.length, counts: countRows.length, warmups: all.filter(row => row.sampleKind === 'warmup').length,
  samples: all.filter(row => row.sampleKind === 'sample').length, distributions: computed.length,
  hidden: all.filter(row => row.visibility !== 'visible').length, unfocused: all.filter(row => !row.focused).length,
  buildCommits: env.builds.map(b => ({ tag: b.tag, commit: b.commit, engineHash: b.engineHash, harnessHash: b.harnessHash })),
  comparisons,
};
writeFileSync(`${directory}/analysis.json`, JSON.stringify(audit, null, 2));
if (env.profiled) writeFileSync(`${directory}/profile-summary.json`, JSON.stringify([...profiles].map(([key, values]) => ({ key, ...distribution(values) })), null, 2));
const fmt = n => n.toFixed(2);
const lines = ['# no-op 동일 조건 비교', '', `각 세션 별 분포. core는 diff+commit, runtime은 enqueue→다음 microtask. ${env.profiled ? '계측용 빌드: 속도 개선 수치에 사용 금지.' : '프로파일러/상세 Trace 없는 production timing.'}`, '',
  '| 세션 | 경로 | payload | 크기 | n | baseline median | candidate median | median 감소 % | baseline IQR | candidate IQR | baseline p95 | candidate p95 |',
  '|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|'];
for (const row of comparisons) lines.push(`| ${row.session} | ${row.path} | ${row.payload} | ${row.size} | ${row.baseline.n} | ${fmt(row.baseline.median)} | ${fmt(row.candidate.median)} | ${row.medianReductionPercent === null ? '해상도 아래' : fmt(row.medianReductionPercent)} | ${fmt(row.baseline.iqr)} | ${fmt(row.candidate.iqr)} | ${fmt(row.baseline.p95)} | ${fmt(row.candidate.p95)} |`);
writeFileSync(`${directory}/all-results.md`, lines.join('\n') + '\n');
console.log(JSON.stringify({ ...audit, comparisons: comparisons.length }));
