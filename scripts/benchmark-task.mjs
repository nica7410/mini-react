import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import os from 'node:os';

const args = new Map(process.argv.slice(2).map(arg => { const [key, value = 'true'] = arg.replace(/^--/, '').split('='); return [key, value]; }));
const tag = args.get('tag'), tags = (args.get('builds') ?? '').split(','), smoke = args.has('smoke');
// 10,000-item runs are stress tests and are off unless explicitly allowed (user policy 2026-11-09).
const allow10000 = args.get('allow-10000') === 'true';
const sizes = (args.get('sizes') ?? (smoke ? '10' : '10,100,1000')).split(',').map(Number);
// Wall-clock cap: checked before each build/condition. On expiry the run stops, keeps raw data, and starts nothing else.
const maxMinutes = Number(args.get('max-minutes') ?? 60), deadline = Date.now() + maxMinutes * 60000;
const workloads = (args.get('workloads') ?? 'draft,counter,search,filter,sort,move,crud,dirty,equal').split(',');
const regimes = (args.get('regimes') ?? 'persistent,fresh').split(',');
const sessions = Number(args.get('sessions') ?? (smoke ? 1 : 3)), supplement = args.has('supplement');
assert(tag && [tag, ...tags].every(value => /^[a-z0-9-]+$/.test(value)) && new Set(tags).size === tags.length && tags.length <= 8);
assert(sizes.every(size => [10, 100, 1000, 10000].includes(size)) && new Set(sizes).size === sizes.length);
assert(allow10000 || !sizes.includes(10000), '10,000-item runs need explicit --allow-10000');
assert(Number.isFinite(maxMinutes) && maxMinutes > 0, '--max-minutes must be positive');
assert(workloads.every(value => ['draft', 'counter', 'search', 'filter', 'sort', 'move', 'crud', 'dirty', 'equal'].includes(value)));
assert(regimes.every(value => ['persistent', 'fresh'].includes(value)) && Number.isInteger(sessions) && sessions >= 1);
const output = `docs/bench/${tag}`, temporary = `.validation/task-runs/${tag}`;
assert(!existsSync(output) && !existsSync(temporary), 'Preserve existing run');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const builds = tags.map(tag => JSON.parse(readFileSync(`.validation/task-builds/${tag}/manifest.json`)));
assert(builds.every(build => build.harnessHash === builds[0].harnessHash && build.dependencyHash === builds[0].dependencyHash));
const assets = new Map(), archive = { schemaVersion: 1, builds: [] };
for (const build of builds) {
  const files = {};
  for (const [file, hash] of Object.entries(build.artifacts)) {
    const data = readFileSync(`.validation/task-builds/${build.tag}/dist/${file}`); assert.equal(sha(data), hash);
    files[file] = data.toString('base64'); assets.set(`/${build.tag}/${file}`, data);
  }
  archive.builds.push({ manifest: build, files });
}
mkdirSync(output, { recursive: true }); mkdirSync(temporary, { recursive: true });
writeFileSync(`${output}/builds.json.gz`, gzipSync(JSON.stringify(archive)));
for (const build of builds) copyFileSync(`.validation/task-builds/${build.tag}/sources.json.gz`, `${output}/${build.tag}.sources.json.gz`);
const environment = { startedAt: new Date().toISOString(), status: 'running', smoke, supplement, sessions, sizes, workloads, regimes, maxMinutes,
  builds, seed: 539365639, runnerCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  runnerSha256: sha(readFileSync('scripts/benchmark-task.mjs')), planSha256: sha(readFileSync('docs/task-app-comparison-plan.md')),
  node: process.version, cpu: os.cpus()[0]?.model, logicalCPUs: os.cpus().length, ramBytes: os.totalmem(),
  os: { platform: os.platform(), release: os.release(), version: os.version(), arch: os.arch() },
  headless: true, viewport: { width: 1280, height: 900 }, port: 4178,
  repetitions: { persistent: { warmup: smoke ? 1 : 10, stressWarmup: smoke ? 1 : 5, samples: smoke ? 2 : supplement ? 180 : 60 },
    fresh: { warmup: smoke ? 1 : 3, samples: smoke ? 2 : supplement ? 180 : 30 } },
  policy: 'Actual TaskApp, initial data through existing root setters. Real 40ms sync Effect kept. Fresh browser per variant/condition/session; independent counts realm; timing holds one app per persistent condition or mounts anew per fresh sample. Rotated/reversed variant order. No heavy tracing, retry, outlier removal or concurrent test/build. Every action has full State/DOM/form/identity/focus/Effect oracle.',
  intervals: { primaryMs: 'Real event/enqueue to primary flush+Effect followed by microtask; includes root expression/VDOM generation',
    totalCpuMs: 'primaryMs + disjoint async follow-up flushMs/effectMs; excludes the deliberate timer delay and oracle',
    settledMs: 'Real event/enqueue through actual 40ms Effect follow-up; excludes oracle',
    expressionMs: 'root TaskApp expression construction, nested within renderMs', vdomMs: 'renderMs minus expressionMs; includes child evaluation, VDOM normalization and validation',
    initialization: 'Default real app mount, initial data injection and actual sync follow-up, CPU and elapsed stored separately',
    lifecycleCpuMs: 'Initialization CPU plus all successive updates including warm-up; report amortization separately from steady-state distributions',
    warning: 'Do not add nested phases. No paint claim. Fresh counts/timing are separate realms. Native value preparation/focus setup/model/oracle are outside primary interval.' },
};
writeFileSync(`${output}/environment.json`, JSON.stringify(environment, null, 2));
const server = createServer((req, res) => {
  const filename = new URL(req.url, 'http://localhost').pathname, data = assets.get(filename);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', filename.endsWith('.html') ? 'text/html; charset=utf-8' : filename.endsWith('.css') ? 'text/css' : 'text/javascript');
  res.writeHead(data ? 200 : 404); res.end(data ?? 'Not found');
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(environment.port, '127.0.0.1', resolve); });
async function bounded(promise, ms = 120000) {
  let timer; try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Deadline ${ms}ms; abort without retry`)), ms); })]); }
  finally { clearTimeout(timer); }
}
try {
  for (let session = 1; session <= sessions; session++) {
    // The cap is checked between sessions and before each build/condition; a started condition runs to its end.
    if (Date.now() > deadline) throw Object.assign(new Error(`Time cap ${maxMinutes} min reached before session ${session}; stopped without follow-up`), { deadline: true });
    const raw = `${temporary}/session-${session}.jsonl`, metadata = { session, startedAt: new Date().toISOString(), processes: [] };
    writeFileSync(raw, '');
    const conditions = sizes.flatMap(size => regimes.flatMap(regime => workloads.filter(workload => regime === 'persistent' || workload === 'equal').map(workload => ({ size, regime, workload }))));
    if (session % 2 === 0) conditions.reverse();
    try {
      for (const [condition, item] of conditions.entries()) {
        const offset = (condition + session - 1) % builds.length;
        const order = [...builds.slice(offset), ...builds.slice(0, offset)]; if (session % 2 === 0) order.reverse();
        for (const [orderPosition, build] of order.entries()) {
          if (Date.now() > deadline) throw Object.assign(new Error(`Time cap ${maxMinutes} min reached; stopped without follow-up`), { deadline: true });
          const processInfo = { ...item, build: build.tag, orderPosition, startedAt: new Date().toISOString() }; metadata.processes.push(processInfo);
          const browserServer = await chromium.launchServer({ headless: true, host: '127.0.0.1', timeout: 30000 }); processInfo.pid = browserServer.process().pid;
          let lastInput;
          try {
            const browser = await chromium.connect(browserServer.wsEndpoint()); processInfo.browser = browser.version();
            async function pageForMode(mode) {
              const context = await browser.newContext({ viewport: environment.viewport }); const page = await context.newPage();
              await bounded(page.goto(`http://127.0.0.1:${environment.port}/${build.tag}/task-bench.html`), 30000);
              await page.waitForFunction(() => !!window.taskBenchmark); await page.bringToFront();
              return { context, page, input: { size: item.size, seed: environment.seed, mode } };
            }
            async function setup(page, input) { lastInput = { action: 'setup', input }; return bounded(page.evaluate(input => window.taskBenchmark.setup(input), input)); }
            async function step(page, index) { lastInput = { action: 'step', ...item, index }; return bounded(page.evaluate(({ workload, index }) => window.taskBenchmark.step(workload, index), { workload: item.workload, index })); }
            const base = { session, ...item, build: build.tag, orderPosition };
            const write = row => appendFileSync(raw, JSON.stringify({ ...base, ...row }) + '\n');
            const counted = await pageForMode('counts');
            const countedInit = await setup(counted.page, counted.input), countedStep = await step(counted.page, 0);
            await counted.page.evaluate(() => window.taskBenchmark.dispose()); await counted.context.close();
            write({ sampleKind: 'counts', index: 0, initialization: countedInit, result: countedStep, disposed: true });
            const timed = await pageForMode('timing');
            const policy = environment.repetitions[item.regime];
            const warmup = item.regime === 'persistent' && item.size === 10000 ? policy.stressWarmup : policy.warmup;
            let init = null, lifecycleCpuMs = 0, updateCount = 0;
            if (item.regime === 'persistent') {
              init = await setup(timed.page, timed.input); lifecycleCpuMs = init.cpuMs;
              write({ sampleKind: 'initialization', index: null, initialization: init });
            }
            for (let index = -warmup; index < policy.samples; index++) {
              if (item.regime === 'fresh') { init = await setup(timed.page, timed.input); lifecycleCpuMs = init.cpuMs; updateCount = 0; }
              const result = await step(timed.page, index); lifecycleCpuMs += result.totalCpuMs; updateCount++;
              if (item.regime === 'fresh') await timed.page.evaluate(() => window.taskBenchmark.dispose());
              write({ sampleKind: index < 0 ? 'warmup' : 'sample', index, initialization: item.regime === 'fresh' ? init : null,
                result, lifecycleCpuMs, updateCount, amortizedCpuMs: lifecycleCpuMs / updateCount });
              if (item.size === 10000 && index >= 0 && (index + 1) % 20 === 0) console.log(`S${session} ${item.regime}/${item.workload}/${item.size} ${build.tag} ${index + 1}/${policy.samples}`);
            }
            await timed.page.evaluate(() => window.taskBenchmark.dispose()); await timed.context.close(); processInfo.disposed = true; processInfo.status = 'passed';
            console.log(`S${session} ${item.regime}/${item.workload}/${item.size} ${build.tag} PASS`);
          } catch (error) {
            processInfo.status = 'failed'; processInfo.error = String(error);
            writeFileSync(`${output}/failure.json`, JSON.stringify({ session, processInfo, lastInput, error: String(error), stack: error.stack }, null, 2)); throw error;
          } finally { processInfo.endedAt = new Date().toISOString(); await browserServer.kill(); }
        }
      }
    } finally {
      metadata.endedAt = new Date().toISOString(); writeFileSync(`${output}/session-${session}.json`, JSON.stringify(metadata, null, 2));
      writeFileSync(`${output}/session-${session}.jsonl.gz`, gzipSync(readFileSync(raw)));
    }
  }
  environment.status = 'passed'; console.log(`TASK_COMPLETE ${output}`);
} catch (error) { environment.status = error.deadline ? 'stopped-deadline' : 'failed'; environment.error = String(error); if (error.deadline) environment.stoppedAt = new Date().toISOString(); if (!error.deadline) throw error; console.log(`TASK_STOPPED ${output}`); process.exitCode = 3; }
finally { environment.endedAt = new Date().toISOString(); writeFileSync(`${output}/environment.json`, JSON.stringify(environment, null, 2)); await new Promise(resolve => server.close(resolve)); }
