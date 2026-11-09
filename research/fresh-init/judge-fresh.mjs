// Per-session fresh judgement for one benchmark-task.mjs run (same rules as engine-supp judge.mjs, with explicit pair).
// Usage: node research/fresh-init/judge-fresh.mjs <runDir> <baselineTag> <candidateTag> [out.json]
// Engine allowance: median max(5%, 1 ms), p95 max(10%, 2 ms); exceeded only when unrounded delta > allowance.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { distribution } from '../../src/bench/statistics.ts';

const [dir, BASE, CAND, outFile] = process.argv.slice(2);
assert(dir && BASE && CAND, 'usage: <runDir> <baseline> <candidate> [out.json]');
const env = JSON.parse(readFileSync(`${dir}/environment.json`, 'utf8'));
const raw = f => gunzipSync(readFileSync(f)).toString().trim().split('\n').filter(Boolean).map(JSON.parse);
const out = { dir, envStatus: env.status, pair: { baseline: BASE, candidate: CAND }, sessions: [], rows: [], exceeded: [], oracle: { sampleFailures: [], countsEqual: {} } };
for (let s = 1; s <= env.sessions; s++) {
  const mf = `${dir}/session-${s}.json`; if (!existsSync(mf)) continue;
  const meta = JSON.parse(readFileSync(mf, 'utf8'));
  out.sessions.push({ session: s, order: meta.processes.map(p => `${p.orderPosition}:${p.build}:${p.status}`) });
  const ok = new Set(meta.processes.filter(p => p.status === 'passed' && p.disposed).map(p => p.build));
  const values = new Map(), add = (k, v) => { if (!values.has(k)) values.set(k, []); values.get(k).push(v); };
  const counts = {};
  for (const row of raw(`${dir}/session-${s}.jsonl.gz`)) {
    if (!ok.has(row.build)) continue;
    if (row.sampleKind === 'counts') { counts[row.build] = JSON.stringify(row.result.actions.map(a => [a.counts, a.validation])); continue; }
    if (row.sampleKind !== 'sample') continue;
    if (row.result.visibility !== 'visible' || row.result.focused !== true) out.oracle.sampleFailures.push(`S${s} ${row.build}#${row.index} not visible/focused`);
    for (const a of row.result.actions) if (!a.validation || a.validation.checkedRows !== row.size || a.validation.stateRows !== row.size) out.oracle.sampleFailures.push(`S${s} ${row.build}#${row.index} validation`);
    const total = row.result.actions.reduce((x, a) => x + a.timings.totalCpuMs, 0); assert.equal(total, row.result.totalCpuMs);
    add(`${row.build}|workload|totalCpuMs`, total);
    add(`${row.build}|initialization|cpuMs`, row.initialization.cpuMs);
    add(`${row.build}|lifecycle|totalCpuMs`, row.lifecycleCpuMs);
  }
  out.oracle.countsEqual[s] = counts[BASE] !== undefined && counts[BASE] === counts[CAND];
  for (const scope of ['workload', 'initialization', 'lifecycle']) {
    const metric = scope === 'initialization' ? 'cpuMs' : 'totalCpuMs';
    const b = values.get(`${BASE}|${scope}|${metric}`), c = values.get(`${CAND}|${scope}|${metric}`);
    if (!b || !c) continue;
    const base = distribution(b), cand = distribution(c);
    const row = { session: s, scope, metric, n: [base.n, cand.n], base, cand,
      dMedian: cand.median - base.median, dP95: cand.p95 - base.p95,
      allowMedian: Math.max(base.median * .05, 1), allowP95: Math.max(base.p95 * .10, 2) };
    row.medianExceeded = row.dMedian > row.allowMedian; row.p95Exceeded = row.dP95 > row.allowP95;
    out.rows.push(row); if (row.medianExceeded || row.p95Exceeded) out.exceeded.push(row);
  }
}
const f = v => v.toFixed(3);
for (const r of out.rows) console.log(`S${r.session} ${r.scope} n=${r.n.join('/')} ${f(r.base.median)}/${f(r.base.iqr)}/${f(r.base.p95)} -> ${f(r.cand.median)}/${f(r.cand.iqr)}/${f(r.cand.p95)} | med ${f(r.dMedian)} / ${f(r.allowMedian)}${r.medianExceeded ? ' EXCEEDED' : ''} | p95 ${f(r.dP95)} / ${f(r.allowP95)}${r.p95Exceeded ? ' EXCEEDED' : ''}`);
console.log('order', out.sessions.map(s => `S${s.session} ${s.order.join(' > ')}`).join(' | '));
console.log('oracle failures', out.oracle.sampleFailures.length, 'countsEqual', JSON.stringify(out.oracle.countsEqual));
if (outFile) writeFileSync(outFile, JSON.stringify(out, null, 2));
