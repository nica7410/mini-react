// Separate, instrumented diagnostic copies. Never run alongside benchmark-task.mjs.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { build as viteBuild } from 'vite';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import path from 'node:path';
import net from 'node:net';

const args = new Map(process.argv.slice(2).map(arg => { const [key, value = 'true'] = arg.replace(/^--/, '').split('='); return [key, value]; }));
const tag = args.get('tag'), tags = (args.get('builds') ?? '').split(',');
assert(tag && [tag, ...tags].every(value => /^[a-z0-9-]+$/.test(value)));
const sizes = (args.get('sizes') ?? '1000,10000').split(',').map(Number);
const modes = (args.get('modes') ?? 'cpu,memory,visual').split(',');
assert(sizes.every(size => [10, 100, 1000, 10000].includes(size)) && modes.every(mode => ['cpu', 'memory', 'visual'].includes(mode)));
const smoke = args.has('smoke'), repetitions = smoke ? 2 : 12, cpuWarmup = smoke ? 1 : 5;
const sourceRun = args.get('source-run') ?? 'task-matrix-v1';
assert(/^[a-z0-9-]+$/.test(sourceRun));
const sourceEnvironment = JSON.parse(readFileSync(`docs/bench/${sourceRun}/environment.json`));
assert.equal(sourceEnvironment.status, 'passed', 'Complete the source timing run before building/running diagnostics');
assert.equal(new Set(tags).size, tags.length, 'Duplicate diagnostic build');
const timingPortFree = await new Promise(resolve => {
  const socket = net.createConnection({ host: '127.0.0.1', port: 4178 });
  socket.once('connect', () => { socket.destroy(); resolve(false); });
  socket.once('error', error => { socket.destroy(); resolve(error.code === 'ECONNREFUSED'); });
  socket.setTimeout(2000, () => { socket.destroy(); resolve(false); });
});
assert(timingPortFree, 'Do not build/profile while a formal timing server is active');
const output = `docs/bench/${tag}`, temporary = `.validation/task-diagnostics/${tag}`;
assert(!existsSync(output) && !existsSync(temporary), 'Preserve diagnostic evidence');
mkdirSync(output, { recursive: true }); mkdirSync(temporary, { recursive: true });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const write = (name, value) => writeFileSync(`${output}/${name}.json`, JSON.stringify(value, null, 2));
const zipped = (name, value) => writeFileSync(`${output}/${name}.json.gz`, gzipSync(typeof value === 'string' ? value : JSON.stringify(value)));
const visualMethod = `
      async diagnosticVisual(kind: 'counter' | 'move', index: number) {
        const before = new Map([...output.querySelectorAll('li[data-task-id]')].map(row => [row.getAttribute('data-task-id')!, row]));
        const trigger = button(kind === 'counter' ? '+1 세 번' : '마지막 항목을 처음으로');
        const target = kind === 'counter' ? element('output') : element('li[data-task-id]');
        target.scrollIntoView({ block: 'center' });
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const beforeRect = target.getBoundingClientRect();
        ensure(beforeRect.width > 0 && beforeRect.height > 0 && beforeRect.bottom > 0 && beforeRect.top < innerHeight, 'Visual target is outside viewport');
        const follows = applyTaskAction(model, { kind });
        const first = waitFlush();
        performance.mark('task-diag:visual-start:' + index);
        trigger.click(); await first;
        performance.mark('task-diag:visual-commit:' + index);
        const tail = follows ? waitFlush() : Promise.resolve();
        await Promise.all([tail, new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))]);
        // The oracle runs only after the frame opportunity. Trace Paint events,
        // rather than these callbacks, define the reported rendering boundary.
        const validation = oracle(before), afterRect = target.getBoundingClientRect();
        ensure(afterRect.width > 0 && afterRect.height > 0 && afterRect.bottom > 0 && afterRect.top < innerHeight, 'Visual target left viewport');
        return { kind, index, validation, visibleTarget: afterRect.toJSON() };
      },`;
