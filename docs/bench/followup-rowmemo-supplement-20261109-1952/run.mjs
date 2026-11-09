import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
const runId = 'followup-rowmemo-supplement-20261109-1952';
const app = ['task-e9-a0-v1', 'task-e9-a2-v1'];
const engine = ['task-e7-a0-v1', 'task-e9-a0-v1'];
const runs = [
  { kind: 'app', workload: 'dirty', size: 100 },
  { kind: 'app', workload: 'counter', size: 10 },
  { kind: 'app', workload: 'search', size: 100 },
  { kind: 'app', workload: 'filter', size: 1000 },
  { kind: 'engine', workload: 'crud', size: 10 },
].map((run, i) => ({
  ...run, tag: `${runId}-${i + 1}-${run.workload}-${run.size}`, status: 'not-started',
}));
const receipt = `${directory}/execution.json`;
assert(!existsSync(receipt), 'The execution receipt already exists');
for (const { tag } of runs) {
  assert(!existsSync(`docs/bench/${tag}`) && !existsSync(`.validation/task-runs/${tag}`), tag);
}

const budgetMs = 15 * 60_000;
const startedAt = Date.now();
const deadline = startedAt + budgetMs;
const execution = {
  startedAt: new Date(startedAt).toISOString(), deadlineAt: new Date(deadline).toISOString(),
  budgetMs, status: 'running', runs,
};
const save = () => writeFileSync(receipt, JSON.stringify(execution, null, 2) + '\n');
save();

try {
  for (const [index, run] of runs.entries()) {
    const builds = [...(run.kind === 'app' ? app : engine)];
    if (index % 2 === 1) builds.reverse();
    const log = `${directory}/${run.tag}.log`;
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      execution.status = 'stopped-deadline';
      break;
    }
    run.startedAt = new Date().toISOString();
    run.args = [
      'scripts/benchmark-task.mjs', `--tag=${run.tag}`, `--builds=${builds.join(',')}`,
      `--sizes=${run.size}`, `--workloads=${run.workload}`, '--regimes=persistent',
      '--sessions=3', '--supplement', '--alternate-pair-order',
      `--max-minutes=${remainingMs / 60_000}`, `--deadline-epoch-ms=${deadline}`,
    ];
    run.status = 'running';
    save();
    console.log(`START ${run.kind} persistent/${run.workload}/${run.size}; ${(remainingMs / 60_000).toFixed(2)} min remaining`);
    const child = spawn(process.execPath, run.args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => { appendFileSync(log, data); process.stdout.write(data); });
    child.stderr.on('data', data => { appendFileSync(log, data); process.stderr.write(data); });
    const result = await new Promise(resolve => {
      child.once('error', error => resolve({ error: String(error) }));
      child.once('close', (exitCode, signal) => resolve({ exitCode, signal }));
    });
    Object.assign(run, result, { endedAt: new Date().toISOString() });
    const childDirectory = `docs/bench/${run.tag}`;
    if (existsSync(childDirectory)) renameSync(childDirectory, `${directory}/${run.tag}`);
    run.status = result.exitCode === 0 ? 'passed' : result.exitCode === 3 ? 'stopped-deadline' : 'failed';
    save();
    if (run.status !== 'passed') {
      execution.status = run.status;
      break;
    }
  }
  if (execution.status === 'running') execution.status = 'passed';
} catch (error) {
  execution.status = 'failed';
  execution.error = String(error);
  console.error(error);
} finally {
  const endedAt = Date.now();
  execution.endedAt = new Date(endedAt).toISOString();
  execution.elapsedMs = endedAt - startedAt;
  execution.overrunMs = Math.max(0, endedAt - deadline);
  save();
  console.log(`FINISH ${execution.status}; ${(execution.elapsedMs / 1000).toFixed(1)} s`);
  process.exitCode = execution.status === 'passed' ? 0 : execution.status === 'stopped-deadline' ? 3 : 1;
}
