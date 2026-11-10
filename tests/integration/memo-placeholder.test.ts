// S1 (2026-11-10): a placeholder/primitive/element slot that turns into a memo() component
// (and back) must never compare memo props against a non-component previous record.
import { afterEach, expect, it, vi } from 'vitest';
import { FunctionComponent, h, memo, useEffect, useState } from '../../src/runtime';
import { evaluateExpression } from '../../src/runtime/resolve';
import type { EvaluationResult } from '../../src/runtime/resolve';
import type { PureComponent, RenderValue, StateSetter, VElement, VNode } from '../../src/core/types';

afterEach(() => { document.body.replaceChildren(); });

function counting<P>(component: PureComponent<P>) {
  const calls: P[] = [];
  const counted: PureComponent<P> = props => { calls.push(props as P); return component(props); };
  Object.defineProperty(counted, 'name', { value: component.name || 'Row' });
  return { calls, counted };
}
const Plain: PureComponent<{ label: string }> = props => h('em', null, props.label);
const OtherMemo = memo((props: { label: string }) => h('strong', null, props.label));
const others: [string, () => RenderValue][] = [
  ['null', () => null], ['undefined', () => undefined], ['false', () => false], ['true', () => true],
  ['text', () => 'plain'], ['number', () => 7], ['element', () => h('p', null, 'el')],
  ['plain component', () => h(Plain, { label: 'plain' })], ['other memo', () => h(OtherMemo, { label: 'other' })],
];
const slots = {
  root: (value: RenderValue): RenderValue => value,
  child: (value: RenderValue): RenderValue => h('div', null, h('span', null, 'fixed'), value),
};
const slotNode = (slot: keyof typeof slots, result: EvaluationResult): VNode =>
  slot === 'root' ? result.snapshot.children[0] : (result.snapshot.children[0] as VElement).children[1];

for (const slot of ['root', 'child'] as const) for (const reuse of [true, false]) {
  it.each(others)(`${slot} slot, reuse=${reuse}: %s -> memo -> same -> back -> memo never reads props of a non-component record`, (_name, other) => {
    const row = counting((props: { label: string }) => h('li', null, props.label));
    const Row = memo(row.counted);
    const memoValue = (label: string) => h(Row, { label });
    const at = slots[slot];
    let state = evaluateExpression(at(other()), null, reuse);
    const before = slotNode(slot, state);
    expect(row.calls).toHaveLength(0);
    // other -> memo: the previous record is not this component, so the row must run.
    state = evaluateExpression(at(memoValue('a')), state.nextState, reuse);
    expect(row.calls.map(props => props.label)).toEqual(['a']);
    const first = slotNode(slot, state) as VElement;
    expect(first).toMatchObject({ kind: 'element', tag: 'li' }); expect(first.identity.boundaries[0].type).toBe(Row);
    expect(first).not.toBe(before);
    // memo -> memo with equal props: reused only when engine reuse is on.
    state = evaluateExpression(at(memoValue('a')), state.nextState, reuse);
    expect(row.calls).toHaveLength(reuse ? 1 : 2); expect(state.memoReuses).toBe(reuse ? 1 : 0);
    if (reuse) expect(slotNode(slot, state)).toBe(first);
    // memo -> other -> memo: the record of the intermediate value is never a reusable memo record.
    state = evaluateExpression(at(other()), state.nextState, reuse);
    expect(slotNode(slot, state)).not.toBe(first);
    const calls = row.calls.length;
    state = evaluateExpression(at(memoValue('a')), state.nextState, reuse);
    expect(row.calls).toHaveLength(calls + 1); expect(state.memoReuses).toBe(0);
    expect(slotNode(slot, state)).toMatchObject({ kind: 'element', tag: 'li' }); expect(slotNode(slot, state)).not.toBe(first);
  });
}

