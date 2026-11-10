// Runner of the attribute-map paired comparison (plan: docs/validation/followup-attr-maps/plan.md).
//   node scripts/attr-map-paired/run.mjs --verify
//   node scripts/attr-map-paired/run.mjs --tag=attr-map-paired-<unique>
// The loop follows scripts/keyed-paired-diff/run.mjs: one headless Chromium process, one page,
// a reload before every round, alternating order inside a condition, every pair stored.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';

const work = '.validation/attr-map-paired';
const manifest = readJson(`${work}/manifest.json`);
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.split('=')[1];
const verification = process.argv.includes('--verify');
const tag = option('tag')?.match(/^attr-map-paired-[a-z0-9-]+$/)?.[0];
assert(verification !== Boolean(tag), 'Use --verify or --tag=attr-map-paired-<unique>');
const budgetMs = 400_000;
// A, B, C: diff() only. U: re-render one changed row + diff(). F: fresh render of all rows.
// AA and FF are the controls (default build against a second copy of the default build).
const order = [['A', 'B', 'C', 'U', 'F', 'AA', 'FF'], ['B', 'C', 'U', 'F', 'A', 'AA', 'FF'], ['C', 'U', 'F', 'A', 'B', 'AA', 'FF']];
const protocol = { order, warmupPairs: 10, measuredPairs: 240, batchSizes: { A: 20, B: 20, C: 20, U: 20, F: 5, AA: 20, FF: 5 }, rows: 100, budgetMs };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
function readJson(file) { return JSON.parse(readFileSync(file, 'utf8')); }
const manifestHash = sha(readFileSync(`${work}/manifest.json`));

