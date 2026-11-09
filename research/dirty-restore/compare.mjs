// Per-session pair statistics for one benchmark-task.mjs run directory (same rules as analyze-rowmemo-supplement.mjs).
// Usage: node research/dirty-restore/compare.mjs <runDir> <beforeTag> <afterTag> <app|engine|aa> [label]
// Gates: app median max(5%,0.5ms) p95 max(10%,1ms); engine median max(5%,1ms) p95 max(10%,2ms).
// Improvement goal (pre-registered): median drop >= 10% and >= 0.2 ms. Unrounded values decide.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { distribution } from '../../src/bench/statistics.ts';

const [directory, before, after, kind, label = ''] = process.argv.slice(2);
const floor = { app: { median: .5, p95: 1 }, engine: { median: 1, p95: 2 }, aa: { median: .5, p95: 1 } }[kind];
assert(directory && before && after && floor, 'usage');
const environment = JSON.parse(readFileSync(`${directory}/environment.json`, 'utf8'));
assert.equal(environment.status, 'passed', `${directory} did not pass`);
const rows = [];
for (let session = 1; session <= environment.sessions; session++) {
  const metadata = JSON.parse(readFileSync(`${directory}/session-${session}.json`, 'utf8'));
  const passed = metadata.processes.filter(p => p.status === 'passed' && p.disposed);
  const values = new Map();
  const add = (key, value) => { if (!values.has(key)) values.set(key, []); values.get(key).push(value); };
  let validations = 0;
  for (const row of gunzipSync(readFileSync(`${directory}/session-${session}.jsonl.gz`)).toString().trim().split('\n').map(JSON.parse)) {
    if (row.sampleKind !== 'sample') continue;
    assert(passed.some(p => p.build === row.build && p.workload === row.workload && p.size === row.size));
    const actions = row.result.actions;
    for (const action of actions) { assert(action.validation, 'oracle result missing'); validations++; }
    const total = actions.reduce((sum, action) => sum + action.timings.totalCpuMs, 0);
    assert.equal(total, row.result.totalCpuMs);
    add(`${row.build}|workload`, total);
    if (row.workload === 'crud') actions.forEach(({ action, timings }, i) => add(`${row.build}|action-${i}-${action.kind}`, timings.totalCpuMs));
    // Diagnostic split kept for the report (render/effect/follow-up must stay 0 for dirty).
    if (row.workload === 'dirty') for (const a of actions) {
      add(`${row.build}|diffMs`, a.timings.diffMs); add(`${row.build}|commitMs`, a.timings.commitMs);
      add(`${row.build}|renderEffectFollowupMs`, a.timings.renderMs + a.timings.effectMs + a.timings.followupCpuMs);
    }
  }
  const order = passed.map(p => p.build);
  const sections = [...new Set([...values.keys()].map(key => key.split('|')[1]))];
  for (const section of sections) {
    const b = values.get(`${before}|${section}`), a = values.get(`${after}|${section}`);
    if (!b || !a) continue;
    const base = distribution(b), cand = distribution(a);
    const gate = Object.fromEntries(['median', 'p95'].map(stat => {
      const delta = cand[stat] - base[stat], allowance = Math.max(base[stat] * (stat === 'median' ? .05 : .10), floor[stat]);
      return [stat, { deltaMs: delta, deltaPct: base[stat] ? delta / base[stat] * 100 : null, allowanceMs: allowance, exceeded: delta > allowance }];
    }));
    const drop = base.median - cand.median;
    rows.push({ session, section, order, n: [base.n, cand.n], before: base, after: cand, gate,
      goal: { medianDropMs: drop, medianDropPct: drop / base.median * 100, met: drop >= .2 && drop / base.median >= .10 },
      validations });
  }
}
const fmt = v => v.toFixed(3);
const pct = v => v === null ? "n/a" : v.toFixed(1);
console.log(`# ${label || directory}: ${before} -> ${after} (${kind})`);
for (const r of rows) if (!['diffMs', 'commitMs', 'renderEffectFollowupMs'].includes(r.section) || process.env.SPLIT) {
  console.log(`S${r.session} ${r.section} n=${r.n.join('/')} ${fmt(r.before.median)}/${fmt(r.before.iqr)}/${fmt(r.before.p95)} -> ${fmt(r.after.median)}/${fmt(r.after.iqr)}/${fmt(r.after.p95)}`
    + ` | med ${r.gate.median.deltaMs >= 0 ? '+' : ''}${fmt(r.gate.median.deltaMs)} (${pct(r.gate.median.deltaPct)}%) / ${fmt(r.gate.median.allowanceMs)}${r.gate.median.exceeded ? ' EXCEEDED' : ''}`
    + ` | p95 ${r.gate.p95.deltaMs >= 0 ? '+' : ''}${fmt(r.gate.p95.deltaMs)} (${pct(r.gate.p95.deltaPct)}%) / ${fmt(r.gate.p95.allowanceMs)}${r.gate.p95.exceeded ? ' EXCEEDED' : ''}`
    + ` | goal ${r.goal.met ? 'met' : 'not met'} order=${r.order.join('>')}`);
}
if (process.env.JSON_OUT) (await import('node:fs')).writeFileSync(process.env.JSON_OUT, JSON.stringify({ directory, before, after, kind, rows }, null, 2));
