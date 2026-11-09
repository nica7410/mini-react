// Diagnostic only: instrument separate copies, never the accepted timing bundles.
import assert from 'node:assert/strict';
import { build } from 'vite';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const tag = process.argv[2];
// This diagnostic is fixed at 10,000 items; it is off unless explicitly allowed (user policy 2026-11-09).
assert(process.argv.includes('--allow-10000'), '10,000-item diagnostics need explicit --allow-10000');
assert(tag && /^[a-z0-9-]+$/.test(tag), 'Usage: node scripts/diagnose-noop-tails.mjs unique-tag');
const cpuProfile = process.argv.includes('--cpu');
const paths = (process.argv.find(arg => arg.startsWith('--paths='))?.slice(8) ?? 'form-update,reorder').split(',');
assert(paths.length && paths.every(item => ['form-update', 'reorder'].includes(item)) && new Set(paths).size === paths.length);
const output = `docs/bench/${tag}`, temporary = `.validation/noop-tail/${tag}`;
assert(!existsSync(output) && !existsSync(temporary), 'Preserve existing diagnostic');
const full = JSON.parse(readFileSync('docs/bench/noop-full/environment.json'));
assert.equal(full.status, 'passed', 'Run only AFTER the accepted timing run finishes');
mkdirSync(output, { recursive: true }); mkdirSync(temporary, { recursive: true });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(`${directory}/${item.name}`) : [`${directory}/${item.name}`]);
const metadata = { startedAt: new Date().toISOString(), status: 'running', diagnosticOnly: true, cpuProfile, paths,
  sourceRun: 'noop-full', scriptSha256: sha(readFileSync('scripts/diagnose-noop-tails.mjs')),
  policy: 'Separate production builds with cycle/generation User Timing marks; CDP V8/GC tracing. Optional CPU sampling uses unminified copies for function names. NOT speed-comparison data. Five warmups and thirty samples, paired alternating order, fresh browser per condition, original harness oracle and cleanup.',
  categories: 'v8,devtools.timeline,blink.user_timing,disabled-by-default-v8.gc', builds: [], processes: [] };
