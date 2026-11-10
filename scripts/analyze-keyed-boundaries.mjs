// Two-build TaskApp comparison for the keyed boundary-run study (B0 -> C1, or A/A).
// Reads a benchmark-task.mjs run and reports, per session and workload, the unrounded
// median/p95 of the step totals and of the nested diff time, the regression warnings of the
// engine comparison, and whether the counts realm is identical between the two builds.
// Usage: node scripts/analyze-keyed-boundaries.mjs docs/bench/<tag> <baselineTag> <candidateTag>
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const [directory, baseline, candidate] = process.argv.slice(2);
assert(directory && baseline && candidate, 'Usage: node scripts/analyze-keyed-boundaries.mjs docs/bench/<tag> <baselineTag> <candidateTag>');
const environment = JSON.parse(readFileSync(`${directory}/environment.json`));
assert.equal(environment.status, 'passed');
const quantile = (sorted, p) => { const index = (sorted.length - 1) * p, low = Math.floor(index); return sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low); };
const stats = values => { const sorted = [...values].sort((a, b) => a - b); return { n: sorted.length, median: quantile(sorted, 0.5), p95: quantile(sorted, 0.95), min: sorted[0], max: sorted.at(-1) }; };
// Nested phases are never added to the totals: diffMs is reported as its own distribution.
const metrics = {
  totalCpuMs: row => row.result.totalCpuMs,
  primaryMs: row => row.result.actions.reduce((sum, action) => sum + action.timings.primaryMs, 0),
  diffMs: row => row.result.actions.reduce((sum, action) => sum + action.timings.diffMs, 0),
};
const rows = [], countRows = new Map();
for (let session = 1; session <= environment.sessions; session++) {
  for (const line of gunzipSync(readFileSync(`${directory}/session-${session}.jsonl.gz`)).toString().split('\n').filter(Boolean)) {
    const row = JSON.parse(line);
    if (row.sampleKind === 'sample') rows.push(row);
    if (row.sampleKind === 'counts') countRows.set([row.session, row.workload, row.size, row.build].join('/'), row.result.actions.map(action => action.counts));
  }
}
const conditions = [...new Set(rows.map(row => `${row.workload}/${row.size}`))], report = [], counts = [];
for (const condition of conditions) for (let session = 1; session <= environment.sessions; session++) {
  const pick = build => rows.filter(row => row.session === session && `${row.workload}/${row.size}` === condition && row.build === build);
  const before = pick(baseline), after = pick(candidate);
  assert(before.length && before.length === after.length, `Missing samples: ${condition} S${session}`);
  for (const [metric, read] of Object.entries(metrics)) {
    const b = stats(before.map(read)), c = stats(after.map(read));
    const delta = { medianMs: c.median - b.median, medianPercent: b.median ? 100 * (c.median / b.median - 1) : null, p95Ms: c.p95 - b.p95, p95Percent: b.p95 ? 100 * (c.p95 / b.p95 - 1) : null };
    // Engine comparison warnings (historic gates, used as warnings only), on unrounded differences.
    const warning = metric === 'totalCpuMs' ? { median: delta.medianMs > Math.max(b.median * 0.05, 1), p95: delta.p95Ms > Math.max(b.p95 * 0.10, 2) } : null;
    report.push({ condition, session, metric, baseline: b, candidate: c, delta, warning });
  }
  const key = build => [session, ...condition.split('/'), build].join('/');
  counts.push({ condition, session, identical: JSON.stringify(countRows.get(key(baseline))) === JSON.stringify(countRows.get(key(candidate))),
    primary: countRows.get(key(candidate))?.map(action => ({ visitedNodes: action.primary.visitedNodes, reusedSubtrees: action.primary.reusedSubtrees, createdNodes: action.primary.createdNodes,
      removedNodes: action.primary.removedNodes, insertedRoots: action.primary.insertedRoots, movedRoots: action.primary.movedRoots, skippedHostCalls: action.primary.skippedHostCalls, taskRowExecutions: action.primary.taskRowExecutions })) });
}
const result = { directory, baseline, candidate, builds: environment.builds.map(build => ({ tag: build.tag, engineCommit: build.engineCommit, appCommit: build.appCommit, engineHash: build.engineHash, appHash: build.appHash })),
  timerNote: 'Chromium performance.now() is coarsened to 0.1 ms; totals are wall-clock sums, not CPU usage or paint time.', report, counts };
writeFileSync(`${directory}/comparison.json`, JSON.stringify(result, null, 2));
const f = value => value.toFixed(3);
for (const row of report) if (row.metric !== 'primaryMs') console.log(`${row.condition.padEnd(12)} S${row.session} ${row.metric.padEnd(10)} median ${f(row.baseline.median)} -> ${f(row.candidate.median)} (${row.delta.medianMs >= 0 ? '+' : ''}${f(row.delta.medianMs)} ms)  p95 ${f(row.baseline.p95)} -> ${f(row.candidate.p95)} (${row.delta.p95Ms >= 0 ? '+' : ''}${f(row.delta.p95Ms)} ms)${row.warning && (row.warning.median || row.warning.p95) ? `  WARNING ${JSON.stringify(row.warning)}` : ''}`);
console.log(`counts identical between builds: ${counts.every(row => row.identical)}`);
