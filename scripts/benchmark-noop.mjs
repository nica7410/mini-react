import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { distribution } from '../src/bench/statistics.ts';

const args = new Map(process.argv.slice(2).map(arg => { const [key, value = 'true'] = arg.replace(/^--/, '').split('='); return [key, value]; }));
const smoke = args.has('smoke'), profiled = args.has('profile');
const tags = (args.get('builds') ?? '').split(',');
const tag = args.get('tag'), sessions = Number(args.get('sessions') ?? (smoke || profiled ? 1 : 3));
// 10,000-item runs are stress tests and are off unless explicitly allowed (user policy 2026-11-09).
const allow10000 = args.get('allow-10000') === 'true';
const sizes = (args.get('sizes') ?? (smoke ? '10' : '10,100,1000')).split(',').map(Number);
if (!allow10000 && sizes.includes(10000)) throw new Error('10,000-item runs need explicit --allow-10000');
const payloads = (args.get('payloads') ?? 'light,stateful').split(',');
const allPaths = ['same-ref', 'equal-fresh', 'memo-unrelated', 'dirty-controlled', 'reorder', 'form-update'];
const paths = (args.get('paths') ?? allPaths.join(',')).split(',');
const seed = 539365639;
if (!tag || ![tag, ...tags].every(value => /^[a-z0-9-]+$/.test(value)) || tags.length > 2 || new Set(tags).size !== tags.length
  || !Number.isInteger(sessions) || sessions < 1 || sizes.some(n => ![10, 100, 1000, 10000].includes(n))
  || payloads.some(p => !['light', 'stateful'].includes(p)) || paths.some(p => !allPaths.includes(p))) throw new Error('Invalid tag/builds/selection');
