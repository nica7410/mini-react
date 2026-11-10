// Pure keyed-planner timing: baseline commit vs candidate commit, same inputs, one bundle.
// Protocol is fixed in docs/validation/followup-keyed-boundaries/plan.md (N=100, batch of 200
// calls, 10 warm-up + 60 measured pairs per input, alternating order, 3 independent processes).
// Usage: node scripts/bench-keyed-planner.mjs --tag=<unique> --b0=<commit> --c1=<commit>
import assert from 'node:assert/strict';
import { build } from 'vite';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const options = new Map(process.argv.slice(2).map(arg => { const [key, value] = arg.replace(/^--/, '').split('='); return [key, value]; }));
const tag = options.get('tag'), refs = { B0: options.get('b0'), C1: options.get('c1') };
assert(tag && /^[a-z0-9-]+$/.test(tag) && refs.B0 && refs.C1, 'Use --tag=unique --b0=commit --c1=commit');
const output = `docs/bench/${tag}`, work = path.resolve('.validation/keyed-planner-bench', tag);
assert(!existsSync(output) && !existsSync(work), 'Preserve existing run');
mkdirSync(output, { recursive: true }); mkdirSync(work, { recursive: true });
const git = args => execFileSync('git', args, { maxBuffer: 16 * 1024 * 1024 });
const sha = data => createHash('sha256').update(data).digest('hex');
const sources = {};
for (const [name, ref] of Object.entries(refs)) {
  const commit = git(['rev-parse', `${ref}^{commit}`]).toString().trim(); sources[name] = { commit, files: {} };
  for (const file of ['keyed.ts', 'vdom.ts', 'types.ts']) {
    const data = git(['show', `${commit}:src/core/${file}`]);
    mkdirSync(path.join(work, name.toLowerCase()), { recursive: true }); writeFileSync(path.join(work, name.toLowerCase(), file), data);
    sources[name].files[file] = sha(data);
  }
}
const N = 100, BATCH = 200, WARMUP = 10, SAMPLES = 60, SEED = 539365639, SESSIONS = 3;
// The measured program. Fixtures and the result check stay outside the timed region.
writeFileSync(path.join(work, 'entry.ts'), `
import { planKeyedChildren as planB0 } from './b0/keyed';
import { planKeyedChildren as planC1 } from './c1/keyed';
const N = ${N}, BATCH = ${BATCH}, WARMUP = ${WARMUP}, SAMPLES = ${SAMPLES}, SEED = ${SEED};
const session = Number(process.argv[2] ?? 1);
const Row = () => null;
const row = (id: number): any => ({ kind: 'element', identity: { key: 'task-' + id, renderedRootKey: null, boundaries: [{ type: Row, key: 'task-' + id }] },
  tag: 'li', attrs: {}, style: {}, events: {}, form: null, children: [] });
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
function shuffled(n: number): number[] {
  let state = SEED >>> 0; const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x100000000; };
  const result = range(n); for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
const inputs: Record<string, [number[], number[]]> = {
  same: [range(N), range(N)], append: [range(N), [...range(N), N]], 'remove-last': [range(N), range(N - 1)],
  'insert-middle': [range(N), [...range(N).slice(0, N >> 1), N, ...range(N).slice(N >> 1)]],
  reverse: [range(N), range(N).reverse()], shuffle: [range(N), shuffled(N)], 'last-to-first': [range(N), [N - 1, ...range(N - 1)]],
};
const names = Object.keys(inputs), order = [...names.slice((session - 1) % names.length), ...names.slice(0, (session - 1) % names.length)];
let sink = 0;
function batch(plan: typeof planC1, old: any[], next: any[]): number {
  const start = performance.now();
  for (let i = 0; i < BATCH; i++) { const result = plan(old, next, 'lis'); sink += result.ok ? result.value.slots.length : -1; }
  return performance.now() - start;
}
const shape = (result: any) => JSON.stringify([result.ok, result.value.slots.map((slot: any) => slot.oldIndex), result.value.moveNewIndices, result.value.insertNewIndices, result.value.removedRefs, result.value.usedLIS]);
const results: Record<string, unknown> = {};
for (const name of order) {
  const [oldIds, nextIds] = inputs[name];
  const old = oldIds.map((id, i) => ({ ref: 'old/' + i, vnode: row(id), children: [] })), next = nextIds.map(row);
  const expected = planB0(old, next, 'lis'), actual = planC1(old, next, 'lis');
  if (shape(expected) !== shape(actual)) throw new Error('Planner results differ: ' + name);
  const samples = [];
  for (let pair = -WARMUP; pair < SAMPLES; pair++) {
    const first = pair % 2 === 0 ? 'B0' : 'C1';
    const a = batch(first === 'B0' ? planB0 : planC1, old, next), b = batch(first === 'B0' ? planC1 : planB0, old, next);
    if (pair >= 0) samples.push({ pair, first, B0: first === 'B0' ? a : b, C1: first === 'B0' ? b : a });
  }
  results[name] = { moves: (actual as any).value.moveNewIndices.length, usedLIS: (actual as any).value.usedLIS, samples };
}
process.stdout.write(JSON.stringify({ session, inputOrder: order, results, sink }));
`);
await build({ root: work, configFile: false, logLevel: 'warn', build: { outDir: path.join(work, 'dist'), minify: 'oxc', sourcemap: false, target: 'node24',
  lib: { entry: path.join(work, 'entry.ts'), formats: ['es'], fileName: 'bench' } } });