const assets = new Map();
for (const original of full.builds) {
  const root = path.resolve(`${temporary}/${original.tag}`);
  const sources = { ...original.engineSources, ...original.harnessSources };
  for (const [file, hash] of Object.entries(sources)) {
    if (!file.startsWith('src/') && file !== 'noop.html') continue;
    const data = execFileSync('git', ['show', `${original.commit}:${file}`], { maxBuffer: 8 * 1024 * 1024 });
    assert.equal(sha(data), hash, `Archived source mismatch: ${original.tag}/${file}`);
    const target = path.join(root, file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, data);
  }
  let instrumented = false;
  await build({ root, configFile: false, base: './', logLevel: 'warn', plugins: [{ name: 'diagnostic-cycle-marks', enforce: 'pre', transform(source, id) {
    if (!id.replaceAll('\\', '/').endsWith('/src/bench/noop.ts')) return;
    const before = 'const start = performance.now();\n    if (runtime) {';
    const after = 'timings.scheduledCycleMs = performance.now() - start; collecting = false;';
    const generationStart = 'const start = performance.now();\n      target =';
    const generationEnd = 'generationProfile = profile.rows; profile.reset(false);';
    for (const marker of [before, after, generationStart, generationEnd]) assert.equal(source.split(marker).length, 2, `Trace boundary changed: ${marker}`);
    source = source.replace(before, "performance.mark(window.__noopTraceId + ':cycle:start');\n    " + before)
      .replace(after, after + " performance.mark(window.__noopTraceId + ':cycle:end');")
      .replace(generationStart, "performance.mark(window.__noopTraceId + ':generation:start');\n      " + generationStart)
      .replace(generationEnd, "performance.mark(window.__noopTraceId + ':generation:end'); " + generationEnd);
    instrumented = true; return source;
  } }], build: { outDir: 'dist', emptyOutDir: false, minify: cpuProfile ? false : 'oxc', sourcemap: false, rollupOptions: { input: path.join(root, 'noop.html') } } });
  assert(instrumented);
  const artifacts = {};
  for (const file of files(`${root}/dist`)) {
    const data = readFileSync(file), relative = path.relative(`${root}/dist`, file).replaceAll('\\', '/');
    artifacts[relative] = sha(data); assets.set(`/${original.tag}/${relative}`, data);
  }
  metadata.builds.push({ tag: original.tag, commit: original.commit, originalEngineHash: original.engineHash, originalHarnessHash: original.harnessHash, artifacts });
}
const server = createServer((req, res) => {
  const data = assets.get(new URL(req.url, 'http://localhost').pathname);
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', req.url.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript');
  res.writeHead(data ? 200 : 404); res.end(data ?? 'Not found');
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4177, '127.0.0.1', resolve); });
async function bounded(promise, ms = 120000) {
  let timer; try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Diagnostic deadline ${ms}ms; no retry`)), ms); })]); }
  finally { clearTimeout(timer); }
}
async function saveTrace(cdp, file) {
  const done = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.end'); const { stream } = await bounded(done); const chunks = [];
  try {
    while (true) { const part = await cdp.send('IO.read', { handle: stream }); chunks.push(Buffer.from(part.data, part.base64Encoded ? 'base64' : 'utf8')); if (part.eof) break; }
    writeFileSync(file, gzipSync(Buffer.concat(chunks)));
  } finally { await cdp.send('IO.close', { handle: stream }); }
}
try {
  for (const [condition, operation] of paths.entries()) {
    const processInfo = { path: operation, startedAt: new Date().toISOString() }; metadata.processes.push(processInfo);
    const browserServer = await chromium.launchServer({ headless: true, host: '127.0.0.1', timeout: 30000 });
    processInfo.pid = browserServer.process().pid;
    try {
      const browser = await chromium.connect(browserServer.wsEndpoint()); processInfo.browser = browser.version();
      const pages = new Map();
      for (const original of full.builds) {
        const page = await browser.newPage({ viewport: full.viewport }); await page.goto(`http://127.0.0.1:4177/${original.tag}/noop.html`);
        await page.waitForFunction(() => !!window.noopBenchmark); pages.set(original.tag, page);
      }
      const profilers = new Map();
      if (cpuProfile) for (const [build, page] of pages) {
        const profiler = await page.context().newCDPSession(page);
        await profiler.send('Profiler.enable'); await profiler.send('Profiler.setSamplingInterval', { interval: 1000 });
        await profiler.send('Profiler.start'); profilers.set(build, profiler);
      }
      const cdp = await browser.newBrowserCDPSession();
      await cdp.send('Tracing.start', { categories: metadata.categories, transferMode: 'ReturnAsStream', options: 'record-until-full' });
      try {
        for (let index = -5; index < 30; index++) {
          const order = (full.seed ^ condition ^ index) & 1 ? [...full.builds].reverse() : full.builds;
          for (const [orderPosition, original] of order.entries()) {
            const page = pages.get(original.tag); await page.bringToFront();
            const id = `${operation}:${original.tag}:${index}`;
            const input = { path: operation, size: 10000, payload: 'stateful', mode: 'timing', seed: full.seed };
            const result = await bounded(page.evaluate(async ({ id, input }) => {
              window.__noopTraceId = id; return window.noopBenchmark.run(input);
            }, { id, input }));
            appendFileSync(`${temporary}/${operation}.jsonl`, JSON.stringify({ id, index, sampleKind: index < 0 ? 'warmup' : 'sample', build: original.tag, orderPosition, ...result }) + '\n');
          }
        }
        processInfo.status = 'passed'; console.log(`TAIL_DIAGNOSTIC ${operation} PASS`);
      } finally {
        await saveTrace(cdp, `${output}/${operation}.trace.json.gz`);
        for (const [build, profiler] of profilers) {
          const result = await profiler.send('Profiler.stop');
          writeFileSync(`${output}/${operation}-${build}.cpuprofile.json.gz`, gzipSync(JSON.stringify(result.profile)));
        }
      }
    } finally {
      processInfo.endedAt = new Date().toISOString(); await browserServer.kill();
      const raw = `${temporary}/${operation}.jsonl`; if (existsSync(raw)) writeFileSync(`${output}/${operation}.jsonl.gz`, gzipSync(readFileSync(raw)));
    }
  }
  metadata.status = 'passed';
} catch (error) { metadata.status = 'failed'; metadata.error = String(error); throw error; }
finally {
  metadata.endedAt = new Date().toISOString(); writeFileSync(`${output}/environment.json`, JSON.stringify(metadata, null, 2));
  await new Promise(resolve => server.close(resolve));
}