const routes = new Map();
for (const [arm, build] of Object.entries(manifest.builds)) {
  for (const [file, hash] of Object.entries(build.artifacts)) {
    const bytes = readFileSync(path.join(work, arm, file));
    assert.equal(sha(bytes), hash, `Rebuild changed artifact ${arm}/${file}`);
    routes.set(`/${arm}/${file}`, bytes);
  }
}
for (const [file, hash] of Object.entries(manifest.files)) assert.equal(sha(readFileSync(file)), hash, `Rebuild changed source ${file}`);
routes.set('/host.html', readFileSync(manifest.host));
const server = createServer((request, response) => {
  const bytes = routes.get(request.url);
  if (!bytes) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': request.url.endsWith('.js') ? 'text/javascript' : 'text/html', 'Cache-Control': 'no-store' }).end(bytes);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const hostUrl = `http://127.0.0.1:${server.address().port}/host.html`;
const open = async page => { await page.goto(hostUrl); await page.waitForFunction(() => window.paired.ready()); };

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  if (verification) {
    await open(page);
    const arms = await page.evaluate(() => window.paired.verify());
    // The three arms must produce the same trees and the same full plans.
    assert.deepEqual(arms['B0-repeat'], arms.B0, 'The two default arms differ');
    assert.deepEqual(arms.R1, arms.B0, 'The candidate arm differs from the default arm');
    for (const record of Object.values(arms)) {
      for (const maps of [record.baseMaps, record.fresh.maps]) {
        assert.ok(maps.elements > 700 && maps.attributes > 1000);
        assert.equal(maps.nullPrototype, maps.elements, 'Every attribute map must have a null prototype');
        assert.equal(maps.frozen, maps.elements);
      }
      assert.equal(record.fresh.sameObjectAsBase, false);
      assert.deepEqual(record.plans.map(plan => plan.reusedSubtrees), [99, 100, 100]);
      assert.equal(record.update.reusedSubtrees, 99);
    }
    json(`${work}/preflight.json`, { manifestHash, browser: browser.version(), modules: { b0: manifest.builds.b0.modules, r1: manifest.builds.r1.modules }, arms });
    console.log('Preflight passed in Chromium: equal trees and plans in the three arms, null-prototype frozen attribute maps, expected reuse counts');
  } else {
    const preflight = readJson(`${work}/preflight.json`);
    assert.equal(preflight.manifestHash, manifestHash, 'Run --verify for this build');
    assert.equal(preflight.browser, browser.version(), 'Browser version changed since preflight');
    const output = `docs/bench/${tag}`;
    mkdirSync(output); // Fail on an existing run tag.
    const samples = `${output}/pairs.jsonl`;
    writeFileSync(samples, '');
    json(`${output}/build.json`, manifest);
    json(`${output}/preflight.json`, preflight);
    const cdp = await browser.newBrowserCDPSession();
    const processInfo = (await cdp.send('SystemInfo.getProcessInfo')).processInfo.find(info => info.type === 'browser');
    await cdp.detach();
    await open(page);
    const environment = {
      tag, manifestHash, runnerCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      node: process.version, cpu: os.cpus()[0]?.model, logicalCPUs: os.cpus().length, ramBytes: os.totalmem(),
      os: { platform: os.platform(), release: os.release(), arch: os.arch() },
      chromium: { version: browser.version(), browserPid: processInfo?.id, headless: true,
        executable: chromium.executablePath(), playwright: readJson('node_modules/@playwright/test/package.json').version },
      protocol, status: 'running', rounds: [], warmupPairs: 0, measuredPairs: 0,
      accumulatedBatchMs: 0, startedAt: new Date().toISOString(),
    };
    const started = performance.now();
    const deadlineMs = Date.now() + budgetMs;
    const save = () => json(`${output}/environment.json`, environment);
    let expired = false;
    const watchdog = setTimeout(() => {
      expired = true;
      void browser.close().catch(() => {});
    }, budgetMs);
    const timeLeft = () => !expired && performance.now() - started < budgetMs;
    save();
    try {
      rounds: for (const [index, conditions] of order.entries()) {
        if (!timeLeft()) break;
        await page.reload();
        await page.waitForFunction(() => window.paired.ready());
        const realm = await page.evaluate(() => {
          window.paired.prepare();
          return { timeOrigin: performance.timeOrigin, userAgent: navigator.userAgent,
            visibility: document.visibilityState, crossOriginIsolated, hardwareConcurrency: navigator.hardwareConcurrency };
        });
        const round = index + 1;
        environment.rounds.push({ round, conditions, ...realm, completed: false });
        save();
        for (const condition of conditions) {
          for (let pair = -protocol.warmupPairs; pair < protocol.measuredPairs; pair++) {
            if (!timeLeft()) break rounds;
            const sample = await page.evaluate(({ condition, pair, deadlineMs }) => window.paired.pair(condition, pair, deadlineMs),
              { condition, pair, deadlineMs });
            if (!sample) break rounds;
            assert.equal(sample.batchSize, protocol.batchSizes[condition]);
            assert.ok([sample.b0Ms, sample.otherMs].every(ms => Number.isFinite(ms) && ms >= 0));
            const warmup = pair < 0;
            appendFileSync(samples, JSON.stringify({ round, condition, phase: warmup ? 'warmup' : 'measured', ...sample }) + '\n');
            environment[warmup ? 'warmupPairs' : 'measuredPairs']++;
            environment.accumulatedBatchMs += sample.b0Ms + sample.otherMs;
          }
        }
        environment.rounds.at(-1).completed = true;
        save();
      }
      environment.status = environment.rounds.length === order.length && environment.rounds.every(round => round.completed)
        ? 'completed' : 'time-limit';
    } catch (error) {
      environment.status = expired ? 'time-limit' : 'failed';
      if (!expired) { environment.error = String(error); throw error; }
    } finally {
      clearTimeout(watchdog);
      environment.elapsedMs = performance.now() - started;
      environment.finishedAt = new Date().toISOString();
      save();
      console.log(`${environment.status}: ${environment.measuredPairs} measured pairs, ${environment.warmupPairs} warm-up pairs, ${(environment.elapsedMs / 1000).toFixed(3)} s`);
    }
  }
} finally {
  try { await browser?.close(); } finally { server.close(); }
}