const output = `docs/bench/${tag}`, temporary = `.validation/noop-runs/${tag}`;
if (existsSync(output)) throw new Error(`Preserve existing run: ${output}`);
const builds = tags.map(tag => JSON.parse(readFileSync(`.validation/noop-builds/${tag}/manifest.json`)));
if (builds.some(build => build.profiled !== profiled || build.harnessHash !== builds[0].harnessHash)) throw new Error('Instrumentation or harness mismatch');
const assets = new Map();
for (const build of builds) for (const [file, hash] of Object.entries(build.artifacts)) {
  const data = readFileSync(file);
  if (createHash('sha256').update(data).digest('hex') !== hash) throw new Error(`Build changed: ${file}`);
  assets.set(`/${build.tag}/${file.split(`/noop-builds/${build.tag}/`)[1]}`, data);
}
mkdirSync(output, { recursive: true }); mkdirSync(temporary, { recursive: true });
const environment = { startedAt: new Date().toISOString(), smoke, profiled, sessions, sizes, payloads, paths, seed, builds,
  runnerCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), runnerSha256: createHash('sha256').update(readFileSync('scripts/benchmark-noop.mjs')).digest('hex'),
  node: process.version, os: { platform: os.platform(), release: os.release(), version: os.version(), arch: os.arch() },
  cpu: os.cpus()[0]?.model, logicalCPUs: os.cpus().length, ramBytes: os.totalmem(),
  headless: true, viewport: { width: 1280, height: 900 }, port: 4177,
  repetitions: { normal: { warmup: smoke || profiled ? 1 : 20, samples: smoke || profiled ? 3 : 100 }, stress: { warmup: smoke || profiled ? 1 : 5, samples: smoke || profiled ? 3 : 30 } },
  intervals: { expressionMs: 'Core target expression + VDOM creation, separate from cycle; runtime uses renderMs',
    renderMs: 'runtime root/child expression evaluation and VDOM validation', diffMs: 'prepared VDOM to plan including validation', commitMs: 'preflight + host + focus',
    flushMs: 'FIFO to commit end, excludes effects; core diff+commit', effectMs: 'runtime Effect cleanup/setup',
    scheduledCycleMs: 'core diff+commit; runtime enqueue to next microtask. No paint. Do not add nested intervals.' },
  policy: 'fresh Chromium per condition/session; separate page/module realms per build; balanced alternating paired order with seeded initial direction; bring measured page to front; fresh mount/DOM every sample; reset/fixture/oracle outside cycle; counts separate; no profiler/Trace/Inspector in timing; no retries/outlier removal; preserve partial on failure',
  dirtyInput: 'one controlled input outside rows, live value and dirty map seeded before same-State setter; native event ordering verified in browser tests',
};
writeFileSync(`${output}/environment.json`, JSON.stringify(environment, null, 2));
const server = createServer((req, res) => {
  const data = assets.get(new URL(req.url, 'http://localhost').pathname);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', req.url.endsWith('.html') ? 'text/html; charset=utf-8' : req.url.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
  res.writeHead(data ? 200 : 404); res.end(data ?? 'Not found');
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4177, '127.0.0.1', resolve); });
const groups = new Map(), counts = [];
function collect(row) {
  if (row.sampleKind === 'counts') { counts.push(row); return; }
  if (row.sampleKind !== 'sample') return;
  for (const [metric, value] of Object.entries(row.timings)) {
    const key = [row.session, row.input.path, row.input.size, row.input.payload, row.build, metric].join(',');
    if (!groups.has(key)) groups.set(key, { values: [], hidden: 0, unfocused: 0 });
    const group = groups.get(key); group.values.push(value);
    if (row.visibility !== 'visible') group.hidden++;
    if (!row.focused) group.unfocused++;
  }
}
async function bounded(promise, ms = 120000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Operation exceeded ${ms}ms; abort without retry`)), ms); })]); }
  finally { clearTimeout(timer); }
}
try {
  for (let session = 1; session <= sessions; session++) {
    const metadata = { session, startedAt: new Date().toISOString(), processes: [] };
    const raw = `${temporary}/session-${session}.jsonl`; writeFileSync(raw, '');
    let condition = 0;
    try {
      // Rotate traversal between sessions; do not pool sessions as one distribution.
      const conditions = sizes.flatMap(size => payloads.flatMap(payload => paths.map(path => ({ size, payload, path }))));
      if (session % 2 === 0) conditions.reverse();
      for (const item of conditions) {
        const processInfo = { ...item, startedAt: new Date().toISOString() }; metadata.processes.push(processInfo);
        const browserServer = await chromium.launchServer({ headless: true, host: '127.0.0.1', timeout: 30000 });
        processInfo.pid = browserServer.process().pid;
        try {
          const browser = await chromium.connect(browserServer.wsEndpoint(), { timeout: 30000 }); processInfo.browser = browser.version();
          const pages = new Map();
          for (const build of builds) {
            const page = await bounded((async () => {
              const context = await browser.newContext({ viewport: environment.viewport }); const page = await context.newPage();
              await page.goto(`http://127.0.0.1:4177/${build.tag}/noop.html`);
              await page.waitForFunction(() => !!window.noopBenchmark); return page;
            })(), 30000);
            pages.set(build.tag, page);
          }
          const policy = item.size === 10000 ? environment.repetitions.stress : environment.repetitions.normal;
          for (let index = -policy.warmup - 1; index < policy.samples; index++) {
            const sampleKind = index === -policy.warmup - 1 ? 'counts' : index < 0 ? 'warmup' : 'sample';
            const order = (seed ^ session ^ condition ^ index) & 1 ? [...tags].reverse() : tags;
            for (const [orderPosition, build] of order.entries()) {
              const input = { ...item, seed, mode: profiled ? 'profile' : sampleKind === 'counts' ? 'counts' : 'timing' };
              const page = pages.get(build); await page.bringToFront();
              let result;
              try { result = await bounded(page.evaluate(input => window.noopBenchmark.run(input), input)); }
              catch (error) {
                writeFileSync(`${output}/failure-session-${session}.json`, JSON.stringify({ input, build, index, sampleKind, error: String(error), processInfo }, null, 2));
                throw error;
              }
              const row = { session, sampleKind, index, orderPosition, build, ...result };
              appendFileSync(raw, `${JSON.stringify(row)}\n`); collect(row);
            }
          }
          processInfo.status = 'passed'; condition++;
          console.log(`S${session} ${item.path}/${item.payload}/${item.size} PASS`);
        } finally { processInfo.endedAt = new Date().toISOString(); await browserServer.kill(); }
      }
    } finally {
      metadata.endedAt = new Date().toISOString();
      writeFileSync(`${output}/session-${session}.json`, JSON.stringify(metadata, null, 2));
      writeFileSync(`${output}/session-${session}.jsonl.gz`, gzipSync(readFileSync(raw)));
    }
  }
  const summary = [...groups].map(([key, group]) => ({ key, ...distribution(group.values), hidden: group.hidden, unfocused: group.unfocused }));
  writeFileSync(`${output}/summary.json`, JSON.stringify(summary, null, 2));
  writeFileSync(`${output}/counts.json`, JSON.stringify(counts, null, 2));
  writeFileSync(`${output}/summary.csv`, 'session,path,size,payload,build,metric,n,median,q1,q3,iqr,p95,min,max,hidden,unfocused\n' + summary.map(row => [row.key, row.n, row.median, row.q1, row.q3, row.iqr, row.p95, row.min, row.max, row.hidden, row.unfocused].join(',')).join('\n'));
  environment.status = 'passed'; console.log(`NOOP_COMPLETE ${output}`);
} catch (error) { environment.status = 'failed'; environment.error = String(error); throw error; }
finally {
  environment.endedAt = new Date().toISOString(); writeFileSync(`${output}/environment.json`, JSON.stringify(environment, null, 2));
  await new Promise(resolve => server.close(resolve));
}
