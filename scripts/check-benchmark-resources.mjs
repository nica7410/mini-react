import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

// Diagnostic only: forced GC and CDP sampling must never run in the timing experiment.
const output = process.argv[2] ?? 'docs/validation/benchmark-resources.json';
const server = await preview({ preview: { host: '127.0.0.1', port: 4175, strictPort: true } });
const browserServer = await chromium.launchServer({ headless: true, host: '127.0.0.1', timeout: 30000 });
const report = { startedAt: new Date().toISOString(), diagnosticOnly: true, forcedGC: true, snapshots: [] };
try {
  const browser = await chromium.connect(browserServer.wsEndpoint(), { timeout: 30000 });
  report.browser = browser.version(); report.pid = browserServer.process().pid;
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://127.0.0.1:4175/benchmark.html');
  await page.waitForFunction(() => !!window.miniReactBenchmark, null, { timeout: 30000 });
  const cdp = await page.context().newCDPSession(page);
  async function snapshot(afterRuns) {
    await cdp.send('HeapProfiler.collectGarbage');
    const dom = await cdp.send('Memory.getDOMCounters');
    const heap = await cdp.send('Runtime.getHeapUsage');
    const children = await page.evaluate(() => document.querySelector('#benchmark-output').childNodes.length);
    const result = { afterRuns, ...dom, ...heap, outputChildren: children };
    report.snapshots.push(result); return result;
  }
  const baseline = await snapshot(0);
  for (let index = 0; index < 20; index++) {
    let timer;
    try {
      await Promise.race([
        page.evaluate(input => window.miniReactBenchmark.run(input), { axis: 'keyed', size: 10000, payload: 'stateful', scenario: 'mixed', seed: 539365639, variant: index % 2 ? 'lis' : 'greedy', mode: 'timing' }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Resource diagnostic timed out')), 120000); }),
      ]);
    } finally { clearTimeout(timer); }
    if ((index + 1) % 5 === 0) {
      const result = await snapshot(index + 1);
      assert.equal(result.outputChildren, 0, 'benchmark leaves mounted DOM');
      assert.ok(result.nodes <= baseline.nodes + 10, 'DOM node retention after forced GC');
      assert.ok(result.jsEventListeners <= baseline.jsEventListeners, 'listener retention after disposal');
    }
  }
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = String(error); throw error; }
finally {
  report.endedAt = new Date().toISOString(); writeFileSync(output, JSON.stringify(report, null, 2));
  await browserServer.kill(); await new Promise(resolve => server.httpServer.close(resolve));
  console.log(JSON.stringify(report, null, 2));
}
