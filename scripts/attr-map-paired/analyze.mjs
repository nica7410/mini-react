// Statistics (as in scripts/keyed-paired-diff/analyze.mjs) and the mechanical decision checks
// of docs/validation/followup-attr-maps/plan.md. Usage: node analyze.mjs <run directory>
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const directory = process.argv[2];
assert(directory, 'Pass a run directory');
const read = file => readFileSync(`${directory}/${file}`, 'utf8');
const environment = JSON.parse(read('environment.json'));
const { order, warmupPairs, measuredPairs, batchSizes } = environment.protocol;
const controlOf = { A: 'AA', B: 'AA', C: 'AA', U: 'AA', F: 'FF' };
const isControl = condition => condition === 'AA' || condition === 'FF';
const otherOf = condition => isControl(condition) ? 'B0-repeat' : 'R1';
const raw = read('pairs.jsonl').split('\n').filter(Boolean).map(line => JSON.parse(line));
const planned = order.flatMap((conditions, i) => conditions.flatMap(condition => Array.from({ length: warmupPairs + measuredPairs }, (_, index) => {
  const pair = index - warmupPairs;
  return { round: i + 1, condition, phase: pair < 0 ? 'warmup' : 'measured', pair, first: pair % 2 === 0 ? 'B0' : otherOf(condition), batchSize: batchSizes[condition] };
})));
assert.ok(raw.length <= planned.length);
assert.notEqual(environment.status, 'running');
if (environment.status === 'completed') assert.equal(raw.length, planned.length);
raw.forEach(({ b0Ms, otherMs, ...label }, index) => {
  assert.deepEqual(label, planned[index]);
  assert.ok([b0Ms, otherMs].every(ms => Number.isFinite(ms) && ms >= 0));
});
const samples = raw.filter(row => row.phase === 'measured');
assert.equal(samples.length, environment.measuredPairs);
assert.equal(raw.length - samples.length, environment.warmupPairs);

function quantile(values, fraction) {
  const sorted = values.toSorted((a, b) => a - b);
  const index = (sorted.length - 1) * fraction, lower = Math.floor(index);
  return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
}
const rounds = order.map((_, index) => index + 1);
const conditions = [...new Set(order.flat())];
const groups = [];
for (const condition of conditions) {
  const size = batchSizes[condition];
  const batchStats = values => { const median = quantile(values, 0.5), p95 = quantile(values, 0.95);
    return { batchMedianMs: median, batchP95Ms: p95, perCallMedianUs: median * 1000 / size, perCallP95Us: p95 * 1000 / size }; };
  for (const round of ['all', ...rounds]) for (const first of ['all', 'B0', otherOf(condition)]) {
    const rows = samples.filter(row => row.condition === condition && (round === 'all' || row.round === round) && (first === 'all' || row.first === first));
    if (!rows.length) continue;
    const delta = rows.map(row => (row.otherMs - row.b0Ms) * 1000 / size);
    groups.push({ condition, round, first, n: rows.length, batchSize: size, B0: batchStats(rows.map(row => row.b0Ms)), other: batchStats(rows.map(row => row.otherMs)),
      pairedDeltaUs: { q25: quantile(delta, 0.25), median: quantile(delta, 0.5), q75: quantile(delta, 0.75),
        negative: delta.filter(value => value < 0).length, ties: delta.filter(value => value === 0).length, positive: delta.filter(value => value > 0).length } });
  }
}
const group = (condition, round, first) => groups.find(row => row.condition === condition && row.round === round && row.first === first);
// Control reference: the largest absolute paired median among overall, per-round and per-order groups.
const reference = control => Math.max(...groups.filter(row => row.condition === control && (row.round === 'all' || row.first === 'all')).map(row => Math.abs(row.pairedDeltaUs.median)));
const orderReference = control => Math.max(...groups.filter(row => row.condition === control && row.round === 'all' && row.first !== 'all').map(row => Math.abs(row.pairedDeltaUs.median)));

