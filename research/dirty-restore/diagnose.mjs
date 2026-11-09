// Short, separate diagnostic run for persistent/dirty/100 (never used as formal timing).
// Builds must carry diag-instrumentation.patch. Phase clocks are read only at phase boundaries.
// Usage: node research/dirty-restore/diagnose.mjs --out=docs/bench/<dir> --builds=a,b [--samples=60] [--loop=300]
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const args = new Map(process.argv.slice(2).map(arg => { const [k, v = 'true'] = arg.replace(/^--/, '').split('='); return [k, v]; }));
const out = args.get('out'), tags = args.get('builds').split(','), samples = Number(args.get('samples') ?? 60), loop = Number(args.get('loop') ?? 300);
const rounds = Number(args.get('rounds') ?? 2), warmup = 10, seed = 539365639, size = 100, port = 4180;
assert(out && !existsSync(out) && tags.length >= 1);
const sha = data => createHash('sha256').update(data).digest('hex');
const assets = new Map(), builds = tags.map(tag => JSON.parse(readFileSync(`.validation/task-builds/${tag}/manifest.json`)));
for (const build of builds) {
  assert(build.patches?.some(p => p.file.endsWith('diag-instrumentation.patch')), `${build.tag} is not a diagnostic build`);
  for (const [file, hash] of Object.entries(build.artifacts)) {
    const data = readFileSync(`.validation/task-builds/${build.tag}/dist/${file}`); assert.equal(sha(data), hash); assets.set(`/${build.tag}/${file}`, data);
  }
}
mkdirSync(out, { recursive: true });
const server = createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname, data = assets.get(name);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.css') ? 'text/css' : 'text/javascript');
  res.writeHead(data ? 200 : 404); res.end(data ?? 'Not found');
});
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
const result = { startedAt: new Date().toISOString(), node: process.version, size, seed, warmup, samples, loop, rounds,
  builds: builds.map(b => ({ tag: b.tag, engineHash: b.engineHash, appHash: b.appHash, patches: b.patches, artifacts: b.artifacts })), runs: [] };
try {
  for (let round = 0; round < rounds; round++) {
    const order = round % 2 ? [...builds].reverse() : builds;
    for (const build of order) {
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await context.newPage();
        await page.addInitScript(() => { window.__drDiag = { enabled: false, t: {}, n: {} }; });
        await page.goto(`http://127.0.0.1:${port}/${build.tag}/task-bench.html`);
        await page.waitForFunction(() => !!window.taskBenchmark);
        await page.evaluate(input => window.taskBenchmark.setup(input), { size, seed, mode: 'timing' });
        for (let i = -warmup; i < 0; i++) await page.evaluate(i => window.taskBenchmark.step('dirty', i), i);
        // In-flow phases: the real dirty step through FunctionComponent, oracle included outside the phases.
        await page.evaluate(() => { window.__drDiag.t = {}; window.__drDiag.n = {}; window.__drDiag.enabled = true; });
        const totals = [];
        for (let i = 0; i < samples; i++) {
          const step = await page.evaluate(i => window.taskBenchmark.step('dirty', i), i);
          const row = step.actions[0].timings; totals.push({ totalCpuMs: step.totalCpuMs, diffMs: row.diffMs, commitMs: row.commitMs, renderMs: row.renderMs, effectMs: row.effectMs });
        }
        const inflow = await page.evaluate(() => { const p = window.__drDiag; p.enabled = false; return { t: p.t, n: p.n }; });
        // Isolated loops on the same mounted view: diff + validatePlan are pure (no DOM writes).
        const loops = await page.evaluate(loop => {
          const api = window.__drDiagApi, mount = api.lastMount, probe = window.__drDiag;
          const input = [...document.querySelectorAll('input')].find(node => node.getAttribute('aria-label') === '새 항목');
          const ref = mount.refs.get(input); if (!ref) throw new Error('no dirty ref');
          const options = { dirtyFormRefs: new Set([ref]) };
          const plan = () => { const r = api.diff(mount.view, mount.view.snapshot, options); if (!r.ok) throw new Error('diff failed'); return r.value; };
          for (let i = 0; i < 50; i++) if (!api.validatePlan(mount, plan()).ok) throw new Error('validatePlan rejected');
          const p = plan();
          const time = fn => { const start = performance.now(); for (let i = 0; i < loop; i++) fn(); return (performance.now() - start) / loop; };
          const perCall = {
            diffMs: time(() => api.diff(mount.view, mount.view.snapshot, options)),
            validatePlanMs: time(() => api.validatePlan(mount, p)),
            validateTreeMs: time(() => api.validateTree(mount.view.snapshot)),
          };
          probe.t = {}; probe.n = {}; probe.enabled = true;
          for (let i = 0; i < loop; i++) api.validatePlan(mount, api.diff(mount.view, mount.view.snapshot, options).value);
          probe.enabled = false;
          let viewNodes = 0; const walk = n => { viewNodes++; n.children.forEach(walk); }; mount.view.children.forEach(walk);
          return { perCall, phases: probe.t, counts: probe.n, plan: { operations: p.operations.map(op => op.kind), visitedNodes: p.visitedNodes, reusedSubtrees: p.reusedSubtrees },
            mountNodes: mount.nodes.size, viewNodes, rootChildren: mount.view.children.length };
        }, loop);
        result.runs.push({ round, build: build.tag, browser: browser.version(), totals, inflow, loops });
        console.log(`round ${round} ${build.tag} done; validatePlan ${loops.perCall.validatePlanMs.toFixed(4)} ms/call, diff ${loops.perCall.diffMs.toFixed(4)} ms/call`);
        await context.close();
      } finally { await browser.close(); }
    }
  }
  result.status = 'passed';
} catch (error) { result.status = 'failed'; result.error = String(error?.stack ?? error); throw error; }
finally {
  result.endedAt = new Date().toISOString();
  writeFileSync(`${out}/diagnostic.json`, JSON.stringify(result, null, 2));
  await new Promise(resolve => server.close(resolve));
}
