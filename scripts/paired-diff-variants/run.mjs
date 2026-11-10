// Runner of the same-page paired full-diff() comparison for a variant built by build.mjs.
// The loop is the one of scripts/keyed-paired-diff/run.mjs; the protocol counts are those of
// docs/validation/followup-validate-names/plan.md.
//   node scripts/paired-diff-variants/run.mjs --variant=<validate|planner> --verify
//   node scripts/paired-diff-variants/run.mjs --variant=<validate|planner> --tag=paired-diff-<unique>
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.split('=')[1];
const variant = option('variant');
assert(['validate', 'planner'].includes(variant), 'Use --variant=validate or --variant=planner');
const work = `.validation/paired-diff-variants/${variant}`;
const manifest = readJson(`${work}/manifest.json`);
assert.equal(manifest.variant, variant);
const otherLabel = manifest.otherLabel;
const verification = process.argv.includes('--verify');
const tag = option('tag')?.match(/^paired-diff-[a-z0-9-]+$/)?.[0];
assert(verification !== Boolean(tag), 'Use --verify or --tag=paired-diff-<unique>');
const budgetMs = 240_000;
const order = [['A', 'B', 'C', 'AA'], ['B', 'C', 'A', 'AA'], ['C', 'A', 'B', 'AA']];
const protocol = { order, warmupPairs: 10, measuredPairs: 240, aaMeasuredPairs: 240, batchSize: 20, rows: 100, budgetMs };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
function readJson(file) { return JSON.parse(readFileSync(file, 'utf8')); }
const manifestHash = sha(readFileSync(`${work}/manifest.json`));

const routes = new Map();
for (const [kind, build] of Object.entries(manifest.builds)) {
  for (const [file, hash] of Object.entries(build.artifacts)) {
    const bytes = readFileSync(path.join(work, kind, file));
    assert.equal(sha(bytes), hash, `Rebuild changed artifact ${kind}/${file}`);
    routes.set(`/${kind}/${file}`, bytes);
  }
}
for (const [file, hash] of Object.entries(manifest.files)) assert.equal(sha(readFileSync(file)), hash, `Rebuild changed source ${file}`);
const server = createServer((request, response) => {
  const bytes = routes.get(request.url);
  if (!bytes) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': request.url.endsWith('.js') ? 'text/javascript' : 'text/html', 'Cache-Control': 'no-store' }).end(bytes);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = kind => `http://127.0.0.1:${server.address().port}/${kind}/${manifest.entry}`;

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  if (verification) {
    await page.goto(url('audit'));
    let audit, routing;
    if (variant === 'planner') {
      // Same check as scripts/keyed-paired-diff: each diff calls only its own planner.
      audit = await page.evaluate(() => window.pairedDiff.verify(true));
    } else {
      // Each arm must call its own validateTree: twice per diff(), three conditions.
      // The fixture preparation also validates with the default module, so it is counted first.
      routing = await page.evaluate(() => {
        const counts = globalThis.pairedValidateAudit = { B0: 0, V1: 0 };
        window.pairedDiff.prepare();
        const prepare = { ...counts };
        counts.B0 = 0; counts.V1 = 0;
        const result = window.pairedDiff.verify(false);
        delete globalThis.pairedValidateAudit;
        return { prepare, verify: { ...counts }, result };
      });
      assert.equal(routing.prepare.V1, 0, 'Fixture preparation must not use the candidate');
      assert.ok(routing.prepare.B0 > 0);
      assert.deepEqual(routing.verify, { B0: routing.prepare.B0 + 6, V1: 6 }, 'Each diff must validate twice with its own validateTree');
      audit = routing.result;
    }
    await page.goto(url('timing'));
    const timing = await page.evaluate(() => window.pairedDiff.verify(false));
    const withoutCalls = ({ plannerCalls, ...rest }) => rest;
    assert.deepEqual(audit.map(withoutCalls), timing.map(withoutCalls));
    json(`${work}/preflight.json`, { manifestHash, variant, otherLabel, browser: browser.version(), ...(routing ? { validateCalls: { prepare: routing.prepare, verify: routing.verify } } : {}), audit, timing });
    console.log(`Preflight passed in Chromium (${variant}): routing of the changed module, shared input and equal full PatchPlans (both bundles)`);
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
    await page.goto(url('timing'));
    const environment = {
      tag, variant, otherLabel, manifestHash, runnerCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
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
        const realm = await page.evaluate(() => {
          window.pairedDiff.prepare();
          return { timeOrigin: performance.timeOrigin, userAgent: navigator.userAgent,
            visibility: document.visibilityState, crossOriginIsolated, hardwareConcurrency: navigator.hardwareConcurrency };
        });
        const round = index + 1;
        environment.rounds.push({ round, conditions, ...realm, completed: false });
        save();
        for (const condition of conditions) {
          const count = condition === 'AA' ? protocol.aaMeasuredPairs : protocol.measuredPairs;
          for (let pair = -protocol.warmupPairs; pair < count; pair++) {
            if (!timeLeft()) break rounds;
            const result = await page.evaluate(({ condition, pair, deadlineMs }) => window.pairedDiff.pair(condition, pair, deadlineMs),
              { condition, pair, deadlineMs });
            if (!result) break rounds;
            const { sink, ...sample } = result;
            assert.equal(sample.batchSize, protocol.batchSize);
            assert.ok(Number.isFinite(sink) && [sample.b0Ms, sample.otherMs].every(ms => Number.isFinite(ms) && ms >= 0));
            // The page names its other arm 'C1' for every variant; store the variant's label.
            if (sample.first === 'C1') sample.first = otherLabel;
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