const complete = environment.status === 'completed';
const checks = {};
let references = null;
if (complete) {
  references = Object.fromEntries(['AA', 'FF'].map(control => [control, { referenceUs: reference(control), orderReferenceUs: orderReference(control) }]));
  for (const condition of ['A', 'B', 'C', 'U', 'F']) {
    const control = references[controlOf[condition]];
    const all = group(condition, 'all', 'all');
    const b0MedianUs = all.B0.perCallMedianUs;
    const thresholdUs = Math.max(0.01 * b0MedianUs, control.referenceUs);
    const perRound = rounds.map(round => group(condition, round, 'all').pairedDeltaUs.median);
    const orders = ['B0', 'R1'].map(first => group(condition, 'all', first));
    const orderMedians = orders.map(row => row.pairedDeltaUs.median);
    const tenPercentUs = 0.1 * b0MedianUs;
    const c = checks[condition] = {
      b0MedianUs, thresholdUs, overallMedianUs: all.pairedDeltaUs.median, relativeOverall: all.pairedDeltaUs.median / b0MedianUs,
      roundMediansUs: perRound, orderMediansUs: orderMedians,
      a_overallExceeds: -all.pairedDeltaUs.median > thresholdUs,
      b_roundsExceeding: perRound.filter(value => -value > thresholdUs).length,
      c_bothOrdersNegativeWithMajority: orders.every(row => row.pairedDeltaUs.median < 0 && row.pairedDeltaUs.negative > row.n / 2),
      d_noOppositeRound: perRound.every(value => value <= thresholdUs),
      e_ordersBeatControlOrderEffect: orderMedians.every(value => -value > control.orderReferenceUs),
      worseningRounds: perRound.filter(value => value > thresholdUs).length,
      overallWorsens: all.pairedDeltaUs.median > thresholdUs,
      clear_allRoundsAndOrdersAtLeast10Percent: -all.pairedDeltaUs.median >= tenPercentUs && perRound.every(value => -value >= tenPercentUs)
        && orderMedians.every(value => -value >= tenPercentUs),
    };
    c.baseRule = c.a_overallExceeds && c.b_roundsExceeding >= 2 && c.c_bothOrdersNegativeWithMajority && c.d_noOppositeRound && c.e_ordersBeatControlOrderEffect;
  }
}
// Adoption (plan.md): base rule on A, B and U; at least 10 % on A, B and C everywhere; no
// repeated worsening in C; the fresh render F not worse beyond its threshold.
const decision = !complete ? { verdict: 'hold (run not completed)' } : (() => {
  const baseRule = ['A', 'B', 'U'].every(condition => checks[condition].baseRule);
  const clearImprovement = ['A', 'B', 'C'].every(condition => checks[condition].clear_allRoundsAndOrdersAtLeast10Percent);
  const repeatedWorseningInC = checks.C.worseningRounds >= 2;
  const freshNotWorse = !checks.F.overallWorsens && checks.F.worseningRounds < 2;
  return { verdict: baseRule && clearImprovement && !repeatedWorseningInC && freshNotWorse ? 'adopt' : 'hold', baseRule, clearImprovement, repeatedWorseningInC, freshNotWorse };
})();
writeFileSync(`${directory}/summary.json`, JSON.stringify({ status: environment.status, elapsedMs: environment.elapsedMs, accumulatedBatchMs: environment.accumulatedBatchMs,
  otherLabel: Object.fromEntries(conditions.map(condition => [condition, otherOf(condition)])), references, decision: { ...decision, checks }, groups }, null, 2) + '\n');
console.log(`attribute maps (R1): ${decision.verdict}`);
for (const [condition, c] of Object.entries(checks)) {
  console.log(`${condition}: B0 ${c.b0MedianUs.toFixed(1)} us, paired median ${c.overallMedianUs.toFixed(1)} us (${(c.relativeOverall * 100).toFixed(1)} %), rounds ${c.roundMediansUs.map(v => v.toFixed(1)).join(' / ')}, orders ${c.orderMediansUs.map(v => v.toFixed(1)).join(' / ')}, threshold ${c.thresholdUs.toFixed(1)}, base rule ${c.baseRule}, clear ${c.clear_allRoundsAndOrdersAtLeast10Percent}`);
}
if (references) console.log(`references: AA ${references.AA.referenceUs.toFixed(1)} us (order ${references.AA.orderReferenceUs.toFixed(1)}), FF ${references.FF.referenceUs.toFixed(1)} us (order ${references.FF.orderReferenceUs.toFixed(1)})`);
