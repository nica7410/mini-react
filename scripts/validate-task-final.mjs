// Run only after selecting the final functional implementation and ending timings.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import net from 'node:net';
import path from 'node:path';

const tag = process.argv[2]; assert(tag && /^[a-z0-9-]+$/.test(tag), 'Usage: node scripts/validate-task-final.mjs unique-tag');
const directory = `docs/validation/${tag}`; assert(!existsSync(directory), 'Preserve all earlier validation runs');
const git = args => execFileSync('git', args, { encoding: 'utf8' }).trim();
assert.equal(git(['branch', '--show-current']), 'phase1');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceFiles = git(['ls-files', 'src', 'tests', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts', 'scripts/browser-server.mjs']).split('\n').filter(Boolean);
assert.equal(git(['status', '--porcelain', '--untracked-files=all', '--', 'src', 'tests', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts', 'scripts/browser-server.mjs']), '', 'Commit the selected functional source and tests before final validation');
const hashes = () => Object.fromEntries(sourceFiles.map(file => [file, sha(readFileSync(file))]));
const sourceSha256 = hashes(), commit = git(['rev-parse', 'HEAD']);
mkdirSync(directory, { recursive: true }); mkdirSync('.validation', { recursive: true });
const result = { status: 'running', startedAt: new Date().toISOString(), branch: 'phase1', commit, sourceSha256,
  validatorSha256: sha(readFileSync('scripts/validate-task-final.mjs')), node: process.version, platform: process.platform, arch: process.arch,
  startingStatus: git(['status', '--short']), commands: [], browserRuns: [],
  manualIME: { status: 'previous user report, not rerun for this source', date: '2026-11-07', answer: '직접 확인 완료 — 문제 없음', browser: 'not supplied', current: 'synthetic composition tests in the full browser suite' } };
const save = () => writeFileSync(`${directory}/result.json`, JSON.stringify(result, null, 2)); save();
function run(name, args) {
  const command = { name, args, startedAt: new Date().toISOString() }; result.commands.push(command); console.log(`VALIDATION ${name} START`);
  const executed = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/pnpm.ps1', ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  command.endedAt = new Date().toISOString(); command.exitCode = executed.status;
  writeFileSync(`${directory}/${name}.log`, (executed.stdout ?? '') + (executed.stderr ?? '') + (executed.error ? String(executed.error) : ''));
  save(); return command;
}
async function portFree(port = 4173) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    socket.once('error', error => { socket.destroy(); resolve(error.code === 'ECONNREFUSED'); });
    socket.setTimeout(2000, () => { socket.destroy(); resolve(false); });
  });
}
try {
  assert(await portFree(4178) && await portFree(4179), 'End formal timing and diagnostic processes before final tests/build');
  const typecheck = run('typecheck', ['typecheck']); assert.equal(typecheck.exitCode, 0); console.log('VALIDATION typecheck PASS');
  const unitFile = `.validation/${tag}-unit.json`;
  const unit = run('unit', ['test', '--reporter=json', `--outputFile=${unitFile}`]);
  if (existsSync(unitFile)) writeFileSync(`${directory}/unit.json.gz`, gzipSync(readFileSync(unitFile)));
  assert.equal(unit.exitCode, 0);
  const unitReport = JSON.parse(readFileSync(unitFile));
  assert.equal(unitReport.numFailedTests, 0); assert.equal(unitReport.numPendingTests, 0); assert.equal(unitReport.numTodoTests, 0);
  assert.equal(unitReport.numPassedTests, unitReport.numTotalTests); assert(unitReport.numTotalTests >= 205);
  result.unit = { passed: unitReport.numPassedTests, total: unitReport.numTotalTests, files: unitReport.testResults.length, pending: unitReport.numPendingTests, todo: unitReport.numTodoTests };
  console.log(`VALIDATION unit ${unitReport.numPassedTests} PASS`); save();
  const production = run('build', ['build']); assert.equal(production.exitCode, 0);
  const files = folder => readdirSync(folder, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(folder, entry.name)) : [path.join(folder, entry.name)]);
  result.productionAssets = Object.fromEntries(files('dist').map(file => [file.replaceAll('\\', '/'), sha(readFileSync(file))]));
  console.log('VALIDATION build PASS'); save();
  for (let index = 1; index <= 3; index++) {
    assert(await portFree(), 'The previous test server must have exited; do not reuse or kill unrelated servers');
    const command = run(`browser-${index}`, ['test:browser']);
    const folder = `${directory}/browser-${index}`; mkdirSync(folder);
    for (const filename of ['browser-results.json', 'browser-timings.json', 'browser-server.json']) if (existsSync(`.validation/${filename}`)) {
      const bytes = readFileSync(`.validation/${filename}`);
      if (filename === 'browser-results.json') writeFileSync(`${folder}/${filename}.gz`, gzipSync(bytes));
      else writeFileSync(`${folder}/${filename}`, bytes);
    }
    if (existsSync('test-results')) cpSync('test-results', `${folder}/test-results`, { recursive: true });
    const report = JSON.parse(readFileSync('.validation/browser-results.json'));
    const server = JSON.parse(readFileSync('.validation/browser-server.json'));
    const evidence = { run: index, stats: report.stats, argv: report.config.argv, workers: report.config.workers,
      projects: report.config.projects.map(project => ({ name: project.name, timeout: project.timeout, retries: project.retries })),
      server: { pid: server.pid, startedAt: server.startedAt }, commandExit: command.exitCode };
    result.browserRuns.push(evidence); save();
    assert.equal(command.exitCode, 0); assert.equal(report.stats.expected, 33); assert.equal(report.stats.skipped, 0); assert.equal(report.stats.unexpected, 0); assert.equal(report.stats.flaky, 0);
    assert.equal(report.config.workers, 2); assert.deepEqual(evidence.projects.map(project => project.name), ['chromium', 'firefox']);
    for (const project of evidence.projects) { assert.equal(project.timeout, 30000); assert.equal(project.retries, 0); }
    assert(Date.parse(server.startedAt) >= Date.parse(command.startedAt) && Date.parse(server.startedAt) <= Date.parse(command.endedAt), 'Server evidence is stale');
    assert.equal(new Set(result.browserRuns.map(row => row.server.startedAt)).size, index, 'Server reused');
    assert(await portFree()); console.log(`VALIDATION browser-${index} 33/33 PASS`);
  }
  assert.deepEqual(hashes(), sourceSha256, 'Functional source/test files changed during validation');
  assert.equal(git(['rev-parse', 'HEAD']), commit); assert.equal(git(['branch', '--show-current']), 'phase1');
  result.sourceUnchanged = true; result.status = 'passed';
} catch (error) { result.status = 'failed'; result.error = String(error); result.stack = error.stack; throw error; }
finally { result.endedAt = new Date().toISOString(); save(); }
console.log(`FINAL_VALIDATION_COMPLETE ${directory}`);
