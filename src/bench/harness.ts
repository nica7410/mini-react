import type { CommitCounters, CommitResult, MountHandle, TraceEvent, TraceSink } from '../core/types';
import { createMount, disposeMount } from '../core/mount';
import { captureDOM } from '../core/capture';
import { diff } from '../core/reconcile';
import { applySnapshot, emptyCounters } from '../core/patch';
import { unwrap } from '../core/vdom';
import { FunctionComponent, h, useEffect, useMemo, useState } from '../runtime';
import type { RuntimeMeasurement } from '../runtime/FunctionComponent';
import { resolveExpression } from '../runtime/resolve';
import { makeFixture, rowsExpression } from './fixtures';
import type { Fixture, Payload, Row, Scenario } from './fixtures';

export type Axis = 'keyed' | 'batching' | 'reuse';
export type Mode = 'counts' | 'timing';
export interface BenchmarkInput { readonly axis: Axis; readonly variant: string; readonly mode: Mode; readonly size: number; readonly payload: Payload; readonly scenario: Scenario; readonly seed: number }
export interface BenchmarkSample {
  readonly input: BenchmarkInput;
  readonly timings: RuntimeMeasurement & { readonly captureMs: number; readonly scheduledCycleMs: number } | null;
  readonly counts: Record<string, number> | null;
  readonly validation: { readonly initialOrder: string; readonly finalOrder: string; readonly reusedRoots: number; readonly checkedRows: number };
  readonly visibility: DocumentVisibilityState;
  readonly focused: boolean;
}
const ensure = (condition: unknown, message: string): void => { if (!condition) throw new Error(message); };
function assertCommitted(result: CommitResult): void {
  if (result.status === 'rejected') throw new Error(result.diagnostics.map(d => d.message).join('\n'));
  if (result.status === 'faulted') throw result.error;
  if (result.status === 'deferred') throw new Error('benchmark 중 composition 보류 발생');
}
function checksum(ids: readonly string[]): string {
  let hash = 2166136261;
  for (const id of ids) for (const char of `${id}\0`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}
function seedLiveValues(output: HTMLElement, rows: readonly Row[], payload: Payload): Map<string, Element> {
  const nodes = new Map<string, Element>();
  const items = output.querySelectorAll('li'); ensure(items.length === rows.length, 'reset 목록 길이 오류');
  items.forEach((element, i) => {
    ensure(element.getAttribute('data-id') === rows[i].id, 'reset 순서 오류'); nodes.set(rows[i].id, element);
    if (payload === 'stateful') {
      const [input, checkbox] = element.querySelectorAll('input'); input.value = `typed:${rows[i].id}`; checkbox.checked = true;
    }
  });
  return nodes;
}
function validate(output: HTMLElement, fixture: Fixture, previous: Map<string, Element>, expected = fixture.newRows) {
  const items = output.querySelectorAll('li'), ids: string[] = []; let reusedRoots = 0;
  const previousObjects = new Set(previous.values());
  ensure(items.length === expected.length, '최종 항목 수 오류');
  items.forEach((element, i) => {
    const row = expected[i], old = previous.get(row.id); ids.push(row.id);
    ensure(element.getAttribute('data-id') === row.id && element.getAttribute('data-version') === String(row.version), `순서/속성 오류 ${row.id}`);
    ensure(element.querySelector('span')?.textContent === row.label, `텍스트 오류 ${row.id}`);
    if (old) { ensure(old === element, `identity 오류 ${row.id}`); reusedRoots++; }
    else ensure(!previousObjects.has(element), `신규 identity 오류 ${row.id}`);
    if (fixture.payload === 'stateful') {
      const [input, checkbox] = element.querySelectorAll('input');
      ensure(input.value === (old ? `typed:${row.id}` : row.id) && checkbox.checked === !!old, `live 입력 보존 오류 ${row.id}`);
    }
  });
  const retained = new Set(ids);
  for (const [id, element] of previous) if (!retained.has(id)) ensure(!output.contains(element), `삭제 오류 ${id}`);
  return { initialOrder: checksum(fixture.oldRows.map(row => row.id)), finalOrder: checksum(ids), reusedRoots, checkedRows: items.length };
}
function counts(events: readonly TraceEvent[]): Record<string, number> {
  const counters: CommitCounters = emptyCounters();
  let plannedMoves = 0, visitedNodes = 0;
  for (const event of events) {
    if (event.phase === 'patch') for (const key of Object.keys(counters) as (keyof CommitCounters)[]) counters[key] += Number(event.detail[key] ?? 0);
    if (event.phase === 'diff') {
      visitedNodes += Number(event.detail.visitedNodes);
      plannedMoves += (event.detail.reconciliations as { moves: number }[]).reduce((sum, row) => sum + row.moves, 0);
    }
  }
  return { ...counters, plannedMoves, visitedNodes, commits: events.filter(e => e.phase === 'patch').length,
    rootExecutions: events.filter(e => e.phase === 'render').length,
    childExecutions: events.filter(e => e.phase === 'component' && !e.detail.reused).length,
    reusedExpressions: events.filter(e => e.phase === 'component' && e.detail.reused).length,
    memoCalculations: events.filter(e => e.phase === 'memo' && !e.detail.reused).length,
    memoReuses: events.filter(e => e.phase === 'memo' && e.detail.reused).length,
    effectSetups: events.filter(e => e.phase === 'effect-setup').length,
    effectCleanups: events.filter(e => e.phase === 'effect-cleanup').length };
}

// Fixture 준비·reset·identity oracle는 모든 측정 구간 바깥에서 실행한다.
// Trace 수집은 counts run에서만 켜며 timing run에는 sink 자체를 전달하지 않는다.
export async function runBenchmark(input: BenchmarkInput, output: HTMLElement): Promise<BenchmarkSample> {
  const fixture = makeFixture(input.size, input.scenario, input.seed, input.payload);
  if (!['keyed', 'batching', 'reuse'].includes(input.axis) || !['counts', 'timing'].includes(input.mode)) throw new Error('benchmark 축/모드 오류');
  const variants = input.axis === 'keyed' ? ['greedy', 'lis'] : input.axis === 'batching' ? ['sync', 'microtask'] : ['off', 'on'];
  if (!variants.includes(input.variant)) throw new Error('benchmark 비교 옵션 오류');
  const events: TraceEvent[] = [];
  const trace: TraceSink | undefined = input.mode === 'counts' ? { emit: event => events.push(event) } : undefined;
  const clock = () => input.mode === 'timing' ? performance.now() : 0;
  let mount: MountHandle | undefined, root: FunctionComponent<{}> | undefined;
  let renderMs = 0, diffMs = 0, commitMs = 0, flushMs = 0, effectMs = 0, captureMs = 0, scheduledCycleMs = 0;
  let collecting = false;
  try {
    if (input.axis === 'keyed') {
      mount = createMount(output, trace);
      const old = resolveExpression(rowsExpression(fixture.oldRows, fixture.payload));
      const target = resolveExpression(rowsExpression(fixture.newRows, fixture.payload));
      assertCommitted(applySnapshot(mount, diff(mount.view, old, { strategy: input.variant as 'lis' | 'greedy' })));
      const previous = seedLiveValues(output, fixture.oldRows, fixture.payload); events.length = 0;
      if (input.mode === 'timing') { const start = clock(); unwrap(captureDOM(mount)); captureMs = clock() - start; }
      const start = clock();
      const plan = diff(mount.view, target, { strategy: input.variant as 'lis' | 'greedy' }); const diffEnd = clock();
      const result = applySnapshot(mount, plan); const commitEnd = clock();
      diffMs = diffEnd - start; commitMs = commitEnd - diffEnd; flushMs = scheduledCycleMs = commitEnd - start;
      assertCommitted(result);
      return { input, timings: input.mode === 'timing' ? { renderMs, diffMs, commitMs, flushMs, effectMs, captureMs, scheduledCycleMs } : null,
        counts: trace ? counts(events) : null, validation: validate(output, fixture, previous), visibility: document.visibilityState, focused: document.hasFocus() };
    }
    const List = (props: { rows: readonly Row[] }) => rowsExpression(props.rows, fixture.payload);
    let increment!: () => void;
    root = new FunctionComponent(() => {
      const [n, set] = useState(0); increment = () => set(value => value + 1);
      const expression = useMemo(() => h(List, { rows: fixture.oldRows }), []);
      // Effect가 다시 State를 바꾸는 사례는 비교 입력에 섞지 않는다.
      useEffect(() => () => undefined, [n]);
      return h('div', null, expression, h('output', null, n));
    }, {}, output, {
      trace, batching: input.axis === 'batching' ? input.variant as 'sync' | 'microtask' : 'microtask',
      reuseVNode: input.axis === 'reuse' ? input.variant === 'on' : true, reconcile: 'lis',
      onMeasure: input.mode === 'timing' ? sample => {
        if (!collecting) return;
        renderMs += sample.renderMs; diffMs += sample.diffMs; commitMs += sample.commitMs; flushMs += sample.flushMs; effectMs += sample.effectMs;
      } : undefined,
    });
    assertCommitted(root.mount()); mount = root.host;
    const previous = seedLiveValues(output, fixture.oldRows, fixture.payload); events.length = 0;
    collecting = true; const start = clock();
    increment(); if (input.axis === 'batching') { increment(); increment(); }
    await Promise.resolve(); const end = clock(); collecting = false; scheduledCycleMs = end - start;
    assertCommitted(root.lastResult!);
    ensure(output.querySelector('output')?.textContent === (input.axis === 'batching' ? '3' : '1'), 'batch 최종 상태 오류');
    return { input, timings: input.mode === 'timing' ? { renderMs, diffMs, commitMs, flushMs, effectMs, captureMs, scheduledCycleMs } : null,
      counts: trace ? counts(events) : null, validation: validate(output, fixture, previous, fixture.oldRows), visibility: document.visibilityState, focused: document.hasFocus() };
  } catch (error) {
    const failure = { schemaVersion: 1, input, fixture, observed: String(error), trace: events, environment: { userAgent: navigator.userAgent } };
    throw new Error(JSON.stringify(failure));
  } finally {
    if (root) root.unmount(); else if (mount) disposeMount(mount);
  }
}
