import { expect, it, vi } from 'vitest';
import { FunctionComponent, h, useEffect, useMemo, useState } from '../../src/runtime';
import type { RootOptions } from '../../src/runtime/FunctionComponent';
import type { StateAction, StateSetter, TraceEvent } from '../../src/core/types';
import { container } from '../fixtures/helpers';

function counter(initial = 0, options: RootOptions = {}) {
  let set!: StateSetter<number>;
  const events: TraceEvent[] = [], output = container();
  const render = vi.fn(() => { const [n, setter] = useState(initial); set = setter; return h('p', { attrs: { title: String(n) } }, n); });
  const root = new FunctionComponent(render, {}, output, { ...options, trace: { emit: event => events.push(event) } });
  root.mount(); events.length = 0;
  return { root, output, render, events, set: (action: StateAction<number>) => set(action) };
}

it.each([
  { label: '+1 three times', initial: 0, actions: [(n: number) => n + 1, (n: number) => n + 1, (n: number) => n + 1], expected: 3 },
  { label: '+1 then *2', initial: 1, actions: [(n: number) => n + 1, (n: number) => n * 2], expected: 4 },
  { label: 'SET5 then +1', initial: 1, actions: [5, (n: number) => n + 1], expected: 6 },
  { label: 'captured SET1 three times', initial: 0, actions: [1, 1, 1], expected: 1 },
])('T-S03/T-S04: $label keeps FIFO and commits once', async ({ initial, actions, expected }) => {
  const { root, output, set, events } = counter(initial);
  const revision = root.host.revision;
  actions.forEach(set);
  expect(output.textContent).toBe(String(initial));
  expect(events.filter(e => e.phase === 'enqueue').map(e => e.detail.sequence)).toEqual(actions.map((_, i) => i + 1));
  await Promise.resolve();
  expect(output.textContent).toBe(String(expected)); expect(root.host.revision - revision).toBe(1);
  expect(events.filter(e => e.phase === 'render')).toHaveLength(1);
  root.unmount();
});

it('T-S07: canceled batch/NaN no-op skips render; signed zero remains distinct', async () => {
  const c = counter(); c.set(1); c.set(0); await Promise.resolve();
  expect(c.render).toHaveBeenCalledTimes(1); expect(c.events.filter(e => e.phase === 'patch')).toHaveLength(0);
  c.set(-0); await Promise.resolve(); expect(c.render).toHaveBeenCalledTimes(2); expect(Object.is((c.root.hooks[0] as any).value, -0)).toBe(true);
  c.set(NaN); await Promise.resolve(); c.set(NaN); await Promise.resolve();
  expect(c.render).toHaveBeenCalledTimes(3); c.root.unmount();
});

it('T-S05: await boundaries and later events get separate flushes', async () => {
  const c = counter(); c.set(n => n + 1); await Promise.resolve();
  c.set(n => n + 1); await Promise.resolve();
  expect(c.output.textContent).toBe('2'); expect(c.events.filter(e => e.phase === 'render')).toHaveLength(2); c.root.unmount();
});

it('T-S06: default mode Effect requests run after the whole Effect block in a later flush', async () => {
  const output = container(), log: string[] = [];
  const root = new FunctionComponent(() => {
    const [n, set] = useState(0);
    useEffect(() => { log.push(`a${n}:${output.textContent}`); if (n < 2) set(v => v + 1); return () => { log.push(`-a${n}`); }; }, [n]);
    useEffect(() => { log.push(`b${n}:${output.textContent}`); }, [n]);
    return h('p', null, n);
  }, {}, output);
  root.mount(); expect(output.textContent).toBe('0');
  await Promise.resolve(); expect(output.textContent).toBe('1');
  await Promise.resolve(); expect(output.textContent).toBe('2');
  expect(log).toEqual(['a0:0', 'b0:0', '-a0', 'a1:1', 'b1:1', '-a1', 'a2:2', 'b2:2']); root.unmount();
});

it.each(['sync', 'microtask'] as const)('T-S06: native commit callbacks keep later sequence requests (%s)', async batching => {
  const c = counter(0, { batching });
  const element = c.output.firstElementChild!, original = element.setAttribute.bind(element);
  let inside = false, reentered = false;
  vi.spyOn(element, 'setAttribute').mockImplementation((name, value) => {
    if (inside) reentered = true;
    inside = true; original(name, value); if (value === '1') c.set(n => n + 1); inside = false;
  });
  c.set(1); await Promise.resolve(); await Promise.resolve();
  expect(reentered).toBe(false); expect(c.output.textContent).toBe('2');
  expect(c.events.filter(e => e.phase === 'render')).toHaveLength(2); c.root.unmount();
});

