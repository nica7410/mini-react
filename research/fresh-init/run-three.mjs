// Three fixed fresh/equal/100 comparisons, sequential, shared deadline T0+12 min, external tree kill.
// Usage: node research/fresh-init/run-three.mjs <T0 epoch ms>
import { spawn, execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const T0 = Number(process.argv[2]), measureEnd = T0 + 12 * 60_000, finalEnd = T0 + 15 * 60_000;
const prefix = process.argv[3] ?? 'fresh-init-three', out = `docs/bench/${prefix}`; mkdirSync(out, { recursive: true });
const pairs = [['task-e7-a0-v1', 'task-e9-a0-v1'], ['task-e9-a0-v1', 'dr-cand-e9-a0'], ['task-e7-a0-v1', 'dr-cand-e9-a0']];
const runs = pairs.map(([base, cand], i) => ({ id: i + 1, base, cand, tag: `${prefix}-${i + 1}`, status: 'not-started' }));
const receipt = { T0: new Date(T0).toISOString(), measureEnd: new Date(measureEnd).toISOString(), finalEnd: new Date(finalEnd).toISOString(), runs };
const save = () => writeFileSync(`${out}/execution.json`, JSON.stringify(receipt, null, 2));
save();
function complete(dir, run) {
  const env = JSON.parse(readFileSync(`${dir}/environment.json`));
  if (env.status !== 'passed') return `environment ${env.status}`;
  for (const s of [1, 2, 3]) {
    if (!existsSync(`${dir}/session-${s}.json`)) return `missing session ${s}`;
    const meta = JSON.parse(readFileSync(`${dir}/session-${s}.json`));
    for (const b of [run.base, run.cand]) if (!meta.processes.some(p => p.build === b && p.status === 'passed' && p.disposed)) return `S${s} ${b} not passed`;
    const rows = gunzipSync(readFileSync(`${dir}/session-${s}.jsonl.gz`)).toString().trim().split('\n').map(JSON.parse);
    for (const b of [run.base, run.cand]) {
      const n = new Set(rows.filter(r => r.build === b && r.sampleKind === 'sample').map(r => r.index)).size;
      if (n !== 180) return `S${s} ${b} n=${n}`;
    }
  }
  return null;
}
for (const run of runs) {
  const remaining = measureEnd - Date.now();
  if (remaining < 3 * 60_000) { run.status = 'not-started-time'; receipt.stopped = `less than 3 min before measurement end at run ${run.id}`; save(); break; }
  run.args = ['scripts/benchmark-task.mjs', `--tag=${run.tag}`, `--builds=${run.base},${run.cand}`, '--sizes=100', '--workloads=equal', '--regimes=fresh',
    '--sessions=3', '--supplement', '--alternate-pair-order', '--max-minutes=3', `--deadline-epoch-ms=${measureEnd}`];
  run.command = `node ${run.args.join(' ')}`; run.startedAt = new Date().toISOString(); run.status = 'running'; save();
  console.log(`START ${run.id} ${run.base} -> ${run.cand}; ${(remaining / 60000).toFixed(2)} min to measurement end`);
  const child = spawn(process.execPath, run.args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const log = `${out}/${run.tag}.log`;
  child.stdout.on('data', d => { appendFileSync(log, d); process.stdout.write(d); });
  child.stderr.on('data', d => { appendFileSync(log, d); process.stderr.write(d); });
  let killed = false;
  const timer = setTimeout(() => { killed = true; try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F']); } catch {} }, Math.max(0, measureEnd - Date.now()));
  const result = await new Promise(resolve => child.once('close', (exitCode, signal) => resolve({ exitCode, signal })));
  clearTimeout(timer);
  Object.assign(run, result, { killedAtMeasureEnd: killed, endedAt: new Date().toISOString(), elapsedMs: Date.now() - Date.parse(run.startedAt) });
  const dir = `docs/bench/${run.tag}`;
  const problem = killed ? 'killed at measurement end' : result.exitCode !== 0 ? `exit ${result.exitCode}` : complete(dir, run);
  if (problem) { run.status = 'incomplete'; run.problem = problem; receipt.stopped = `run ${run.id}: ${problem}`; save(); break; }
  const judged = execFileSync(process.execPath, ['research/fresh-init/judge-fresh.mjs', dir, run.base, run.cand, `${dir}/decision.json`]).toString();
  appendFileSync(`${out}/${run.tag}.judge.txt`, judged); console.log(judged);
  const decision = JSON.parse(readFileSync(`${dir}/decision.json`));
  if (decision.oracle.sampleFailures.length || !Object.values(decision.oracle.countsEqual).every(Boolean)) { run.status = 'oracle-failed'; receipt.stopped = `run ${run.id}: oracle/counts`; save(); break; }
  run.status = 'complete'; run.exceeded = decision.exceeded.map(r => `S${r.session} ${r.scope} ${r.medianExceeded ? 'median ' : ''}${r.p95Exceeded ? 'p95' : ''}`); save();
}
receipt.endedAt = new Date().toISOString(); save();
console.log('DONE', JSON.stringify(runs.map(r => [r.id, r.status, r.exceeded ?? r.problem ?? ''])));
