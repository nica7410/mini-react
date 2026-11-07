import { afterEach, expect, it, vi } from 'vitest';
import { FunctionComponent, h, useEffect, useState } from '../../src/runtime';
import type { StateSetter } from '../../src/core/types';
import { EditorController } from '../../src/editor/controller';
import { container } from '../fixtures/helpers';

afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });
const endComposition = async (input: Element) => {
  input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '한' }));
  await new Promise(resolve => setTimeout(resolve, 5));
};

it('T-B04: safe unrelated commit proceeds, composing value is held, and no-op restoration resumes after end', async () => {
  let set!: StateSetter<number>; const output = container(); document.body.append(output);
  const effect = vi.fn(), root = new FunctionComponent(() => {
    const [n, setter] = useState(0); set = setter; useEffect(effect, [n]);
    return h('div', null, h('input', { form: { mode: 'controlled', value: 'fixed' } }), h('output', null, n));
  }, {}, output); root.mount(); const input = output.querySelector('input')!;
  input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  input.value = 'ㅎ'; input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
  await Promise.resolve(); await Promise.resolve();
  set(1); await Promise.resolve();
  expect(input.value).toBe('ㅎ'); expect(output.querySelector('output')!.textContent).toBe('1');
  expect(root.host.heldForms.size).toBe(1); expect(root.host.dirtyForms.size).toBe(0); expect(effect).toHaveBeenCalledTimes(2);
  await endComposition(input); expect(input.value).toBe('fixed'); expect(root.host.heldForms.size).toBe(0); expect(effect).toHaveBeenCalledTimes(2);
  root.unmount();
});

it.each(['move', 'remove', 'replace', 'type', 'disabled', 'hidden', 'style'])('T-B04/T-F03: %s conflict defers all writes and all candidate Hooks/Effects', async conflict => {
  let set!: StateSetter<boolean>; const output = container(); document.body.append(output); const effect = vi.fn();
  const root = new FunctionComponent(() => {
    const [changed, setter] = useState(false); set = setter; useEffect(effect, [changed]);
    const input = h(changed && conflict === 'replace' ? 'textarea' : 'input', {
      attrs: { ...(conflict === 'type' ? { type: changed ? 'password' : 'text' } : {}), disabled: changed && conflict === 'disabled' },
      form: { mode: 'controlled', value: 'initial' },
    });
    const row = h('li', { key: 'a', attrs: { hidden: changed && conflict === 'hidden' }, style: { color: changed && conflict === 'style' ? 'red' : 'black' } }, input);
    const other = h('li', { key: 'b' }, 'B');
    return h('div', null, h('output', null, changed ? 'changed' : 'old'), h('ul', null,
      changed && conflict === 'remove' ? [other] : changed && conflict === 'move' ? [row, other] : [other, row]));
  }, {}, output); root.mount(); const input = output.querySelector('input')!, before = output.innerHTML, revision = root.host.revision;
  input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); set(true); await Promise.resolve();
  expect(root.lastResult?.status).toBe('deferred'); expect(output.innerHTML).toBe(before); expect(root.host.revision).toBe(revision);
  expect(root.hooks[0]).toMatchObject({ value: false }); expect(effect).toHaveBeenCalledTimes(1);
  await Promise.resolve(); expect(root.errors).toHaveLength(0);
  await endComposition(input);
  expect(root.lastResult?.status).not.toBe('deferred'); expect(root.hooks[0]).toMatchObject({ value: true });
  expect(output.querySelector('output')!.textContent).toBe('changed'); expect(effect).toHaveBeenCalledTimes(2); root.unmount();
});

it('T-B04: no stale deferred plan is replayed; latest render and all FIFO updates win', async () => {
  let set!: StateSetter<number>, latest = 'before'; const output = container();
  const root = new FunctionComponent(() => {
    const [n, setter] = useState(0); set = setter;
    const a = h('li', { key: 'a' }, h('input', { form: { mode: 'uncontrolled', defaultValue: 'a' } }));
    const b = h('li', { key: 'b' }, 'b');
    return h('div', null, h('output', null, `${latest}:${n}`), h('ul', null, n ? [a, b] : [b, a]));
  }, {}, output); root.mount(); const input = output.querySelector('input')!;
  input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  set(n => n + 1); await Promise.resolve(); expect(root.lastResult?.status).toBe('deferred');
  set(n => n + 1); await Promise.resolve(); expect(root.lastResult?.status).toBe('deferred');
  latest = 'latest'; await endComposition(input);
  expect(output.querySelector('output')!.textContent).toBe('latest:2'); expect(output.querySelector('input')).toBe(input); root.unmount();
});

it('T-B04: new requests can cancel a conflicting candidate while composition continues', async () => {
  let set!: StateSetter<boolean>; const output = container();
  const root = new FunctionComponent(() => {
    const [remove, setter] = useState(false); set = setter;
    return h('div', null, remove ? null : h('input', { form: { mode: 'controlled', value: 'fixed' } }));
  }, {}, output); root.mount(); const input = output.querySelector('input')!;
  input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); set(true); await Promise.resolve();
  expect(root.lastResult?.status).toBe('deferred'); set(false); await Promise.resolve();
  expect(root.lastResult?.status).toBe('noop'); expect(root.host.composing.size).toBe(1); expect(output.querySelector('input')).toBe(input); root.unmount();
});

it('T-H06/T-B04: composing editor rejects programmatic Patch/Undo and does not advance history', async () => {
  const actual = container('<input value="initial">'), test = container(), editor = new EditorController(actual, test);
  const input = test.querySelector('input')!; input.value = 'first'; expect(editor.patch().ok).toBe(true);
  const cursor = editor.history.cursor; input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  input.value = 'ㅎ'; expect(editor.canUndo).toBe(false);
  expect(editor.patch()).toMatchObject({ ok: false, diagnostics: [{ code: 'COMPOSING' }] });
  expect(editor.travel('undo').ok).toBe(false); expect(editor.history.cursor).toBe(cursor);
  expect(actual.querySelector('input')!.value).toBe('first'); await endComposition(input); expect(editor.canUndo).toBe(true); editor.dispose();
});

it('T-B04/T-F06: unmount clears composing nodes, held refs, fallback timers and pending root work', async () => {
  vi.useFakeTimers();
  const output = container(), root = new FunctionComponent(() => h('input', { form: { mode: 'controlled', value: 'fixed' } }), {}, output);
  root.mount(); const input = output.querySelector('input')!;
  input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  input.value = 'ㅎ'; input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); root.unmount();
  await vi.runAllTimersAsync();
  expect(root.host.composing.size).toBe(0); expect(root.host.heldForms.size).toBe(0); expect(root.host.nodes.size).toBe(0);
  expect(root.host.compositionEndTimer).toBeUndefined(); expect(root.host.inputFallbackTimer).toBeUndefined(); expect(root.errors).toHaveLength(0);
});
