// Statistics of scripts/keyed-paired-diff/analyze.mjs plus the mechanical decision checks fixed
// in docs/validation/followup-validate-names/plan.md. Usage: node analyze.mjs <run directory>
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const directory = process.argv[2];
assert(directory, 'Pass a run directory');
const read = file => readFileSync(`${directory}/${file}`, 'utf8');
const environment = JSON.parse(read('environment.json'));
const { order, warmupPairs, measuredPairs, aaMeasuredPairs, batchSize } = environment.protocol;
const { variant, otherLabel } = environment;
const raw = read('pairs.jsonl').split('\n').filter(Boolean).map(line => JSON.parse(line));
const planned = order.flatMap((conditions, i) => conditions.flatMap(condition => {
  const count = condition === 'AA' ? aaMeasuredPairs : measuredPairs;
  return Array.from({ length: warmupPairs + count }, (_, index) => {
    const pair = index - warmupPairs;
    return { round: i + 1, condition, phase: pair < 0 ? 'warmup' : 'measured', pair,
      first: pair % 2 === 0 ? 'B0' : condition === 'AA' ? 'B0-repeat' : otherLabel, batchSize };
  });
}));
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
function batchStats(values) {
  const median = quantile(values, 0.5), p95 = quantile(values, 0.95);
  return { batchMedianMs: median, batchP95Ms: p95, perCallMedianUs: median * 1000 / batchSize, perCallP95Us: p95 * 1000 / batchSize };
}
const rounds = order.map((_, index) => index + 1);
const groups = [];
for (const condition of ['A', 'B', 'C', 'AA']) {
  const other = condition === 'AA' ? 'B0-repeat' : otherLabel;
  for (const round of ['all', ...rounds]) {
    for (const first of ['all', 'B0', other]) {
      const rows = samples.filter(row => row.condition === condition && (round === 'all' || row.round === round) && (first === 'all' || row.first === first));
      if (!rows.length) continue;
      const delta = rows.map(row => (row.otherMs - row.b0Ms) * 1000 / batchSize);
      groups.push({ condition, round, first, n: rows.length, B0: batchStats(rows.map(row => row.b0Ms)),
        other: batchStats(rows.map(row => row.otherMs)), pairedDeltaUs: { q25: quantile(delta, 0.25), median: quantile(delta, 0.5),
          q75: quantile(delta, 0.75), negative: delta.filter(value => value < 0).length, ties: delta.filter(value => value === 0).length,
          positive: delta.filter(value => value > 0).length } });
    }
  }
}
const group = (condition, round, first) => groups.find(row => row.condition === condition && row.round === round && row.first === first);
const control = groups.filter(row => row.condition === 'AA' && (row.round === 'all' || row.first === 'all'));
const aaReferenceUs = control.length ? Math.max(...control.map(row => Math.abs(row.pairedDeltaUs.median))) : null;
const aaOrder = groups.filter(row => row.condition === 'AA' && row.round === 'all' && row.first !== 'all');
const aaOrderReferenceUs = aaOrder.length ? Math.max(...aaOrder.map(row => Math.abs(row.pairedDeltaUs.median))) : null;

// Decision checks (plan.md, "판정 규칙"). Negative delta = the other arm is faster.
const complete = environment.status === 'completed';
const checks = {};
for (const condition of ['A', 'B', 'C']) {
  const all = group(condition, 'all', 'all');
  if (!all || !complete) { checks[condition] = null; continue; }
  const b0MedianUs = all.B0.perCallMedianUs;
  const thresholdUs = Math.max(0.01 * b0MedianUs, aaReferenceUs);
  const perRound = rounds.map(round => group(condition, round, 'all').pairedDeltaUs.median);
  const orders = ['B0', otherLabel].map(first => group(condition, 'all', first));
  const orderMedians = orders.map(row => row.pairedDeltaUs.median);
  const tenPercentUs = 0.1 * b0MedianUs;
  checks[condition] = {
    b0MedianUs, thresholdUs, overallMedianUs: all.pairedDeltaUs.median, roundMediansUs: perRound, orderMediansUs: orderMedians,
    relativeOverall: all.pairedDeltaUs.median / b0MedianUs,
    // (a)-(d): the rule of docs/validation/keyed-paired-diff/plan.md, unchanged.
    a_overallExceeds: -all.pairedDeltaUs.median > thresholdUs,
    b_roundsExceeding: perRound.filter(value => -value > thresholdUs).length,
    c_bothOrdersNegativeWithMajority: orders.every(row => row.pairedDeltaUs.median < 0 && row.pairedDeltaUs.negative > row.n / 2),
    d_noOppositeRound: perRound.every(value => value <= thresholdUs),
    // (e): each order subset must beat the largest A/A order-subset median (order effect).
    e_ordersBeatAAOrderEffect: orderMedians.every(value => -value > aaOrderReferenceUs),
    worseningRounds: perRound.filter(value => value > thresholdUs).length,
    // Extra bar for a claim of a clear improvement: at least 10 % everywhere.
    clear_allRoundsAndOrdersAtLeast10Percent: -all.pairedDeltaUs.median >= tenPercentUs && perRound.every(value => -value >= tenPercentUs)
      && orderMedians.every(value => -value >= tenPercentUs),
  };
  const c = checks[condition];
  c.baseRule = c.a_overallExceeds && c.b_roundsExceeding >= 2 && c.c_bothOrdersNegativeWithMajority && c.d_noOppositeRound && c.e_ordersBeatAAOrderEffect;
}
const repeatedWorseningInC = complete && checks.C ? checks.C.worseningRounds >= 2 : null;
const baseAdopt = complete && checks.A.baseRule && checks.B.baseRule && !repeatedWorseningInC;
const clear = complete && ['A', 'B', 'C'].every(condition => checks[condition].clear_allRoundsAndOrdersAtLeast10Percent);
// validate (V1) needs the base rule and the clear-improvement bar; planner (C1) the base rule.
const verdict = !complete ? 'hold (run not completed)' : (variant === 'validate' ? baseAdopt && clear : baseAdopt) ? 'adopt' : 'hold';
writeFileSync(`${directory}/summary.json`, JSON.stringify({ status: environment.status, variant, elapsedMs: environment.elapsedMs,
  accumulatedBatchMs: environment.accumulatedBatchMs, otherLabel: { AA: 'B0-repeat', A: otherLabel, B: otherLabel, C: otherLabel },
  aaReferenceUs, aaOrderReferenceUs, decision: { verdict, baseAdopt, clearImprovement: clear, repeatedWorseningInC, checks }, groups }, null, 2) + '\n');
console.log(`${variant} (${otherLabel}): ${verdict}`);
for (const condition of ['A', 'B', 'C']) if (checks[condition]) {
  const c = checks[condition];
  console.log(`${condition}: B0 ${c.b0MedianUs.toFixed(1)} us, paired median ${c.overallMedianUs.toFixed(1)} us (${(c.relativeOverall * 100).toFixed(1)} %), rounds ${c.roundMediansUs.map(v => v.toFixed(1)).join(' / ')}, orders ${c.orderMediansUs.map(v => v.toFixed(1)).join(' / ')}, threshold ${c.thresholdUs.toFixed(1)}, base rule ${c.baseRule}`);
}
console.log(`A/A reference ${aaReferenceUs?.toFixed(1)} us, A/A order reference ${aaOrderReferenceUs?.toFixed(1)} us`);
