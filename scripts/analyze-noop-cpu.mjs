import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const directory = process.argv[2];
assert(directory, 'Usage: node scripts/analyze-noop-cpu.mjs docs/bench/cpu-diagnostic-tag');
const environment = JSON.parse(readFileSync(`${directory}/environment.json`));
assert.equal(environment.status, 'passed'); assert.equal(environment.cpuProfile, true);
const results = [];
for (const operation of environment.paths) {
  const trace = JSON.parse(gunzipSync(readFileSync(`${directory}/${operation}.trace.json.gz`))).traceEvents;
  const marks = new Map(trace.filter(e => e.name.startsWith(operation + ':') && e.cat.includes('blink.user_timing')).map(e => [e.name, e]));
  for (const build of environment.builds) {
    const profile = JSON.parse(gunzipSync(readFileSync(`${directory}/${operation}-${build.tag}.cpuprofile.json.gz`)));
    assert.equal(profile.samples.length, profile.timeDeltas.length);
    const nodes = new Map(profile.nodes.map(node => [node.id, node]));
    const intervals = []; let clock = profile.startTime;
    for (let i = 0; i < profile.samples.length; i++) { const start = clock; clock += profile.timeDeltas[i]; intervals.push({ start, end: clock, node: nodes.get(profile.samples[i]) }); }
    for (let index = 0; index < 30; index++) {
      const id = `${operation}:${build.tag}:${index}`;
      const start = marks.get(id + ':cycle:start').ts, end = marks.get(id + ':cycle:end').ts;
      assert(profile.startTime <= start && clock >= end, 'CPU/trace clocks do not cover the cycle');
      const functions = new Map(); let accountedMs = 0;
      for (const interval of intervals) {
        const ms = Math.max(0, Math.min(end, interval.end) - Math.max(start, interval.start)) / 1000;
        if (!ms) continue; accountedMs += ms;
        const frame = interval.node.callFrame;
        const key = [frame.functionName, frame.url, frame.lineNumber, frame.columnNumber].join(',');
        if (!functions.has(key)) functions.set(key, { functionName: frame.functionName || '(anonymous)', url: frame.url, line: frame.lineNumber + 1, selfSampleMs: 0 });
        functions.get(key).selfSampleMs += ms;
      }
      assert(Math.abs(accountedMs - (end - start) / 1000) < .00001);
      results.push({ id, path: operation, build: build.tag, index, durationMs: (end - start) / 1000,
        topSelfSamples: [...functions.values()].sort((a, b) => b.selfSampleMs - a.selfSampleMs).slice(0, 10) });
    }
  }
}
writeFileSync(`${directory}/cpu-analysis.json`, JSON.stringify({ status: 'passed', diagnosticOnly: true, auditedAt: new Date().toISOString(),
  note: 'Approximate CPU self-sample attribution, weighted by inter-sample time and clipped to cycle marks. No nested-frame summation. Sampling/unminified diagnostic only, not precise function duration or proof of which V8 native operation caused a pause.',
  cycles: results.length, results }, null, 2));
console.log(`CPU/trace clock alignment and self-sample accounting passed for ${results.length} measured cycles.`);