it.each(['sync', 'microtask'] as const)('T-S06: infinite Effect chain is stopped across flushes (%s)', async batching => {
  const root = new FunctionComponent(() => { const [n, set] = useState(0); useEffect(() => set(v => v + 1)); return h('p', null, n); }, {}, container(), { batching });
  root.mount(); for (let i = 0; i < 60; i++) await Promise.resolve();
  expect(root.errors).toHaveLength(1); expect(root.errors[0].message).toContain('50');
  expect(root.hooks[0]).toMatchObject({ value: 50 }); root.unmount();
});

it('T-S06/T-E02: failed candidate preserves queue/state/Memo/Effects until explicit retry', async () => {
  let fail = false, set!: StateSetter<number>; const factory = vi.fn((n: number) => n * 2), effect = vi.fn(), output = container();
  const root = new FunctionComponent(() => {
    const [n, setter] = useState(0); set = setter; const doubled = useMemo(() => factory(n), [n]); useEffect(effect, [n]);
    if (fail) throw new Error('candidate failure'); return h('p', null, doubled);
  }, {}, output);
  root.mount(); fail = true; set(n => n + 1); await Promise.resolve();
  expect(root.lastResult?.status).toBe('rejected'); expect(root.hooks[0]).toMatchObject({ value: 0 });
  set(n => n + 1); await Promise.resolve(); expect(factory).toHaveBeenCalledTimes(2); expect(effect).toHaveBeenCalledTimes(1);
  fail = false; root.update(); await Promise.resolve();
  expect(output.textContent).toBe('4'); expect(root.hooks[0]).toMatchObject({ value: 2 }); expect(effect).toHaveBeenCalledTimes(2); root.unmount();
});

it('scheduled flush and old setters cannot write after unmount', async () => {
  const c = counter(); c.set(1); c.root.unmount(); await Promise.resolve();
  expect(c.render).toHaveBeenCalledTimes(1); expect(c.output.childNodes).toHaveLength(0);
  c.set(2); expect(c.root.errors).toHaveLength(1);
});

it('flushForTest invalidates the old scheduled callback without double render', async () => {
  const c = counter(); c.set(1); c.root.flushForTest(); await Promise.resolve();
  expect(c.render).toHaveBeenCalledTimes(2); expect(c.output.textContent).toBe('1'); c.root.unmount();
});

it('sync/microtask preserve pure-action final state while recording different intermediate Effects', async () => {
  const results: { state: unknown; text: string | null; effects: number[] }[] = [];
  for (const batching of ['sync', 'microtask'] as const) {
    let set!: StateSetter<number>; const effects: number[] = [], output = container();
    const root = new FunctionComponent(() => {
      const [n, setter] = useState(0); set = setter; useEffect(() => { effects.push(n); }, [n]); return h('p', null, n);
    }, {}, output, { batching }); root.mount();
    set(v => v + 1); set(v => v * 2); set(v => v + 1); await Promise.resolve();
    results.push({ state: root.hooks[0].kind === 'state' ? root.hooks[0].value : undefined, text: output.textContent, effects }); root.unmount();
  }
  expect(results).toEqual([{ state: 3, text: '3', effects: [0, 1, 2, 3] }, { state: 3, text: '3', effects: [0, 3] }]);
});

it('FIFO across slots agrees with a separately computed sequential action log', async () => {
  let a!: StateSetter<number>, b!: StateSetter<number>;
  const output = container(), root = new FunctionComponent(() => {
    const [x, sx] = useState(0), [y, sy] = useState(0); a = sx; b = sy; return h('p', null, `${x}:${y}`);
  }, {}, output); root.mount();
  const expected = [0, 0];
  for (let i = 0; i < 100; i++) {
    const slot = i % 2, replacement = i % 7 === 0;
    expected[slot] = replacement ? i : expected[slot] + i;
    [a, b][slot](replacement ? i : n => n + i);
  }
  await Promise.resolve(); expect(output.textContent).toBe(expected.join(':')); root.unmount();
});
