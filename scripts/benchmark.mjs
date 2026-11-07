import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { distribution } from '../src/bench/statistics.ts';

const args = new Map(process.argv.slice(2).map(arg => { const [key, value = 'true'] = arg.replace(/^--/, '').split('='); return [key, value]; }));
const smoke = args.has('smoke'), seed = Number(args.get('seed') ?? 539365639);
const sizes = (args.get('sizes') ?? (smoke ? '10' : '10,100,1000,10000')).split(',').map(Number);
const sessions = Number(args.get('sessions') ?? (smoke ? 1 : 3));
const tag = args.get('tag') ?? `${smoke ? 'smoke' : 'full'}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
if (!/^[a-zA-Z0-9_-]+$/.test(tag) || !Number.isInteger(sessions) || sessions < 1 || !Number.isInteger(seed) || sizes.some(n => !Number.isInteger(n) || n < 2 || n > 10000)) throw new Error('Invalid benchmark arguments');
const outputDir = path.resolve('docs/bench', tag), temporary = path.resolve('.validation/benchmark', tag);
if (existsSync(outputDir)) throw new Error(`Refusing to overwrite existing benchmark ${outputDir}`);
mkdirSync(outputDir, { recursive: true }); mkdirSync(temporary, { recursive: true });
const command = (name, parameters) => { try { return execFileSync(name, parameters, { encoding: 'utf8', windowsHide: true }).trim(); } catch (error) { return `unavailable: ${error.message}`; } };
const sources = Object.fromEntries(readdirSync('src', { recursive: true }).filter(name => name.endsWith('.ts')).sort().map(name => [name.replaceAll('\\', '/'), createHash('sha256').update(readFileSync(path.join('src', name))).digest('hex')]));
const environment = { startedAt: new Date().toISOString(), smoke, seed, sessions, sizes, buildMode: 'production vite preview',
  codeCommit: command('git', ['rev-parse', 'HEAD']), branch: command('git', ['branch', '--show-current']), workingTreeStatus: command('git', ['status', '--short']),
  sourceSha256: sources, node: process.version, os: { platform: os.platform(), release: os.release(), version: os.version(), arch: os.arch() },
  cpu: os.cpus()[0]?.model, logicalCPUs: os.cpus().length, ramBytes: os.totalmem(),
  powerScheme: process.platform === 'win32' ? command('powercfg', ['/getactivescheme']) : 'not queried',
  headless: true, viewport: { width: 1280, height: 900 }, timingDetailTrace: false, timingInspector: false,
  resetPolicy: 'dispose and recreate old DOM before every variant/sample; fixtures/reset/oracle outside measured intervals',
  intervals: { captureMs: 'standalone capture of seeded old DOM, keyed axis only; excluded from flush', renderMs: 'root + child resolve, runtime axes only', diffMs: 'prepared VDOM to plan including validation', commitMs: 'plan preflight + host writes; no later browser paint', flushMs: 'FIFO processing through commit completion; effects excluded', effectMs: 'cleanup/setup loop', scheduledCycleMs: 'enqueue through next microtask for runtime axes; diff+commit for keyed; no paint claim' },
  repetitions: { normal: { warmup: smoke ? 1 : 20, samples: smoke ? 3 : 100 }, stress: { warmup: smoke ? 1 : 5, samples: smoke ? 3 : 30 } },
  scope: 'keyed: all 11 presets; batching: three pure +1 actions; reuse: one unrelated root update with stable memo expression; both payloads at each size',
  flags: 'visibility and focus recorded per run; OS load/power changes cannot be completely controlled; background samples are retained and flagged',
};
writeFileSync(path.join(outputDir, 'environment.json'), JSON.stringify(environment, null, 2));
function random(value) { let state = value >>> 0 || 1; return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x100000000; }; }
const scenarios = ['noop', 'one-change', 'prepend', 'delete-middle', 'last-to-front', 'first-to-back', 'reverse', 'adjacent', 'swap-ends', 'shuffle', 'mixed'];
const groups = new Map(), countRows = [];
function collect(row) {
  if (row.sampleKind === 'counts') { countRows.push(row); return; }
  if (row.sampleKind !== 'sample') return;
  for (const [metric, value] of Object.entries(row.timings)) {
    const key = [row.session, row.input.axis, row.input.size, row.input.payload, row.input.scenario, row.input.variant, metric].join(',');
    if (!groups.has(key)) groups.set(key, { values: [], hidden: 0, unfocused: 0 });
    const group = groups.get(key); group.values.push(value); if (row.visibility !== 'visible') group.hidden++; if (!row.focused) group.unfocused++;
  }
}
const server = await preview({ preview: { host: '127.0.0.1', port: 4175, strictPort: true } });
try {
  for (let session = 1; session <= sessions; session++) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: environment.viewport });
    const page = await context.newPage(); await page.goto('http://127.0.0.1:4175/benchmark.html'); await page.bringToFront();
    await page.waitForFunction(() => !!window.miniReactBenchmark);
    const sessionEnvironment = { session, browser: await browser.version(), startedAt: new Date().toISOString(), userAgent: await page.evaluate(() => navigator.userAgent) };
    const rawPath = path.join(temporary, `session-${session}.jsonl`), next = random(seed ^ session);
    writeFileSync(rawPath, '');
    console.log(`session ${session}/${sessions} Chromium ${sessionEnvironment.browser}`);
    try {
      for (const size of sizes) for (const payload of ['light', 'stateful']) for (const axis of ['keyed', 'batching', 'reuse']) {
        for (const scenario of axis === 'keyed' ? scenarios : ['noop']) {
          const variants = axis === 'keyed' ? ['greedy', 'lis'] : axis === 'batching' ? ['sync', 'microtask'] : ['off', 'on'];
          const policy = size === 10000 ? environment.repetitions.stress : environment.repetitions.normal;
          const start = Date.now();
          for (let index = -policy.warmup - 1; index < policy.samples; index++) {
            const sampleKind = index === -policy.warmup - 1 ? 'counts' : index < 0 ? 'warmup' : 'sample';
            const order = next() < .5 ? [...variants] : [...variants].reverse();
            for (const [orderPosition, variant] of order.entries()) {
              const input = { axis, size, payload, scenario, seed, variant, mode: sampleKind === 'counts' ? 'counts' : 'timing' };
              let result;
              try { result = await page.evaluate(input => window.miniReactBenchmark.run(input), input); }
              catch (error) { writeFileSync(path.join(outputDir, `failure-session-${session}.json`), JSON.stringify({ input, session, index, error: String(error), environment: sessionEnvironment }, null, 2)); throw error; }
              const row = { session, sampleKind, index, orderPosition, ...result }; appendFileSync(rawPath, `${JSON.stringify(row)}\n`); collect(row);
            }
          }
          console.log(`session ${session} ${axis}/${payload}/${size}/${scenario} verified ${(Date.now() - start) / 1000}s`);
        }
      }
    } finally { sessionEnvironment.endedAt = new Date().toISOString(); await browser.close(); }
    writeFileSync(path.join(outputDir, `session-${session}.jsonl.gz`), gzipSync(readFileSync(rawPath)));
    writeFileSync(path.join(outputDir, `session-${session}.json`), JSON.stringify(sessionEnvironment, null, 2));
  }
  const summary = [...groups].map(([key, group]) => ({ key, ...distribution(group.values), hidden: group.hidden, unfocused: group.unfocused }));
  writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2));
  writeFileSync(path.join(outputDir, 'counts.json'), JSON.stringify(countRows, null, 2));
  const header = 'session,axis,size,payload,scenario,variant,metric,n,median,q1,q3,iqr,p95,min,max,hidden,unfocused\n';
  writeFileSync(path.join(outputDir, 'summary.csv'), header + summary.map(row => [row.key, row.n, row.median, row.q1, row.q3, row.iqr, row.p95, row.min, row.max, row.hidden, row.unfocused].join(',')).join('\n'));
  environment.endedAt = new Date().toISOString(); environment.status = 'passed'; environment.countRuns = countRows.length;
  environment.measuredValues = summary.reduce((sum, group) => sum + group.n, 0);
  writeFileSync(path.join(outputDir, 'environment.json'), JSON.stringify(environment, null, 2));
  console.log(`BENCHMARK_COMPLETE ${outputDir}`);
} finally { await new Promise(resolve => server.httpServer.close(resolve)); }
