import { afterEach, expect, it } from 'vitest';
import { TaskApp, TaskAppWithRowMemo } from '../../src/app/tasks';
import { FunctionComponent, h, memo, useState } from '../../src/runtime';
import { evaluateExpression } from '../../src/runtime/resolve';
import type { PureComponent, StateSetter, TraceEvent, VElement } from '../../src/core/types';

afterEach(() => { document.body.replaceChildren(); });

function counting<P>(component: PureComponent<P>) {
  const calls: unknown[] = [];
  const counted: PureComponent<P> = props => { calls.push(props); return component(props); };
  Object.defineProperty(counted, 'name', { value: component.name });
  return { calls, counted };
}

it('T-M05: memo() reuses a row only when type, key and every prop (including handlers) are equal', () => {
  const plain = counting((props: { label: string; onClick: () => void }) => h('li', { events: { click: props.onClick } }, props.label));
  const Row = memo(plain.counted);
  const click = () => undefined, other = () => undefined;
  const view = (labels: string[], handler = click, keys = ['k0', 'k1', 'k2']) => h('ul', null, ...labels.map((label, i) => h(Row, { key: keys[i], label, onClick: handler })));
  const first = evaluateExpression(view(['a', 'b', 'c']), null, true);
  expect(plain.calls).toHaveLength(3);
  const same = evaluateExpression(view(['a', 'b', 'c']), first.nextState, true);
  expect(plain.calls).toHaveLength(3); expect(same.componentExecutions).toBe(0);
  const rows = (result: typeof first) => (result.snapshot.children[0] as VElement).children;
  expect(rows(same)).toEqual(rows(first)); expect(rows(same)[1]).toBe(rows(first)[1]);
  const changed = evaluateExpression(view(['a', 'B', 'c']), same.nextState, true);
  expect(changed.componentExecutions).toBe(1); expect(rows(changed)[0]).toBe(rows(first)[0]); expect(rows(changed)[1]).not.toBe(rows(first)[1]);
  // A new handler function is a prop change: the row runs again and carries the new handler.
  const handler = evaluateExpression(view(['a', 'B', 'c'], other), changed.nextState, true);
  expect(handler.componentExecutions).toBe(3);
  expect((rows(handler)[0] as VElement).events.click.handler).toBe(other);
  // A key change is a different row; engine reuse off disables memo too.
  expect(evaluateExpression(view(['a', 'B', 'c'], other, ['x', 'k1', 'k2']), handler.nextState, true).componentExecutions).toBe(1);
  expect(evaluateExpression(view(['a', 'B', 'c'], other), handler.nextState, false).componentExecutions).toBe(3);
  // A component that is not wrapped keeps running every time.
  const bare = counting((props: { label: string }) => h('p', null, props.label));
  const once = evaluateExpression(h(bare.counted, { label: 'x' }), null, true);
  evaluateExpression(h(bare.counted, { label: 'x' }), once.nextState, true);
  expect(bare.calls).toHaveLength(2);
});

it('T-M05: a failed render leaves no reusable record, so the retry re-evaluates against the committed props', async () => {
  const output = document.createElement('section'); document.body.append(output);
  const row = counting((props: { label: string }) => h('li', null, props.label));
  const Row = memo(row.counted);
  let fail = false, set!: StateSetter<string>;
  const root = new FunctionComponent(() => {
    const [label, setter] = useState('one'); set = setter;
    // An unsupported sibling tag fails validation after the row has been evaluated.
    return h('ul', null, h(Row, { key: 'r', label }), fail ? h('blink', null) : null);
  }, {}, output, { onError: () => undefined });
  root.mount(); expect(row.calls).toHaveLength(1);
  fail = true; set('two'); await Promise.resolve();
  expect(output.textContent).toBe('one'); expect(root.errors).toHaveLength(1);
  fail = false; root.update(); await Promise.resolve();
  expect(output.textContent).toBe('two');
  // The failed attempt evaluated the row with 'two' but was not committed, so the retry
  // compares with the committed 'one' and runs the row again instead of reusing it.
  expect(row.calls.map(props => (props as { label: string }).label)).toEqual(['one', 'two', 'two']);
  root.update(); await Promise.resolve();
  expect(row.calls).toHaveLength(3);
  root.unmount();
});

