import { expect, it, vi } from 'vitest';
import { FunctionComponent, h, useMemo, useState } from '../../src/runtime';
import type { RenderValue, StateSetter, TraceEvent } from '../../src/core/types';
import { container } from '../fixtures/helpers';

it.each([true, false])('T-M02: reuse=%s changes evaluation/visits, never result or identity', async reuseVNode => {
  const Child = vi.fn(() => h('section', null, h('p', null, 'stable'))), events: TraceEvent[] = [];
  let set!: StateSetter<number>; const output = container();
  const root = new FunctionComponent(() => {
    const [n, setter] = useState(0); set = setter; const child = useMemo(() => h(Child, {}), []);
    return h('div', null, child, h('span', null, n));
  }, {}, output, { reuseVNode, trace: { emit: event => events.push(event) } });
  root.mount(); const childNode = output.querySelector('section'); events.length = 0;
  set(1); await Promise.resolve();
  expect(output.textContent).toBe('stable1'); expect(output.querySelector('section')).toBe(childNode);
  expect(Child).toHaveBeenCalledTimes(reuseVNode ? 1 : 2);
  expect(events.find(e => e.phase === 'diff')!.detail.visitedNodes).toBe(reuseVNode ? 4 : 6);
  expect(events.find(e => e.phase === 'memo')!.detail.reused).toBe(true); root.unmount();
});

it('T-M02: one expression at two positions has independent evaluation records and DOM', async () => {
  const Child = vi.fn(() => h('input', { form: { mode: 'uncontrolled', defaultValue: 'initial' } }));
  const expression = h(Child, {}), output = container();
  const root = new FunctionComponent(() => h('div', null, expression, expression), {}, output);
  root.mount(); const [a, b] = output.querySelectorAll('input'); a.value = 'A'; b.value = 'B';
  root.update(); await Promise.resolve();
  expect(Child).toHaveBeenCalledTimes(2); expect(a).not.toBe(b); expect(a.value).toBe('A'); expect(b.value).toBe('B'); root.unmount();
});

it('T-M02: keyed reordering reuses logical slots; crossing parents or remounting re-evaluates', async () => {
  const Child = vi.fn((p: { text: string }) => h('p', null, p.text));
  const a = h(Child, { key: 'a', text: 'A' }), b = h(Child, { key: 'b', text: 'B' });
  let order = [a, b]; const output = container();
  const root = new FunctionComponent(() => h('div', null, order), {}, output); root.mount();
  const first = output.querySelector('p'); order = [b, a]; root.update(); await Promise.resolve();
  expect(Child).toHaveBeenCalledTimes(2); expect(output.querySelectorAll('p')[1]).toBe(first); root.unmount();
  let left = true;
  const next = new FunctionComponent(() => h('div', null, h('section', { key: 'left' }, left ? a : null), h('section', { key: 'right' }, left ? null : a)), {}, output);
  next.mount(); expect(Child).toHaveBeenCalledTimes(3); left = false; next.update(); await Promise.resolve();
  expect(Child).toHaveBeenCalledTimes(4); next.unmount();
});

it('T-M02: new expressions are evaluated even when props are shallow-equal; removed records are dropped', async () => {
  const Child = vi.fn(() => h('p', null, 'same')), fixed = h(Child, {});
  let mode = 0;
  const output = container(), root = new FunctionComponent(() => h('div', null, mode === 0 ? fixed : mode === 1 ? h(Child, {}) : null), {}, output);
  root.mount(); mode = 1; root.update(); await Promise.resolve(); expect(Child).toHaveBeenCalledTimes(2);
  mode = 2; root.update(); await Promise.resolve(); mode = 0; root.update(); await Promise.resolve();
  expect(Child).toHaveBeenCalledTimes(3); root.unmount();
});

it('T-M03: deps include handler closure values and stable wrappers call the latest handler', async () => {
  let set!: StateSetter<string>; const calls: string[] = [], Child = vi.fn((p: { click: () => void }) => h('button', { events: { click: p.click } }, 'call'));
  const output = container(), root = new FunctionComponent(() => {
    const [mode, setter] = useState('A'); set = setter;
    return useMemo(() => h(Child, { click: () => calls.push(mode) }), [mode]);
  }, {}, output); root.mount(); const button = output.querySelector('button')!; button.click();
  set('B'); await Promise.resolve(); button.click(); expect(output.firstChild).toBe(button);
  expect(calls).toEqual(['A', 'B']); expect(Child).toHaveBeenCalledTimes(2); root.unmount();
});

it('T-M04: failed resolution discards candidate records and preserves committed cached expression', async () => {
  const A = vi.fn(() => h('p', null, 'A')), B = vi.fn(() => h('p', null, 'B'));
  const a = h(A, {}), b = h(B, {}); let fail = false;
  const output = container(), root = new FunctionComponent(() => h('div', null, fail ? b : a, fail ? h('script', null, 'invalid') : null), {}, output);
  root.mount(); fail = true; root.update(); await Promise.resolve();
  expect(root.lastResult?.status).toBe('rejected'); expect(output.textContent).toBe('A'); expect(B).toHaveBeenCalledTimes(1);
  fail = false; root.update(); await Promise.resolve(); expect(A).toHaveBeenCalledTimes(1); expect(output.textContent).toBe('A'); root.unmount();
});

it('T-M04: stable expression still restores dirty controlled fields without re-evaluating its child', async () => {
  const Child = vi.fn(() => h('input', { form: { mode: 'controlled', value: 'fixed' } }));
  const output = container(), root = new FunctionComponent(() => useMemo(() => h(Child, {}), []), {}, output);
  root.mount(); const input = output.querySelector('input')!; input.value = 'native'; input.dispatchEvent(new Event('input', { bubbles: true }));
  await Promise.resolve(); await Promise.resolve();
  expect(input.value).toBe('fixed'); expect(Child).toHaveBeenCalledTimes(1); root.unmount();
});

it('host expression owns its copied configuration; caller mutation cannot invalidate cached VDOM', () => {
  const attrs = { title: 'old' }, style = { color: 'red' }, children: RenderValue[] = ['old'];
  const expression = h('p', { attrs, style }, children);
  attrs.title = 'new'; style.color = 'blue'; children[0] = 'new';
  const output = container(), root = new FunctionComponent(() => expression, {}, output); root.mount();
  expect(output.textContent).toBe('old'); expect(output.firstElementChild!.getAttribute('title')).toBe('old'); root.unmount();
});