function instrument(source) {
  const replacements = [
    ['onMeasure: measurement => {', 'onMeasure: measurement => {\n      (window as any).taskDiagnostic.flush(measurement);'],
    ['const initializationStart = performance.now();', "const initializationStart = performance.now();\n  const diagnosticInit = (window as any).taskDiagnostic.start('initialization');"],
    ['const initialization = {', "(window as any).taskDiagnostic.end(diagnosticInit);\n    const initialization = {"],
    ['const first = waitFlush(); const start = performance.now(); dispatch();', "const first = waitFlush(); const start = performance.now();\n      const diagnosticAction = (window as any).taskDiagnostic.start('primary-' + action.kind); dispatch();"],
    ['const primaryMs = performance.now() - start;', 'const primaryMs = performance.now() - start; (window as any).taskDiagnostic.end(diagnosticAction);'],
    ['return { initialization,', 'return { initialization,' + visualMethod],
    ['dispose() { current?.dispose(); current = null; },', 'diagnosticVisual(kind: any, index: number) { return current!.diagnosticVisual(kind, index); },\n  dispose() { current?.dispose(); current = null; },'],
  ];
  for (const [before, after] of replacements) { assert.equal(source.split(before).length, 2, `Diagnostic insertion drift: ${before}`); source = source.replace(before, after); }
  return source;
}
const assets = new Map(), builds = [];
const list = folder => readdirSync(folder, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? list(path.join(folder, entry.name)) : [path.join(folder, entry.name)]);
for (const sourceTag of tags) {
  const archive = JSON.parse(gunzipSync(readFileSync(`.validation/task-builds/${sourceTag}/sources.json.gz`)));
  const recorded = sourceEnvironment.builds.find(build => build.tag === sourceTag);
  assert(recorded, 'Diagnostic build was not part of the recorded source timing run');
  assert.deepEqual(archive.manifest, recorded, 'Local diagnostic source differs from the recorded timing source');
  const source = path.resolve(temporary, sourceTag, 'source'), dist = path.resolve(temporary, sourceTag, 'dist');
  const sourceHashes = {}, instrumentedFiles = {};
  for (const [file, encoded] of Object.entries(archive.files)) {
    let bytes = Buffer.from(encoded, 'base64');
    const expected = Object.values(archive.manifest.groups).map(group => group[file]).find(Boolean); assert.equal(sha(bytes), expected);
    if (file === 'src/bench/task-app.ts') bytes = Buffer.from(instrument(bytes.toString()));
    const target = path.join(source, file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, bytes);
    sourceHashes[file] = sha(bytes); instrumentedFiles[file] = bytes.toString('base64');
  }
  await viteBuild({ root: source, configFile: false, base: './', logLevel: 'warn', build: { outDir: dist, emptyOutDir: false, minify: false, sourcemap: true, rollupOptions: { input: path.join(source, 'task-bench.html') } } });
  const artifactHashes = {}, artifactFiles = {};
  for (const file of list(dist)) { const relative = path.relative(dist, file).replaceAll('\\', '/'), bytes = readFileSync(file); assets.set(`/${sourceTag}/${relative}`, bytes); artifactHashes[relative] = sha(bytes); artifactFiles[relative] = bytes.toString('base64'); }
  const manifest = { tag: sourceTag, original: archive.manifest, sourceHashes, artifactHashes, minify: false, sourcemap: true,
    modification: 'Only diagnostic harness inserts UserTiming/flush marks and a direct real counter/move dispatch with oracle after frame opportunity. Actual engine/app sources unchanged.' };
  builds.push(manifest); zipped(`${sourceTag}.diagnostic-sources`, { manifest, files: instrumentedFiles }); zipped(`${sourceTag}.diagnostic-build`, { manifest, files: artifactFiles });
}
const environment = { startedAt: new Date().toISOString(), status: 'running', diagnosticOnly: true, sourceRun, smoke, sizes, modes, repetitions, cpuWarmup, builds,
  sourceEnvironmentSha256: sha(readFileSync(`docs/bench/${sourceRun}/environment.json`)),
  scriptSha256: sha(readFileSync('scripts/diagnose-task.mjs')), seed: 539365639, port: 4179, headless: true, viewport: { width: 1280, height: 900 },
  policy: 'Separate processes from formal timing. CPU sampling 1ms plus allocation sampling 32768B, GC trace and longtask observer are diagnostic overhead. Allocation profile includes collected objects and is estimated, not exact allocated bytes. Forced GC only in the memory diagnostic; retained JS heap is not process RSS. Visual oracle is after frame opportunity; actual trace Paint completion is a rendering boundary, not physical display presentation. No automatic retry or discarded slow samples.' };
