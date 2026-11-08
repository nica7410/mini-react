import '../app/style.css';
import { TaskApp } from '../app/tasks';
import { FunctionComponent } from '../runtime';
import type { RuntimeMeasurement } from '../runtime/FunctionComponent';
import type { CommitResult, StateSetter, TraceEvent } from '../core/types';
import { emptyCounters } from '../core/patch';
import { applyTaskAction, initialTaskModel, taskActions, taskWorkloads, visibleTasks } from './task-model';
import type { TaskAction, TaskWorkload } from './task-model';

export interface TaskBenchInput { size: number; seed: number; mode: 'counts' | 'timing'; reuse?: boolean }
interface MeasuredFlush extends RuntimeMeasurement { expressionMs: number; vdomMs: number; events: TraceEvent[] }
const ensure = (ok: unknown, message: string): void => { if (!ok) throw new Error(message); };
const accepted = (result: CommitResult | undefined): void => ensure(result?.status === 'committed' || result?.status === 'noop', `Rejected application: ${JSON.stringify(result)}`);
const numeric = (row: MeasuredFlush) => ({ expressionMs: row.expressionMs, vdomMs: row.vdomMs, renderMs: row.renderMs, diffMs: row.diffMs, commitMs: row.commitMs, flushMs: row.flushMs, effectMs: row.effectMs });
function counts(events: TraceEvent[]) {
  const result: Record<string, number> = { ...emptyCounters(), rootExecutions: 0, childExecutions: 0, taskRowExecutions: 0,
    visitedNodes: 0, reusedSubtrees: 0, commits: 0, effectSetups: 0, effectCleanups: 0 };
  for (const event of events) {
    if (event.phase === 'render') result.rootExecutions++;
    if (event.phase === 'component' && !event.detail.reused) {
      result.childExecutions++;
      if (/\/key:task-\d+$/.test(String(event.detail.path))) result.taskRowExecutions++;
    }
    if (event.phase === 'diff') { result.visitedNodes += Number(event.detail.visitedNodes); result.reusedSubtrees += Number(event.detail.reusedSubtrees); }
    if (event.phase === 'patch') { result.commits++; for (const key of Object.keys(emptyCounters())) result[key] += Number(event.detail[key] ?? 0); }
    if (event.phase === 'effect-setup') result.effectSetups++;
    if (event.phase === 'effect-cleanup') result.effectCleanups++;
  }
  return result;
}
export async function createTaskBenchmark(input: TaskBenchInput, output: HTMLElement) {
  const model = initialTaskModel(input.size, input.seed);
  const events: TraceEvent[] = [], measurements: MeasuredFlush[] = [];
  let expressionMs = 0, eventCursor = 0, nextFlush: { resolve: (value: MeasuredFlush) => void; reject: (error: Error) => void } | null = null;
  const root = new FunctionComponent(() => {
    const start = performance.now(); const value = TaskApp(); expressionMs = performance.now() - start; return value;
  }, {}, output, { reconcile: 'lis', batching: 'microtask', reuseVNode: input.reuse !== false,
    trace: input.mode === 'counts' ? { emit: event => events.push(event) } : undefined,
    onError: error => { nextFlush?.reject(new Error(error.message)); nextFlush = null; },
    onMeasure: measurement => {
      const value = { ...measurement, expressionMs, vdomMs: Math.max(0, measurement.renderMs - expressionMs), events: events.slice(eventCursor) };
      expressionMs = 0; eventCursor = events.length; measurements.push(value);
      nextFlush?.resolve(value); nextFlush = null;
    },
  });
  const waitFlush = () => {
    ensure(!nextFlush, 'Concurrent action');
    return new Promise<MeasuredFlush>((resolve, reject) => { nextFlush = { resolve, reject }; });
  };
  function setter<T>(index: number): StateSetter<T> {
    const slot = root.hooks[index]; ensure(slot?.kind === 'state', `Initial State adapter slot ${index} changed`);
    return (slot as { setter: StateSetter<T> }).setter;
  }
  function element<T extends HTMLElement>(selector: string): T {
    const node = output.querySelector<T>(selector); ensure(node, `Missing ${selector}`); return node!;
  }
  const field = (label: string) => element<HTMLInputElement>(`input[aria-label="${label}"]`);
  function button(label: string): HTMLButtonElement {
    const node = [...output.querySelectorAll('button')].find(node => node.textContent === label); ensure(node, `Missing button ${label}`); return node!;
  }
  function oracle(before = new Map<string, Element>()) {
    accepted(root.lastResult); ensure(root.errors.length === 0, 'Runtime diagnostic');
    const slots = root.hooks.slice(0, 10); ensure(slots.every(slot => slot.kind === 'state'), 'State adapter shape');
    const values = slots.map(slot => slot.kind === 'state' ? slot.value : undefined);
    const stateItems = values[0] as typeof model.items;
    ensure(stateItems.length === model.items.length, 'State length');
    stateItems.forEach((item, index) => ensure(item.id === model.items[index].id && item.label === model.items[index].label && item.done === model.items[index].done, `State item ${index}`));
    ensure(values[1] === model.nextId && values[2] === model.draft && values[3] === model.query && values[4] === model.filter
      && values[5] === model.sort && values[6] === '' && values[7] === model.counter && values[8] === 0 && values[9] === model.items.length, 'Committed State/Effect differs from model');
    const expected = visibleTasks(model), rows = [...output.querySelectorAll('li[data-task-id]')];
    ensure(rows.length === expected.length, 'Visible row count'); let retained = 0;
    rows.forEach((row, i) => {
      const item = expected[i]; ensure(row.getAttribute('data-task-id') === item.id, `Visible order ${i}`);
      if (before.has(item.id)) { ensure(row === before.get(item.id), `Identity ${item.id}`); retained++; }
      ensure(row.querySelector<HTMLInputElement>('input[type="text"]')?.value === item.label, `Live label ${item.id}`);
      ensure(row.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked === item.done, `Live checked ${item.id}`);
      ensure(row.classList.contains('done') === item.done, `Class ${item.id}`);
    });
    const done = model.items.filter(item => item.done).length;
    ensure(element('[data-testid="task-summary"]').textContent === `전체 ${model.items.length} · 완료 ${done} · 남음 ${model.items.length - done}`, 'Summary');
    ensure(element('[data-testid="task-sync"]').textContent === `취소 가능한 동기화: ${model.items.length}개`, 'Real async Effect');
    ensure(field('새 항목').value === model.draft && field('항목 검색').value === model.query, 'Root live fields');
    ensure(element<HTMLSelectElement>('select[aria-label="완료 필터"]').value === model.filter && element<HTMLSelectElement>('select[aria-label="목록 정렬"]').value === model.sort, 'Select state');
    ensure(element('output').textContent === String(model.counter), 'FIFO +3 counter');
    ensure(root.host.dirtyForms.size === 0 && root.host.composing.size === 0, 'Input resources after action');
    return { checkedRows: rows.length, stateRows: model.items.length, retainedIdentities: retained, counter: model.counter, nextId: model.nextId, syncedTotal: values[9] };
  }
  const initializationStart = performance.now();
  try {
    accepted(root.mount());
    const seeded = waitFlush();
    // The app is unchanged: use its public root State setters only for initial data.
    setter<typeof model.items>(0)(model.items.map(item => ({ ...item })));
    setter<number>(1)(model.nextId); await seeded;
    await waitFlush(); // Actual cancellable 40ms sync Effect and its follow-up flush.
    const initialization = { elapsedMs: performance.now() - initializationStart,
      cpuMs: measurements.reduce((sum, row) => sum + row.flushMs + row.effectMs, 0),
      flushes: measurements.map(numeric), counts: input.mode === 'counts' ? counts(events) : null, validation: oracle() };
    measurements.length = 0; events.length = 0; eventCursor = 0;

    async function action(action: TaskAction) {
      const before = new Map([...output.querySelectorAll('li[data-task-id]')].map(row => [row.getAttribute('data-task-id')!, row]));
      // Exercise preservation of an active retained row through unrelated operations.
      const lastName = output.querySelector<HTMLInputElement>('li:last-child input[type="text"]');
      if (lastName) { lastName.focus(); lastName.setSelectionRange(0, Math.min(2, lastName.value.length)); }
      let dispatch: () => void;
      switch (action.kind) {
        case 'draft': case 'search': case 'rename': {
          const node = field(action.kind === 'draft' ? '새 항목' : action.kind === 'search' ? '항목 검색' : `${action.id} 이름`);
          node.focus(); node.value = action.value;
          if (node.type !== 'search') node.setSelectionRange(0, Math.min(2, node.value.length));
          dispatch = () => node.dispatchEvent(new Event('input', { bubbles: true })); break;
        }
        case 'filter': case 'sort': {
          const node = element<HTMLSelectElement>(`select[aria-label="${action.kind === 'filter' ? '완료 필터' : '목록 정렬'}"]`);
          node.value = action.value; dispatch = () => node.dispatchEvent(new Event('change', { bubbles: true })); break;
        }
        case 'toggle': { const node = field(`${action.id} 완료`); node.checked = !node.checked; dispatch = () => node.dispatchEvent(new Event('change', { bubbles: true })); break; }
        case 'delete': dispatch = () => element<HTMLButtonElement>(`button[aria-label="${action.id} 삭제"]`).click(); break;
        case 'counter': dispatch = () => button('+1 세 번').click(); break;
        case 'move': dispatch = () => button('마지막 항목을 처음으로').click(); break;
        case 'add': dispatch = () => element('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); break;
        case 'equal': dispatch = () => root.update(); break;
        case 'dirty': {
          const node = field('새 항목'); node.focus(); node.value = 'dirty native probe';
          const ref = root.host.refs.get(node); ensure(ref, 'Dirty binding'); root.host.dirtyForms.set(ref!, ++root.host.inputSequence);
          dispatch = () => setter<string>(2)(model.draft); break;
        }
      }
      const active = document.activeElement as HTMLInputElement | null;
      const selection = active instanceof HTMLInputElement ? [active.selectionStart, active.selectionEnd] : null;
      const previousValue = active instanceof HTMLInputElement ? active.value : null;
      const followup = applyTaskAction(model, action);
      const first = waitFlush(); const start = performance.now(); dispatch();
      const primary = await first; await Promise.resolve(); const primaryMs = performance.now() - start;
      const followups: MeasuredFlush[] = [];
      if (followup) followups.push(await waitFlush());
      const settledMs = performance.now() - start;
      const validation = oracle(before);
      if (active && output.contains(active)) {
        ensure(document.activeElement === active, 'Focus lost on retained node');
        if (selection && active.value === previousValue) ensure(active.selectionStart === selection[0] && active.selectionEnd === selection[1], 'Selection changed');
      }
      const timings = { ...numeric(primary), primaryMs, settledMs,
        followupCpuMs: followups.reduce((sum, row) => sum + row.flushMs + row.effectMs, 0),
        totalCpuMs: primaryMs + followups.reduce((sum, row) => sum + row.flushMs + row.effectMs, 0) };
      const result = { action, timings: input.mode === 'timing' ? timings : null,
        followups: input.mode === 'timing' ? followups.map(numeric) : null,
        counts: input.mode === 'counts' ? { primary: counts(primary.events), total: counts([primary, ...followups].flatMap(row => row.events)) } : null,
        validation };
      measurements.length = 0; events.length = 0; eventCursor = 0; return result;
    }
    return { initialization,
      async step(workload: TaskWorkload, index: number) {
        ensure(taskWorkloads.includes(workload), 'Unknown workload');
        const results = [];
        for (const item of taskActions(workload, index, model)) results.push(await action(item));
        return { workload, index, actions: results, visibility: document.visibilityState, focused: document.hasFocus(),
          totalCpuMs: input.mode === 'timing' ? results.reduce((sum, row) => sum + row.timings!.totalCpuMs, 0) : null };
      },
      dispose() {
        root.unmount(); ensure(!output.childNodes.length && !root.host.nodes.size && !root.host.dirtyForms.size && !root.host.composing.size, 'Unmount resource leak');
        ensure(root.errors.length === 0, 'Unmount error');
      },
    };
  } catch (error) { root.unmount(); throw error; }
}
let current: Awaited<ReturnType<typeof createTaskBenchmark>> | null = null;
Object.assign(window, { taskBenchmark: {
  async setup(input: TaskBenchInput) {
    current?.dispose(); current = null;
    current = await createTaskBenchmark(input, document.getElementById('task-benchmark-output')!);
    return current.initialization;
  },
  async step(workload: TaskWorkload, index: number) { ensure(current, 'Missing app'); return current!.step(workload, index); },
  dispose() { current?.dispose(); current = null; },
} });
