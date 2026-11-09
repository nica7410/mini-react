// The single fixed final timing bundle for the dirty-restore candidate (run once; no reruns).
// Same runner/options as the row-memo supplement: 3 fresh sessions, warm-up 10, n=180, alternating pair order, common deadline.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';

const directory = 'docs/bench/followup-dirty-restore-final';
assert(!existsSync(directory), 'The final bundle already exists; it runs only once');
mkdirSync(directory, { recursive: true });
const runs = [
  { id: 1, kind: 'engine', workload: 'dirty', size: 100, builds: ['task-e9-a0-v1', 'dr-cand-e9-a0'] },
  { id: 2, kind: 'engine', workload: 'dirty', size: 100, builds: ['task-e9-a2-v1', 'dr-cand-e9-a2'] },
  { id: 3, kind: 'app', workload: 'dirty', size: 100, builds: ['dr-cand-e9-a0', 'dr-cand-e9-a2'] },
  { id: 4, kind: 'engine', workload: 'equal', size: 100, builds: ['task-e9-a0-v1', 'dr-cand-e9-a0'] },
  { id: 5, kind: 'engine', workload: 'counter', size: 10, builds: ['task-e9-a2-v1', 'dr-cand-e9-a2'] },
  { id: 6, kind: 'engine', workload: 'crud', size: 10, builds: ['task-e9-a0-v1', 'dr-cand-e9-a0'] },
].map(run => ({ ...run, tag: `followup-dirty-restore-final-${run.id}-${run.workload}-${run.size}`, status: 'not-started' }));
for (const { tag } of runs) assert(!existsSync(`docs/bench/${tag}`) && !existsSync(`.validation/task-runs/${tag}`), tag);
const budgetMs = 12 * 60_000, startedAt = Date.now(), deadline = startedAt + budgetMs;
const execution = { startedAt: new Date(startedAt).toISOString(), deadlineAt: new Date(deadline).toISOString(), budgetMs, status: 'running', runs };
const save = () => writeFileSync(`${directory}/execution.json`, JSON.stringify(execution, null, 2) + '\n');
save();
try {
  for (const [index, run] of runs.entries()) {
    const builds = index % 2 === 1 ? [...run.builds].reverse() : [...run.builds];
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) { execution.status = 'stopped-deadline'; break; }
    run.startedAt = new Date().toISOString();
    run.args = ['scripts/benchmark-task.mjs', `--tag=${run.tag}`, `--builds=${builds.join(',')}`, `--sizes=${run.size}`, `--workloads=${run.workload}`,
      '--regimes=persistent', '--sessions=3', '--supplement', '--alternate-pair-order', `--max-minutes=${remainingMs / 60_000}`, `--deadline-epoch-ms=${deadline}`];
    run.status = 'running'; save();
    console.log(`START ${run.id} ${run.kind} persistent/${run.workload}/${run.size} ${builds.join(' vs ')}; ${(remainingMs / 60_000).toFixed(2)} min left`);
    const log = `${directory}/${run.tag}.log`;
    const child = spawn(process.execPath, run.args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => { appendFileSync(log, data); process.stdout.write(data); });
    child.stderr.on('data', data => { appendFileSync(log, data); process.stderr.write(data); });
    const result = await new Promise(resolve => {
      child.once('error', error => resolve({ error: String(error) }));
      child.once('close', (exitCode, signal) => resolve({ exitCode, signal }));
    });
    Object.assign(run, result, { endedAt: new Date().toISOString() });
    if (existsSync(`docs/bench/${run.tag}`)) renameSync(`docs/bench/${run.tag}`, `${directory}/${run.tag}`);
    run.status = result.exitCode === 0 ? 'passed' : result.exitCode === 3 ? 'stopped-deadline' : 'failed';
    save();
    if (run.status !== 'passed') { execution.status = run.status; break; }
  }
  if (execution.status === 'running') execution.status = 'passed';
} catch (error) { execution.status = 'failed'; execution.error = String(error); console.error(error); }
finally {
  const endedAt = Date.now();
  Object.assign(execution, { endedAt: new Date(endedAt).toISOString(), elapsedMs: endedAt - startedAt, overrunMs: Math.max(0, endedAt - deadline) });
  save();
  console.log(`FINISH ${execution.status}; ${(execution.elapsedMs / 1000).toFixed(1)} s`);
  process.exitCode = execution.status === 'passed' ? 0 : execution.status === 'stopped-deadline' ? 3 : 1;
}