it('memo props are compared only with a previous record of the same component type and key', () => {
  const row = counting((props: { label: string }) => h('li', null, props.label));
  const Row = memo(row.counted), Twin = memo(row.counted);
  const at = (value: RenderValue) => h('div', null, h('span', null, 'fixed'), value);
  let state = evaluateExpression(at(h(Row, { key: 'a', label: 'x' })), null, true);
  state = evaluateExpression(at(h(Row, { key: 'a', label: 'x' })), state.nextState, true);
  expect(row.calls).toHaveLength(1); expect(state.memoReuses).toBe(1);
  state = evaluateExpression(at(h(Row, { key: 'b', label: 'x' })), state.nextState, true); // key change
  expect(row.calls).toHaveLength(2); expect(state.memoReuses).toBe(0);
  state = evaluateExpression(at(h(Twin, { key: 'b', label: 'x' })), state.nextState, true); // type change, equal props
  expect(row.calls).toHaveLength(3); expect(state.memoReuses).toBe(0);
  state = evaluateExpression(at(h(Twin, { label: 'x' })), state.nextState, true); // key removed
  expect(row.calls).toHaveLength(4); expect(state.memoReuses).toBe(0);
  state = evaluateExpression(at(h(Twin, { label: 'x' })), state.nextState, true);
  expect(row.calls).toHaveLength(4); expect(state.memoReuses).toBe(1);
});

for (const slot of ['root', 'child'] as const) {
  it(`${slot} slot through FunctionComponent: null <-> memo keeps DOM identity rules, latest callback, Hooks/Effects and failed-render retry`, async () => {
    const output = document.createElement('section'); document.body.append(output);
    const row = counting((props: { label: string; onPick: () => void }) => h('button', { events: { click: props.onPick } }, props.label));
    const Row = memo(row.counted);
    const picks: string[] = [], effect = vi.fn(), cleanup = vi.fn();
    let setShow!: StateSetter<boolean>, setLabel!: StateSetter<string>, fail = false;
    const root = new FunctionComponent(() => {
      const [show, a] = useState(false), [label, b] = useState('one'); setShow = a; setLabel = b;
      useEffect(() => { effect(show, label); return cleanup; }, [show, label]);
      const value = show ? h(Row, { label, onPick: () => picks.push(label) }) : null;
      if (slot === 'root') return fail ? h('blink', null) : value;
      return h('div', null, h('span', null, 'fixed'), value, fail ? h('blink', null) : null);
    }, {}, output, { onError: () => undefined });
    const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
    const button = () => output.querySelector('button');
    root.mount();
    const fixed = output.querySelector('span'), placeholder = slot === 'root' ? output.firstChild! : output.firstChild!.childNodes[1];
    expect(placeholder.nodeType).toBe(8); expect(button()).toBeNull(); expect(effect).toHaveBeenCalledTimes(1);
    // null -> memo
    setShow(true); await flush();
    expect(root.errors).toEqual([]); expect(root.lastResult?.status).toBe('committed');
    expect(button()?.textContent).toBe('one'); expect(row.calls).toHaveLength(1);
    expect(placeholder.isConnected).toBe(false); expect(output.querySelector('span')).toBe(fixed);
    expect(effect).toHaveBeenCalledTimes(2); expect(cleanup).toHaveBeenCalledTimes(1);
    const firstButton = button()!;
    // A new callback prop is a prop change: the row runs and the DOM node keeps its identity with the latest handler.
    setLabel('two'); await flush();
    expect(button()).toBe(firstButton); expect(firstButton.textContent).toBe('two'); expect(row.calls).toHaveLength(2);
    firstButton.click(); expect(picks).toEqual(['two']);
    // memo -> null: the row's DOM node leaves; later it comes back as a new node.
    setShow(false); await flush();
    expect(button()).toBeNull(); expect(firstButton.isConnected).toBe(false); expect(root.errors).toEqual([]);
    // A failed render while the slot turns into the memo row commits nothing.
    const callsBeforeFail = row.calls.length;
    fail = true; setShow(true); await flush();
    expect(root.errors).toHaveLength(1); expect(button()).toBeNull();
    if (slot === 'child') expect(output.querySelector('span')).toBe(fixed);
    const effectsBefore = effect.mock.calls.length;
    fail = false; root.update(); await flush();
    expect(root.errors).toHaveLength(1); expect(button()?.textContent).toBe('two'); expect(button()).not.toBe(firstButton);
    // The failed candidate was not committed, so its row evaluation (child slot only: the root
    // variant fails before reaching the row) is not reused: the retry runs the row again.
    expect(row.calls.length).toBe(callsBeforeFail + (slot === 'root' ? 1 : 2));
    expect(effect.mock.calls.length).toBe(effectsBefore + 1); expect(effect.mock.calls.at(-1)).toEqual([true, 'two']);
    button()!.click(); expect(picks).toEqual(['two', 'two']);
    root.unmount(); expect(output.childNodes).toHaveLength(0);
  });
}