const bundle = path.join(work, 'dist', 'bench.js');
const environment = { tag, startedAt: new Date().toISOString(), sources, bundleSha256: sha(readFileSync(bundle)), node: process.version,
  vite: JSON.parse(readFileSync('node_modules/vite/package.json')).version, cpu: os.cpus()[0]?.model, logicalCPUs: os.cpus().length,
  os: { platform: os.platform(), release: os.release(), arch: os.arch() }, protocol: { N, BATCH, WARMUP, SAMPLES, SEED, SESSIONS, strategy: 'lis' },
  runnerSha256: sha(readFileSync('scripts/bench-keyed-planner.mjs')),
  interval: 'performance.now() around BATCH consecutive planner calls on one prepared input; fixtures and the result check are outside. Wall clock, not CPU usage.' };
const quantile = (sorted, p) => { const index = (sorted.length - 1) * p, low = Math.floor(index); return sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low); };
const summary = [];
for (let session = 1; session <= SESSIONS; session++) {
  const child = spawnSync(process.execPath, [bundle, String(session)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(child.status, 0, child.stderr);
  const data = JSON.parse(child.stdout);
  writeFileSync(`${output}/session-${session}.json`, JSON.stringify(data));
  for (const [input, value] of Object.entries(data.results)) {
    const row = { session, input, moves: value.moves, usedLIS: value.usedLIS, n: value.samples.length };
    for (const planner of ['B0', 'C1']) {
      const sorted = value.samples.map(sample => sample[planner]).sort((a, b) => a - b);
      row[planner] = { batchMedianMs: quantile(sorted, 0.5), batchP95Ms: quantile(sorted, 0.95), batchMinMs: sorted[0], batchMaxMs: sorted.at(-1),
        perCallMedianUs: quantile(sorted, 0.5) / BATCH * 1000, perCallP95Us: quantile(sorted, 0.95) / BATCH * 1000 };
    }
    row.medianDeltaUsPerCall = row.C1.perCallMedianUs - row.B0.perCallMedianUs;
    row.medianRatio = row.C1.batchMedianMs / row.B0.batchMedianMs; row.p95Ratio = row.C1.batchP95Ms / row.B0.batchP95Ms;
    summary.push(row);
  }
}
environment.endedAt = new Date().toISOString(); environment.status = 'passed';
writeFileSync(`${output}/environment.json`, JSON.stringify(environment, null, 2));
writeFileSync(`${output}/summary.json`, JSON.stringify(summary, null, 2));
for (const row of summary) console.log(`S${row.session} ${row.input.padEnd(14)} B0 ${row.B0.perCallMedianUs.toFixed(2)} us (p95 ${row.B0.perCallP95Us.toFixed(2)})  C1 ${row.C1.perCallMedianUs.toFixed(2)} us (p95 ${row.C1.perCallP95Us.toFixed(2)})  median x${row.medianRatio.toFixed(3)}`);
console.log(`PLANNER_COMPLETE ${output}`);
