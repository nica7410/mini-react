// Usage: node judge.mjs <bench-dir>  (explicit pair: baseline task-e7-a0-v1, candidate dr-cand-e9-a0)
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { distribution } from 'file:///C:/Github/mini-react/src/bench/statistics.ts';
const dir = process.argv[2], BASE = 'task-e7-a0-v1', CAND = 'dr-cand-e9-a0';
const env = JSON.parse(readFileSync(`${dir}/environment.json`, 'utf8'));
const raw = f => gunzipSync(readFileSync(f)).toString().trim().split('\n').filter(Boolean).map(JSON.parse);
const out = { dir, envStatus: env.status, pair: { baseline: BASE, candidate: CAND }, sessions: [], completeSessions: 0, oracle: {}, exceeded: [] };
const samples = new Map(); const add = (k, v) => { if (!samples.has(k)) samples.set(k, []); samples.get(k).push(v); };
const counts = new Map(); let oracleFail = [];
for (let s = 1; s <= env.sessions; s++) {
  const mf = `${dir}/session-${s}.json`; if (!existsSync(mf)) continue;
  const meta = JSON.parse(readFileSync(mf, 'utf8'));
  const procs = meta.processes.map(p => ({ build: p.build, status: p.status, disposed: p.disposed, order: p.orderPosition, browser: p.browser }));
  out.sessions.push({ session: s, processes: procs });
  const ok = new Set(meta.processes.filter(p => p.status === 'passed' && p.disposed).map(p => p.build));
  for (const row of raw(`${dir}/session-${s}.jsonl.gz`)) {
    if (!ok.has(row.build)) continue;
    const pre = [s, row.regime, row.workload, row.size, row.build].join(',');
    if (row.sampleKind === 'counts') { counts.set(`${s},${row.build}`, JSON.stringify(row.result.actions.map(a => [a.counts, a.validation]))); continue; }
    if (row.sampleKind !== 'sample') continue;
    if (row.result.visibility !== 'visible' || row.result.focused !== true) oracleFail.push(`${pre}#${row.index} not visible/focused`);
    for (const a of row.result.actions) if (a.validation && (a.validation.checkedRows !== row.size || a.validation.stateRows !== row.size)) oracleFail.push(`${pre}#${row.index} validation rows`);
    const total = row.result.actions.reduce((x, a) => x + a.timings.totalCpuMs, 0); assert.equal(total, row.result.totalCpuMs);
    add(`${pre},workload,totalCpuMs`, total);
    if (row.workload === 'crud') row.result.actions.forEach((a, i) => add(`${pre},action-${i}-${a.action.kind},totalCpuMs`, a.timings.totalCpuMs));
    if (row.regime === 'fresh') { add(`${pre},initialization,cpuMs`, row.initialization.cpuMs); add(`${pre},lifecycle,totalCpuMs`, row.lifecycleCpuMs); }
  }
}
const dist = new Map([...samples].map(([k, v]) => [k, { n: v.length, ...distribution(v) }]));
const n = env.repetitions[Object.values(env.regimes ?? ['persistent'])[0] ?? 'persistent']?.samples;
for (let s = 1; s <= env.sessions; s++) {
  for (const [k, b] of dist) {
    const p = k.split(','); if (+p[0] !== s || p[4] !== BASE) continue;
    const ck = [p[0], p[1], p[2], p[3], CAND, p[5], p[6]].join(','); const c = dist.get(ck); if (!c) continue;
    const row = { session: s, cond: `${p[1]}/${p[2]}/${p[3]}`, scope: p[5], metric: p[6], nBase: b.n, nCand: c.n,
      baseMedian: b.median, candMedian: c.median, baseP95: b.p95, candP95: c.p95,
      dMedian: c.median - b.median, dP95: c.p95 - b.p95, allowMedian: Math.max(b.median * .05, 1), allowP95: Math.max(b.p95 * .10, 2) };
    row.medianExceeded = row.dMedian > row.allowMedian; row.p95Exceeded = row.dP95 > row.allowP95;
    (out.rows ??= []).push(row); if (row.medianExceeded || row.p95Exceeded) out.exceeded.push(row);
  }
}
for (const s of out.sessions) s.complete = s.processes.length === 2 && s.processes.every(p => p.status === 'passed' && p.disposed);
out.completeSessions = out.sessions.filter(s => s.complete).length;
for (let s = 1; s <= env.sessions; s++) if (counts.has(`${s},${BASE}`) && counts.has(`${s},${CAND}`)) (out.oracle.countsEqual ??= {})[s] = counts.get(`${s},${BASE}`) === counts.get(`${s},${CAND}`);
out.oracle.sampleFailures = oracleFail.length; out.oracle.failureExamples = oracleFail.slice(0, 5);
out.oracle.inPageOracle = 'step() asserts State/DOM/form/identity/focus/Effect; a failure throws and marks the process failed';
writeFileSync(`${dir}/decision.json`, JSON.stringify(out, null, 2));
const f = x => x.toFixed(3);
for (const r of out.rows ?? []) console.log(`S${r.session} ${r.cond} ${r.scope}/${r.metric} n=${r.nBase}/${r.nCand} median ${f(r.baseMedian)}→${f(r.candMedian)} Δ${f(r.dMedian)} (허용 ${f(r.allowMedian)}) ${r.medianExceeded ? 'EXCEED' : 'ok'} | p95 ${f(r.baseP95)}→${f(r.candP95)} Δ${f(r.dP95)} (허용 ${f(r.allowP95)}) ${r.p95Exceeded ? 'EXCEED' : 'ok'}`);
console.log('completeSessions', out.completeSessions, 'exceeded', out.exceeded.length, 'oracle', JSON.stringify(out.oracle.countsEqual), 'sampleFailures', oracleFail.length);
