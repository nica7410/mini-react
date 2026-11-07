import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { distribution } from '../src/bench/statistics.ts';

const directory = process.argv[2];
assert(directory, 'Usage: node scripts/analyze-noop-tails.mjs docs/bench/diagnostic-tag');
const environment = JSON.parse(readFileSync(`${directory}/environment.json`));
assert.equal(environment.status, 'passed'); assert.equal(environment.diagnosticOnly, true);
function unionMs(events, start, end) {
  const intervals = events.map(e => [Math.max(start, e.ts), Math.min(end, e.ts + e.dur)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  let covered = 0, last = start;
  for (const [a, b] of intervals) { covered += Math.max(0, b - Math.max(a, last)); last = Math.max(last, b); }
  return covered / 1000;
}
// Verify clipping and nested/overlapping-event accounting independently.
assert.equal(unionMs([{ ts: 0, dur: 4000 }, { ts: 1000, dur: 1000 }, { ts: 3000, dur: 3000 }], 500, 5500), 5);
const samples = [], summaries = [];
for (const operation of environment.paths ?? ['form-update', 'reorder']) {
  const trace = JSON.parse(gunzipSync(readFileSync(`${directory}/${operation}.trace.json.gz`))).traceEvents;
  const rows = gunzipSync(readFileSync(`${directory}/${operation}.jsonl.gz`)).toString().trim().split('\n').map(JSON.parse);
  assert.equal(rows.length, 70);
  const marks = new Map();
  for (const event of trace.filter(e => e.name.startsWith(operation + ':') && e.cat.includes('blink.user_timing'))) {
    assert(!marks.has(event.name), `Duplicate mark: ${event.name}`); marks.set(event.name, event);
  }
  assert.equal(marks.size, operation === 'reorder' ? 280 : 140);
  const garbage = trace.filter(e => e.ph === 'X' && Number.isFinite(e.dur) && /^(V8\.GC|MajorGC|MinorGC)/.test(e.name));
  for (const row of rows) {
    assert.equal(row.validation.checkedRows, 10000); assert.equal(row.validation.retainedIdentities, 10000);
    for (const stage of operation === 'reorder' ? ['cycle', 'generation'] : ['cycle']) {
      const start = marks.get(`${row.id}:${stage}:start`), end = marks.get(`${row.id}:${stage}:end`);
      assert(start && end && start.pid === end.pid && start.tid === end.tid && end.ts >= start.ts);
      const events = garbage.filter(e => e.pid === start.pid && e.tid === start.tid && e.ts < end.ts && e.ts + e.dur > start.ts);
      const durationMs = (end.ts - start.ts) / 1000;
      assert(Math.abs(durationMs - row.timings[stage === 'cycle' ? 'scheduledCycleMs' : 'expressionMs']) < 5, `Clock boundary mismatch: ${row.id}/${stage}`);
      samples.push({ id: row.id, build: row.build, path: operation, index: row.index, sampleKind: row.sampleKind, stage, durationMs,
        threadTimeMs: Number.isFinite(start.tts) && Number.isFinite(end.tts) ? (end.tts - start.tts) / 1000 : null,
        gcUnionMs: unionMs(events, start.ts, end.ts),
        majorGcUnionMs: unionMs(events.filter(e => e.name === 'MajorGC'), start.ts, end.ts),
        minorGcUnionMs: unionMs(events.filter(e => e.name === 'MinorGC'), start.ts, end.ts),
        weakProcessingUnionMs: unionMs(events.filter(e => /WEAK|EPHEMERON/.test(e.name)), start.ts, end.ts),
        timings: row.timings, orderPosition: row.orderPosition });
    }
  }
  for (const build of environment.builds) for (const stage of operation === 'reorder' ? ['cycle', 'generation'] : ['cycle']) {
    const selected = samples.filter(r => r.path === operation && r.build === build.tag && r.stage === stage && r.sampleKind === 'sample');
    assert.equal(selected.length, 30);
    summaries.push({ path: operation, build: build.tag, stage, durationMs: distribution(selected.map(r => r.durationMs)),
      gcUnionMs: distribution(selected.map(r => r.gcUnionMs)), samplesWithMajorGc: selected.filter(r => r.majorGcUnionMs > 0).length,
      totalWeakProcessingMs: selected.reduce((sum, r) => sum + r.weakProcessingUnionMs, 0),
      slowest: [...selected].sort((a, b) => b.durationMs - a.durationMs).slice(0, 5) });
  }
}
writeFileSync(`${directory}/analysis.json`, JSON.stringify({ status: 'passed', diagnosticOnly: true, auditedAt: new Date().toISOString(),
  note: 'GC duration is the union of overlapping GC-related complete events on the renderer main thread, clipped to explicit User Timing boundaries. Weak/major/minor spans are nested subsets; never add them. Instrumented diagnostic is NOT an attribution of individual untraced full-run samples or a speed comparison.',
  sampleIntervals: samples.length, samples, summaries }, null, 2));
console.log(JSON.stringify({ status: 'passed', sampleIntervals: samples.length, summaries: summaries.map(row => ({ path: row.path, build: row.build, stage: row.stage,
  median: row.durationMs.median, p95: row.durationMs.p95, majorGcSamples: row.samplesWithMajorGc,
  slowest: row.slowest.slice(0, 2).map(r => ({ index: r.index, ms: r.durationMs, gc: r.gcUnionMs, major: r.majorGcUnionMs, weak: r.weakProcessingUnionMs })) })) }, null, 2));
