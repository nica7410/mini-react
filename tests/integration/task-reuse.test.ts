import { expect, it } from 'vitest';
import { TaskApp, TaskAppWithRowReuse } from '../../src/app/tasks';
import { FunctionComponent } from '../../src/runtime';
import { createTaskBenchmark } from '../../src/bench/task-app';
import type { TraceEvent } from '../../src/core/types';
import type { TaskWorkload } from '../../src/bench/task-model';

it.each([true, false])('T-A04: default A0 app with engine reuse=%s preserves DOM, input and Effect while re-evaluating rows', async reuse => {
  const output = document.createElement('section'); document.body.append(output);
  const app = await createTaskBenchmark({ size: 10, seed: 539365639, mode: 'counts', reuse }, output);
  try {
    const row = output.querySelector('li');
    for (const workload of ['draft', 'counter', 'equal'] as const) {
      const result = (await app.step(workload, 0)).actions[0];
      expect(result.counts!.primary.rootExecutions).toBe(1);
      // A0 rebuilds row expressions; only the A1 comparison variant skips them.
      expect(result.counts!.primary.taskRowExecutions).toBe(10);
      expect(result.counts!.total.effectSetups).toBe(0);
      expect(result.counts!.total.effectCleanups).toBe(0);
      expect(output.querySelector('li')).toBe(row);
    }
  } finally { app.dispose(); output.remove(); }
});

it('T-A04/T-A05: reuse on/off gives the same sequence, State, native fields and Effect work for real operations', async () => {
  const sequence: [TaskWorkload, number][] = [['draft', 0], ['counter', 0], ['crud', 0], ['move', 0], ['search', 0], ['search', 1],
    ['filter', 0], ['filter', 1], ['sort', 0], ['sort', 1], ['equal', 0], ['dirty', 0], ['crud', 1]];
  const records = [];
  for (const reuse of [false, true]) {
    const output = document.createElement('section'); document.body.append(output);
    const app = await createTaskBenchmark({ size: 10, seed: 539365639, mode: 'counts', reuse }, output);
    const states = [];
    try {
      for (const [workload, index] of sequence) {
        const result = await app.step(workload, index);
        states.push({ validations: result.actions.map(row => row.validation), html: output.innerHTML,
          forms: [...output.querySelectorAll('input')].map(node => [node.value, node.checked]),
          effects: result.actions.map(row => [row.counts!.total.effectSetups, row.counts!.total.effectCleanups]) });
      }
    } finally { app.dispose(); output.remove(); }
    records.push(states);
  }
  expect(records[1]).toEqual(records[0]);
});

it.each([
  ['A0 TaskApp', TaskApp, true, 8],
  ['A1 TaskAppWithRowReuse', TaskAppWithRowReuse, true, 0],
  ['A0 TaskApp', TaskApp, false, 8],
  ['A1 TaskAppWithRowReuse', TaskAppWithRowReuse, false, 8],
] as const)('T-A04: %s with engine reuse=%s row evaluation on unrelated draft/counter updates', async (_name, App, reuseVNode, rowExecutions) => {
  const output = document.createElement('section'); document.body.append(output);
  const events: TraceEvent[] = []; let notify: (() => void) | undefined;
  const nextFlush = () => new Promise<void>(resolve => { notify = resolve; });
  const root = new FunctionComponent(App, {}, output, { reuseVNode, trace: { emit: event => events.push(event) }, onMeasure: () => { const callback = notify; notify = undefined; callback?.(); } });
  try {
    root.mount(); await nextFlush();
    const row = output.querySelector('li');
    const draft = output.querySelector<HTMLInputElement>('input[aria-label="새 항목"]')!;
    const flushed = nextFlush(); events.length = 0;
    draft.value = '임시'; draft.dispatchEvent(new Event('input', { bubbles: true }));
    [...output.querySelectorAll('button')].find(node => node.textContent === '+1 세 번')!.click();
    await flushed;
    const executed = events.filter(event => event.phase === 'component' && !event.detail.reused && /\/key:task-\d+$/.test(String(event.detail.path)));
    expect(executed).toHaveLength(rowExecutions);
    expect(events.filter(event => event.phase === 'render')).toHaveLength(1);
    expect(output.querySelector('li')).toBe(row); expect(draft.value).toBe('임시');
    expect(output.querySelector('output')!.textContent).toBe('3');
    expect(root.errors).toEqual([]);
  } finally { root.unmount(); output.remove(); }
});

it.each([
  ['A0 TaskApp', TaskApp],
  ['A1 TaskAppWithRowReuse', TaskAppWithRowReuse],
] as const)('T-A05: %s callbacks use the latest FIFO State across edits, completion, deletion and consecutive renders', async (_name, App) => {
  const output = document.createElement('section'); document.body.append(output);
  const events: TraceEvent[] = []; let notify: (() => void) | undefined;
  const nextFlush = () => new Promise<void>(resolve => { notify = resolve; });
  const root = new FunctionComponent(App, {}, output, { trace: { emit: event => events.push(event) }, onMeasure: () => { const callback = notify; notify = undefined; callback?.(); } });
  try {
    root.mount(); await nextFlush(); // The real initial 40ms Effect has settled.
    const stableSetter = root.hooks[0].kind === 'state' ? root.hooks[0].setter : null;
    const name = output.querySelector<HTMLInputElement>('input[aria-label="task-1 이름"]')!;
    const done = output.querySelector<HTMLInputElement>('input[aria-label="task-1 완료"]')!;
    const first = nextFlush(); events.length = 0;
    name.value = '첫 변경'; name.dispatchEvent(new Event('input', { bubbles: true }));
    done.checked = true; done.dispatchEvent(new Event('change', { bubbles: true }));
    name.value = '최종 변경'; name.dispatchEvent(new Event('input', { bubbles: true }));
    [...output.querySelectorAll('button')].find(node => node.textContent === '+1 세 번')!.click();
    await first;
    expect(name.value).toBe('최종 변경'); expect(done.checked).toBe(true);
    expect(output.querySelector('output')!.textContent).toBe('3');
    expect(events.filter(event => event.phase === 'render')).toHaveLength(1);
    expect(root.hooks[0].kind === 'state' && root.hooks[0].setter).toBe(stableSetter);
    const second = nextFlush();
    output.querySelector<HTMLButtonElement>('button[aria-label="task-2 삭제"]')!.click();
    name.value = '다음 render'; name.dispatchEvent(new Event('input', { bubbles: true }));
    await second;
    expect(output.querySelectorAll('li')).toHaveLength(7);
    expect(output.querySelector('input[aria-label="task-1 이름"]')).toBe(name);
    expect(name.value).toBe('다음 render'); expect(done.checked).toBe(true);
    expect(output.querySelector('[data-testid="task-summary"]')!.textContent).toBe('전체 7 · 완료 1 · 남음 6');
    expect(root.errors).toEqual([]);
  } finally { root.unmount(); output.remove(); }
});