async function mountApp(App: () => ReturnType<typeof TaskApp>) {
  const output = document.createElement('section'); document.body.append(output);
  const events: TraceEvent[] = []; let notify: (() => void) | undefined;
  const nextFlush = () => new Promise<void>(resolve => { notify = resolve; });
  const root = new FunctionComponent(App, {}, output, { trace: { emit: event => events.push(event) }, onMeasure: () => { const callback = notify; notify = undefined; callback?.(); } });
  root.mount(); await nextFlush();
  const rows = () => events.filter(event => event.phase === 'component' && !event.detail.reused && /\/key:task-\d+$/.test(String(event.detail.path))).length;
  const act = async (run: () => void) => { const flushed = nextFlush(); events.length = 0; run(); await flushed; return rows(); };
  return { output, root, act, input: (label: string) => output.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)! };
}
const type = (node: HTMLInputElement, value: string) => { node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })); };
const click = (node: Element) => (node as HTMLElement).click();

it('T-A06: A2 re-evaluates only the changed row for rename/toggle, none for draft/delete, and matches A0 output', async () => {
  const results: { html: string; values: [string, boolean][]; executions: number[] }[] = [];
  for (const App of [TaskApp, TaskAppWithRowMemo]) {
    const app = await mountApp(App), executions: number[] = [];
    const keep = app.input('task-1 이름');
    executions.push(await app.act(() => type(app.input('새 항목'), '임시')));
    executions.push(await app.act(() => type(app.input('task-3 이름'), '바뀐 이름')));
    executions.push(await app.act(() => click(app.input('task-4 완료'))));
    executions.push(await app.act(() => click(app.output.querySelector('button[aria-label="task-2 삭제"]')!)));
    executions.push(await app.act(() => click([...app.output.querySelectorAll('button')].find(node => node.textContent === '항목 추가')!)));
    executions.push(await app.act(() => click([...app.output.querySelectorAll('button')].find(node => node.textContent === '마지막 항목을 처음으로')!)));
    expect(app.input('task-1 이름')).toBe(keep);
    expect(app.root.errors).toEqual([]);
    results.push({ html: app.output.innerHTML, values: [...app.output.querySelectorAll('input')].map(node => [node.value, node.checked]), executions });
    app.root.unmount();
  }
  const [a0, a2] = results;
  expect(a2.html).toBe(a0.html); expect(a2.values).toEqual(a0.values);
  expect(a0.executions).toEqual([8, 8, 8, 7, 8, 8]);
  // draft 0, rename 1, toggle 1, delete 0, add 1 (new row), move 0 (same rows, new order).
  expect(a2.executions).toEqual([0, 1, 1, 0, 1, 0]);
});

it('T-A06: a reused A2 row restores a dirty controlled input and keeps calling handlers with the latest State', async () => {
  const app = await mountApp(TaskAppWithRowMemo);
  const name = app.input('task-5 이름'), ref = app.root.host.refs.get(name)!;
  // Dirty native value without a State change: the row is reused, the committed value is restored.
  expect(await app.act(() => { name.value = 'native dirty'; app.root.host.dirtyForms.set(ref, ++app.root.host.inputSequence); app.root.update(); })).toBe(0);
  expect(name.value).toBe('Hook 추적');
  // Callbacks retained in reused rows use functional updates on the latest State.
  await app.act(() => { type(app.input('task-6 이름'), 'A'); click(app.input('task-6 완료')); type(app.input('task-6 이름'), 'B'); });
  expect(app.input('task-6 이름').value).toBe('B'); expect(app.input('task-6 완료').checked).toBe(true);
  await app.act(() => click(app.output.querySelector('button[aria-label="task-7 삭제"]')!));
  expect(app.output.querySelector('[data-testid="task-summary"]')!.textContent).toBe('전체 7 · 완료 1 · 남음 6');
  expect(app.root.errors).toEqual([]);
  app.root.unmount();
});
