import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const directory = process.argv[2];
assert(directory, 'Pass a run directory');
const read = file => readFileSync(`${directory}/${file}`, 'utf8');
const environment = JSON.parse(read('environment.json'));
const { order, warmupPairs, measuredPairs, aaMeasuredPairs, batchSize } = environment.protocol;
const raw = read('pairs.jsonl').split('\n').filter(Boolean).map(line => JSON.parse(line));
const planned = order.flatMap((conditions, i) => conditions.flatMap(condition => {
  const count = condition === 'AA' ? aaMeasuredPairs : measuredPairs;
  return Array.from({ length: warmupPairs + count }, (_, index) => {
    const pair = index - warmupPairs;
    return { round: i + 1, condition, phase: pair < 0 ? 'warmup' : 'measured', pair,
      first: pair % 2 === 0 ? 'B0' : condition === 'AA' ? 'B0-repeat' : 'C1', batchSize };
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
const groups = [];
for (const condition of ['A', 'B', 'C', 'AA']) {
  for (const round of ['all', ...order.map((_, index) => index + 1)]) {
    for (const first of ['all', 'B0', condition === 'AA' ? 'B0-repeat' : 'C1']) {
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
const control = groups.filter(row => row.condition === 'AA' && (row.round === 'all' || row.first === 'all'));
const aaReferenceUs = control.length ? Math.max(...control.map(row => Math.abs(row.pairedDeltaUs.median))) : null;
writeFileSync(`${directory}/summary.json`, JSON.stringify({ status: environment.status, elapsedMs: environment.elapsedMs,
  accumulatedBatchMs: environment.accumulatedBatchMs, otherLabel: { AA: 'B0-repeat', A: 'C1', B: 'C1', C: 'C1' }, aaReferenceUs, groups }, null, 2) + '\n');
