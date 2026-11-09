import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const base = 'docs/bench/task-candidate-v2';
const planFile = `${base}/tail-supplement-plan-e4.json`;
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const json = file => JSON.parse(readFileSync(file));
const run = args => execFileSync(process.execPath, args, { stdio: 'inherit', windowsHide: true });
const log = (stage, ...detail) => console.log(new Date().toISOString(), stage, ...detail);

assert.equal(sha(planFile), 'c9e9a7d587ee73f214dab62a8b5ee459c31851b8b19fd03809a3732ae66bd546');
const plan = json(planFile);
const original = json(`${base}/environment.json`);
assert.equal(plan.engine, 'E4');
assert.equal(plan.runs.length, 3);
assert.equal(plan.selectedConditions.length, 11);
for (const [file, hash] of Object.entries({
  [`${base}/environment.json`]: plan.sourceEnvironmentSha256,
  [`${base}/decisions.json`]: plan.sourceDecisionsSha256,
  [`${base}/statistics-audit.json`]: plan.statisticsAuditSha256,
  [`${base}/policy-audit.json`]: plan.policyAuditSha256,
  'scripts/plan-task-supplement.mjs': plan.plannerSha256,
  'scripts/benchmark-task.mjs': original.runnerSha256,
  'docs/task-app-comparison-plan.md': original.planSha256,
})) assert.equal(sha(file), hash, file);
assert.equal(process.version, original.node);
const tags = original.builds.map(build => build.tag).join(',');
for (const entry of plan.runs) {
  assert.match(entry.tag, /^task-candidate-v2-tail-persistent-(10|100|10000)-v1$/);
  assert.deepEqual(entry.args, [
    'scripts/benchmark-task.mjs', `--tag=${entry.tag}`, `--builds=${tags}`, `--sizes=${entry.size}`,
    `--regimes=${entry.regime}`, `--workloads=${entry.workloads.join(',')}`, '--sessions=3', '--supplement',
  ]);
  assert(!existsSync(`docs/bench/${entry.tag}`) && !existsSync(`.validation/task-runs/${entry.tag}`));
}
run(['scripts/restore-task-builds.mjs', base]);
log('E4_SUPPLEMENT_PREFLIGHT_PASSED');

for (const {tag, args} of plan.runs) {
  log('E4_SUPPLEMENT_TIMING_START', tag);
  run(args);
  const environment = json(`docs/bench/${tag}/environment.json`);
  assert.equal(environment.status, 'passed');
  assert.equal(environment.supplement, true);
  assert.equal(environment.sessions, 3);
  assert.equal(environment.repetitions.persistent.samples, 180);
  for (const field of ['builds', 'seed', 'runnerSha256', 'planSha256', 'node', 'headless', 'viewport', 'intervals']) {
    assert.deepEqual(environment[field], original[field], `${tag}/${field}`);
  }
  log('E4_SUPPLEMENT_TIMING_COMPLETE', tag);
}
for (const {tag} of plan.runs) {
  const dir = `docs/bench/${tag}`;
  log('E4_SUPPLEMENT_AUDIT_START', tag);
  for (const script of ['analyze-task', 'compare-task', 'audit-task-statistics', 'audit-task-policy']) {
    run([`scripts/${script}.mjs`, dir]);
  }
  run(['scripts/report-task-policy.mjs', tag, 'E4']);
  log('E4_SUPPLEMENT_AUDIT_COMPLETE', tag);
}
log('E4_SUPPLEMENT_COMPLETE');