write('environment', environment);
const server = createServer((req, res) => { const file = new URL(req.url, 'http://localhost').pathname, bytes = assets.get(file); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css' : 'text/javascript'); res.writeHead(bytes ? 200 : 404); res.end(bytes ?? 'Not found'); });
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4179, '127.0.0.1', resolve); });
const cases = [];
async function bounded(promise, milliseconds = 120000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Diagnostic deadline ${milliseconds}ms; no retry`)), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
async function traceStart(client, screenshots = false) {
  await client.send('Tracing.start', { categories: ['devtools.timeline', 'blink.user_timing', 'v8', 'disabled-by-default-v8.gc', 'disabled-by-default-devtools.timeline', 'cc', screenshots ? 'disabled-by-default-devtools.screenshot' : ''].filter(Boolean).join(','), transferMode: 'ReturnAsStream' });
}
async function traceStop(client) {
  const done = new Promise(resolve => client.once('Tracing.tracingComplete', resolve)); await client.send('Tracing.end'); const { stream } = await bounded(done);
  const chunks = []; for (;;) { const chunk = await client.send('IO.read', { handle: stream }); chunks.push(Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8')); if (chunk.eof) break; }
  await client.send('IO.close', { handle: stream }); return Buffer.concat(chunks).toString();
}
try {
  for (const mode of modes) for (const size of sizes) for (const sourceTag of tags) {
    const workloads = mode === 'cpu' ? ['counter', 'sort', 'crud'] : mode === 'visual' ? ['counter', 'move'] : ['mixed'];
    for (const workload of workloads) {
      const name = `${sourceTag}-${size}-${mode}-${workload}`, info = { name, mode, size, build: sourceTag, workload, startedAt: new Date().toISOString(), status: 'running' }; cases.push(info);
      const results = [];
      const browserServer = await chromium.launchServer({ headless: true, host: '127.0.0.1', timeout: 30000 });
      info.pid = browserServer.process().pid;
      try {
        const browser = await chromium.connect(browserServer.wsEndpoint()); info.browser = browser.version();
        const context = await browser.newContext({ viewport: environment.viewport }); const page = await context.newPage();
        await page.addInitScript(() => {
          let sequence = 0;
          const longtasks = [];
          const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) longtasks.push({ startTime: entry.startTime, duration: entry.duration, name: entry.name }); });
          observer.observe({ type: 'longtask', buffered: true });
          window.taskDiagnostic = {
            longtasks, stage: '', start(kind) { const id = `${this.stage ? this.stage + '-' : ''}${kind}:${sequence++}`; performance.mark(`task-diag:start:${id}`); return id; },
            end(id) { performance.mark(`task-diag:end:${id}`); },
            flush(measurement) { performance.mark(`task-diag:flush:${sequence++}`, { detail: measurement }); },
            clear() { performance.clearMarks(); longtasks.length = 0; },
            collect() { return { timeOrigin: performance.timeOrigin, marks: performance.getEntriesByType('mark').map(entry => ({ name: entry.name, startTime: entry.startTime, detail: entry.detail })), longtasks: [...longtasks] }; },
          };
        });
        await page.goto(`http://127.0.0.1:4179/${sourceTag}/task-bench.html`); await page.waitForFunction(() => !!window.taskBenchmark); await page.bringToFront();
        const client = await context.newCDPSession(page), input = { size, seed: environment.seed, mode: 'timing' };
        const setup = () => { info.lastInput = { action: 'setup', input }; return bounded(page.evaluate(input => window.taskBenchmark.setup(input), input)); };
        const step = (workload, index) => { info.lastInput = { action: 'step', workload, index }; return bounded(page.evaluate(({ workload, index }) => {
          window.taskDiagnostic.stage = index < 0 ? 'warmup' : 'sample';
          return window.taskBenchmark.step(workload, index);
        }, { workload, index })); };
        if (mode === 'cpu') {
          await client.send('Profiler.enable'); await client.send('Profiler.setSamplingInterval', { interval: 1000 }); await client.send('HeapProfiler.enable');
          await traceStart(client); await client.send('Profiler.start'); await client.send('HeapProfiler.startSampling', { samplingInterval: 32768, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
          try {
            info.initialization = await setup();
            for (let index = -cpuWarmup; index < repetitions; index++) results.push(await step(workload, index));
          } catch (error) { info.actionError = String(error); info.actionStack = error.stack; throw error;
          } finally {
            zipped(`${name}.actions`, results);
            const heap = await client.send('HeapProfiler.stopSampling'), cpu = await client.send('Profiler.stop');
            zipped(`${name}.cpu`, cpu.profile); zipped(`${name}.allocations`, heap.profile); zipped(`${name}.trace`, await traceStop(client));
            zipped(`${name}.actions`, results); write(`${name}.marks`, await page.evaluate(() => window.taskDiagnostic.collect()));
          }
        } else if (mode === 'memory') {
          const points = [];
          async function memory(label) {
            await client.send('HeapProfiler.collectGarbage');
            points.push({ label, heap: await client.send('Runtime.getHeapUsage'), dom: await client.send('Memory.getDOMCounters') });
            // Checkpoint each completed point so a later failed action retains
            // the preceding heap trajectory and the exact completed actions.
            write(`${name}.memory`, { points, note: 'Forced-GC retained heap and DOM counters, one diagnostic trajectory. No assertion of zero growth or exact allocation count. Ratios run sequentially on the same app; both engines use the same order.' });
            zipped(`${name}.actions`, results);
          }
          await memory('before mount'); info.initialization = await setup(); await page.evaluate(() => window.taskDiagnostic.clear()); await memory('after mount');
          for (const reusePerCrud of [1, 10]) {
            for (let cycle = 0; cycle < (smoke ? 1 : 4); cycle++) {
              for (let repeat = 0; repeat < reusePerCrud; repeat++) results.push(await step('counter', repeat));
              results.push(await step('crud', cycle));
              await page.evaluate(() => window.taskDiagnostic.clear()); await memory(`reuse ${reusePerCrud}:crud 1, cycle ${cycle + 1}`);
            }
          }
          await page.evaluate(() => window.taskBenchmark.dispose()); await page.evaluate(() => window.taskDiagnostic.clear()); await memory('after dispose');
          write(`${name}.memory`, { points, note: 'Forced-GC retained heap and DOM counters, one diagnostic trajectory. No assertion of zero growth or exact allocation count. Ratios run sequentially on the same app; both engines use the same order.' });
        } else {
          info.initialization = await setup(); await page.evaluate(() => window.taskDiagnostic.clear()); await traceStart(client, true);
          try {
            for (let index = 0; index < (smoke ? 1 : 3); index++) {
              info.lastInput = { action: 'visual', workload, index };
              results.push(await bounded(page.evaluate(({ workload, index }) => window.taskBenchmark.diagnosticVisual(workload, index), { workload, index })));
            }
          } catch (error) { info.actionError = String(error); info.actionStack = error.stack; throw error;
          } finally {
            zipped(`${name}.actions`, results);
            zipped(`${name}.trace`, await traceStop(client)); zipped(`${name}.actions`, results); write(`${name}.marks`, await page.evaluate(() => window.taskDiagnostic.collect()));
          }
          await page.screenshot({ path: `${output}/${name}.png` });
        }
        zipped(`${name}.actions`, results); write(`${name}.marks`, await page.evaluate(() => window.taskDiagnostic.collect()));
        await page.evaluate(() => window.taskBenchmark.dispose()); await context.close(); info.status = 'passed'; console.log(`DIAGNOSTIC ${name} PASS`);
      } catch (error) { info.status = 'failed'; info.error = String(error); zipped(`${name}.actions`, results); write('failure', { info, stack: error.stack }); throw error; }
      finally { info.endedAt = new Date().toISOString(); write('cases', cases); await browserServer.kill(); }
    }
  }
  environment.status = 'passed';
} catch (error) { environment.status = 'failed'; environment.error = String(error); throw error; }
finally { environment.endedAt = new Date().toISOString(); write('environment', environment); await new Promise(resolve => server.close(resolve)); }
