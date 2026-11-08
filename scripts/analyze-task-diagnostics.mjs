import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const directory = process.argv[2]; assert(directory, 'Usage: node scripts/analyze-task-diagnostics.mjs docs/bench/tag');
const read = name => JSON.parse(readFileSync(`${directory}/${name}.json`));
const zipped = name => JSON.parse(gunzipSync(readFileSync(`${directory}/${name}.json.gz`)));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const env = read('environment'), cases = read('cases'); assert.equal(env.status, 'passed');
assert(/^[a-z0-9-]+$/.test(env.sourceRun));
const sourceBytes = readFileSync(`docs/bench/${env.sourceRun}/environment.json`);
assert.equal(sha(sourceBytes), env.sourceEnvironmentSha256, 'Timing source provenance changed');
const sourceEnvironment = JSON.parse(sourceBytes); assert.equal(sourceEnvironment.status, 'passed');
for (const build of env.builds) assert.deepEqual(build.original, sourceEnvironment.builds.find(original => original.tag === build.tag));
for (const build of env.builds) for (const kind of ['sources', 'build']) {
  const archive = zipped(`${build.tag}.diagnostic-${kind}`); assert.deepEqual(archive.manifest, build);
  for (const [file, hash] of Object.entries(kind === 'sources' ? build.sourceHashes : build.artifactHashes)) assert.equal(sha(Buffer.from(archive.files[file], 'base64')), hash);
  if (kind === 'sources') for (const group of ['engine', 'app', 'dependencies']) for (const [file, hash] of Object.entries(build.original.groups[group])) assert.equal(sha(Buffer.from(archive.files[file], 'base64')), hash, 'Diagnostic changed functional source');
}
function union(intervals) {
  const merged = [];
  for (const [start, end] of intervals.toSorted((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end); else merged.push([start, end]);
  }
  return merged;
}
const duration = ranges => union(ranges).reduce((sum, [start, end]) => sum + end - start, 0);
const overlaps = (a, b) => Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
const frameName = frame => `${frame.functionName || '(anonymous)'} @ ${frame.url?.split('/').at(-1) ?? ''}:${(frame.lineNumber ?? -1) + 1}`;
const results = [];
for (const info of cases) {
  assert.equal(info.status, 'passed'); const marks = read(`${info.name}.marks`), actions = zipped(`${info.name}.actions`);
  const result = { name: info.name, build: info.build, size: info.size, mode: info.mode, workload: info.workload, longtasks: marks.longtasks,
    longtaskCount: marks.longtasks.length, longtaskTotalMs: marks.longtasks.reduce((sum, row) => sum + row.duration, 0), actions: actions.length,
    longtaskNote: 'Observer entries cover the diagnostic page, including oracle and instrumentation work. They are not isolated engine windows or formal user-latency samples; initialization visibility depends on each mode\'s explicit mark reset.' };
  if (info.mode === 'memory') {
    result.memory = read(`${info.name}.memory`);
    const points = result.memory.points;
    result.retainedHeap = { before: points[0].heap.usedSize, mounted: points[1].heap.usedSize, afterDispose: points.at(-1).heap.usedSize,
      finalMounted: points.at(-2).heap.usedSize, mountedGrowth: points.at(-2).heap.usedSize - points[1].heap.usedSize,
      disposalDeltaFromBefore: points.at(-1).heap.usedSize - points[0].heap.usedSize };
  } else {
    const trace = zipped(`${info.name}.trace`).traceEvents;
    const marker = name => trace.find(event => event.name === name && event.cat?.includes('blink.user_timing'));
    const firstMark = trace.find(event => event.name.startsWith('task-diag:') && event.cat?.includes('blink.user_timing')); assert(firstMark, 'UserTiming not in trace');
    const mainEvents = trace.filter(event => event.pid === firstMark.pid && event.tid === firstMark.tid).sort((a, b) => a.ts - b.ts);
    const gc = mainEvents.filter(event => event.ph === 'X' && (event.name === 'MinorGC' || event.name === 'MajorGC' || event.name.startsWith('V8.GC_')) && event.dur > 0);
    const gcRanges = union(gc.map(event => [event.ts, event.ts + event.dur]));
    result.gc = { mainThreadEvents: gc.length, mainThreadGcMs: duration(gcRanges) / 1000,
      byName: Object.fromEntries([...new Set(gc.map(event => event.name))].map(name => [name, { count: gc.filter(event => event.name === name).length, durationMs: gc.filter(event => event.name === name).reduce((sum, event) => sum + event.dur, 0) / 1000 }])),
      note: 'Recorded GC categories nest; only the union of same-main-thread intervals is additive. This is instrumented GC-category time, not a claim that every event is a stop-the-world pause. These diagnostic runs cannot attribute every formal slow sample to GC.' };
    if (info.mode === 'cpu') {
      const windows = [];
      for (const entry of marks.marks.filter(entry => entry.name.startsWith('task-diag:start:'))) {
        const endName = entry.name.replace('task-diag:start:', 'task-diag:end:');
        const start = marker(entry.name), end = marker(endName); assert(start && end && end.ts >= start.ts);
        windows.push({ name: entry.name.slice('task-diag:start:'.length), phase: entry.name.slice('task-diag:start:'.length).replace(/:\d+$/, ''), start: start.ts, end: end.ts,
          elapsedMs: (end.ts - start.ts) / 1000, gcOverlapMs: gcRanges.reduce((sum, range) => sum + overlaps([start.ts, end.ts], range), 0) / 1000 });
      }
      const cpu = zipped(`${info.name}.cpu`), nodes = new Map(cpu.nodes.map(node => [node.id, node])), parents = new Map();
      for (const node of cpu.nodes) for (const child of node.children ?? []) parents.set(child, node.id);
      assert(cpu.samples.length === cpu.timeDeltas.length && windows.every(window => window.start >= cpu.startTime && window.end <= cpu.endTime), 'CPU/UserTiming clock domains differ');
      const phases = new Map();
      for (const window of windows) if (!phases.has(window.phase)) phases.set(window.phase, { self: new Map(), inclusive: new Map(), sampledMs: 0 });
      // CDP timestamps are cumulative deltas, not guaranteed collection order.
      // Keep every sample paired with its decoded timestamp, as DevTools does.
      // Sorting prevents a negative delta from double-counting an elapsed span.
      let timestamp = cpu.startTime;
      const orderedSamples = cpu.samples.map((id, index) => {
        assert(Number.isFinite(cpu.timeDeltas[index])); timestamp += cpu.timeDeltas[index];
        assert(timestamp >= cpu.startTime && timestamp <= cpu.endTime);
        return { id, index, timestamp };
      }).sort((a, b) => a.timestamp - b.timestamp || a.index - b.index);
      let position = cpu.startTime;
      for (const sample of orderedSamples) {
        const next = sample.timestamp, node = nodes.get(sample.id); assert(node); assert(next >= position);
        for (const window of windows) {
          const weight = overlaps([position, next], [window.start, window.end]) / 1000; if (!weight) continue;
          const phase = phases.get(window.phase), name = frameName(node.callFrame); phase.sampledMs += weight;
          phase.self.set(name, (phase.self.get(name) ?? 0) + weight);
          const ancestry = new Set(); let current = node;
          while (current) { ancestry.add(frameName(current.callFrame)); current = nodes.get(parents.get(current.id)); }
          for (const ancestor of ancestry) phase.inclusive.set(ancestor, (phase.inclusive.get(ancestor) ?? 0) + weight);
        }
        position = next;
      }
      assert(windows.every(window => window.end <= position), 'Last CPU sample does not cover every marked window');
      for (const [name, phase] of phases) {
        const elapsed = windows.filter(window => window.phase === name).reduce((sum, window) => sum + window.elapsedMs, 0);
        assert(Math.abs(phase.sampledMs - elapsed) < .00001, `CPU sample accounting: ${name}`);
      }
      const sorted = map => [...map].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
      result.cpu = { phases: Object.fromEntries([...phases].map(([name, phase]) => [name, { sampledMs: phase.sampledMs, selfMs: sorted(phase.self), inclusiveMs: sorted(phase.inclusive) }])),
        sampleOrdering: { samples: orderedSamples.length, negativeDeltas: cpu.timeDeltas.filter(delta => delta < 0).length,
          reorderedSamples: orderedSamples.filter((sample, index) => sample.index !== index).length,
          policy: 'All raw deltas decoded from profile.startTime; timestamp/node pairs sorted together. Each sample receives the preceding chronological interval, clipped to marked windows. No sample removal or fabricated missing samples; raw profiles unchanged.',
          methodReference: 'https://raw.githubusercontent.com/ChromeDevTools/devtools-frontend/main/front_end/models/cpu_profile/CPUProfileDataModel.ts' },
        windows, note: '1ms weighted samples are approximate; inclusive stacks overlap and cannot be summed. Initialization includes its real timer wait. Primary windows include dispatch-helper target lookup for counter/move/delete/add and setter lookup for dirty; they exclude semantic oracle and async follow-up. Follow-up work remains in the complete raw profile. Distinguish adapter frames from engine frames.' };
      const allocations = zipped(`${info.name}.allocations`), allocationSelf = new Map(), allocationInclusive = new Map();
      function visit(node, ancestors) {
        const name = frameName(node.callFrame), stack = new Set([...ancestors, name]);
        allocationSelf.set(name, (allocationSelf.get(name) ?? 0) + node.selfSize);
        for (const ancestor of stack) allocationInclusive.set(ancestor, (allocationInclusive.get(ancestor) ?? 0) + node.selfSize);
        for (const child of node.children) visit(child, stack);
      }
      visit(allocations.head, new Set());
      result.allocations = { estimatedBytes: [...allocationSelf.values()].reduce((a, b) => a + b, 0), selfBytes: sorted(allocationSelf), inclusiveBytes: sorted(allocationInclusive), samples: allocations.samples.length,
        note: 'Poisson allocation sampling includes subsequently collected objects. Entire diagnostic, including initialization and oracle. See call stacks to distinguish engine from oracle; not an exact allocation count or a formal timing sample.' };
    } else {
      const paints = mainEvents.filter(event => event.name === 'Paint' && event.ph === 'X');
      const draws = trace.filter(event => event.name === 'DrawFrame').sort((a, b) => a.ts - b.ts);
      result.visual = actions.map(action => {
        const start = marker(`task-diag:visual-start:${action.index}`), commit = marker(`task-diag:visual-commit:${action.index}`); assert(start && commit);
        const nextStart = marker(`task-diag:visual-start:${action.index + 1}`);
        const paint = paints.find(event => event.ts >= commit.ts && (!nextStart || event.ts < nextStart.ts));
        assert(paint, 'No observed Paint after commit; cannot claim rendering boundary');
        const paintEnd = paint.ts + paint.dur, draw = draws.find(event => event.ts >= paintEnd && (!nextStart || event.ts < nextStart.ts));
        return { index: action.index, kind: action.kind, dispatchToCommitMs: (commit.ts - start.ts) / 1000,
          dispatchToFirstPaintEndMs: (paintEnd - start.ts) / 1000, commitToFirstPaintEndMs: (paintEnd - commit.ts) / 1000,
          firstDrawFrameAfterPaintMs: draw ? (draw.ts - start.ts) / 1000 : null,
          rendererPid: firstMark.pid, rendererTid: firstMark.tid, paintTimestampUs: paint.ts, paintDurationUs: paint.dur,
          note: 'First observed main-renderer Paint completion after committed visual change, same page/renderer thread. This is CPU paint recording, not physical presentation or a cross-browser latency percentile. DrawFrame is contextual evidence, not a proven presentation timestamp.' };
      });
    }
  }
  results.push(result);
}
writeFileSync(`${directory}/diagnostic-summary.json`, JSON.stringify(results, null, 2));
const audit = { status: 'passed', auditedAt: new Date().toISOString(), cases: cases.length, functionalSourceHashesUnchanged: true,
  scriptSha256: sha(readFileSync('scripts/analyze-task-diagnostics.mjs')), summarySha256: sha(readFileSync(`${directory}/diagnostic-summary.json`)),
  note: 'Diagnostics are separate from timing and are not pooled with benchmark distributions. Memory/GC/source/sample/visual boundaries retained explicitly.' };
writeFileSync(`${directory}/diagnostic-audit.json`, JSON.stringify(audit, null, 2)); console.log(JSON.stringify(audit));
