import { expect, it, vi } from 'vitest';
import { diff } from '../../src/core/reconcile';
import { commit } from '../../src/core/patch';
import { captureDOM, adoptCapture } from '../../src/core/capture';
import { unwrap } from '../../src/core/vdom';
import { h, FunctionComponent, useEffect, useMemo, useState } from '../../src/runtime';
import { resolveExpression } from '../../src/runtime/resolve';
import type { PatchPlan, StateSetter, VElement } from '../../src/core/types';
import { apply, container, render, snapshot } from '../fixtures/helpers';

it.each(['same-ref', 'equal-fresh'] as const)('T-N01: %s keeps revision, bindings, history data and live uncontrolled values', variant => {
  const tree = resolveExpression(h('div', null, h('input', { form: { mode: 'uncontrolled', defaultValue: 'initial' } }), h('span', null, 'stable')));
  const { root, mount } = render(tree), revision = mount.revision, nodes = [...mount.nodes];
  root.querySelector('input')!.value = 'user text';
  const target = variant === 'same-ref' ? tree : resolveExpression(h('div', null, h('input', { form: { mode: 'uncontrolled', defaultValue: 'initial' } }), h('span', null, 'stable')));
  const result = apply(mount, target);
  expect(result.status).toBe('noop'); expect(mount.revision).toBe(revision);
  expect(mount.view.snapshot).toBe(target); expect([...mount.nodes]).toEqual(nodes);
  expect(root.querySelector('input')!.value).toBe('user text');
  expect((tree.children[0] as VElement).children[0]).toMatchObject({ form: { defaultValue: 'initial' } });
});

it.each(['same-ref', 'equal-fresh'] as const)('T-N02: %s still rejects an externally replaced equal DOM object, then supports recapture', variant => {
  const tree = snapshot('<p>unchanged</p>'), { root, mount } = render(tree);
  const target = variant === 'same-ref' ? tree : snapshot('<p>unchanged</p>');
  const plan = unwrap(diff(mount.view, target));
  root.firstChild!.replaceWith(root.firstChild!.cloneNode(true));
  const replacement = root.firstChild;
  expect(commit(mount, plan).status).toBe('rejected'); expect(root.firstChild).toBe(replacement);
  expect(adoptCapture(mount, unwrap(captureDOM(mount))).ok).toBe(true);
  expect(apply(mount, target).status).toBe('noop'); expect(root.firstChild).toBe(replacement);
});

it('T-N03: no-op plans still enforce mount, revision, view child, host fields and registry ownership', () => {
  const tree = snapshot('<p title="A">same</p>'), { root, mount } = render(tree);
  const other = render(tree), plan = unwrap(diff(mount.view, tree));
  expect(commit(other.mount, plan).status).toBe('rejected');
  const node = plan.nextView.children[0];
  const bad: PatchPlan = { ...plan, nextView: { ...plan.nextView, children: [{ ...node, vnode: { ...node.vnode, attrs: { title: 'B' } } as VElement }] } };
  expect(commit(mount, bad).status).toBe('rejected'); expect(root.firstElementChild!.getAttribute('title')).toBe('A');
  mount.nodes.set('foreign', document.createTextNode('outside'));
  expect(commit(mount, plan).status).toBe('rejected'); mount.nodes.delete('foreign');
  apply(mount, snapshot('<p title="A">changed</p>'));
  expect(commit(mount, plan).status).toBe('rejected');
});

it('T-N04: equal output still commits changed Hook state and runs its Effect; failed binding check commits neither', async () => {
  const output = container(); let set!: StateSetter<number>;
  const setup = vi.fn(), cleanup = vi.fn();
  const root = new FunctionComponent(() => {
    const [n, setter] = useState(0); set = setter;
    useEffect(() => { setup(n); return () => cleanup(n); }, [n]);
    return useMemo(() => h('p', null, 'same DOM'), []);
  }, {}, output);
  root.mount(); const node = output.firstChild; const revision = root.host.revision;
  set(1); await Promise.resolve();
  expect(root.lastResult?.status).toBe('noop'); expect(output.firstChild).toBe(node); expect(root.host.revision).toBe(revision);
  expect(setup.mock.calls).toEqual([[0], [1]]); expect(cleanup.mock.calls).toEqual([[0]]);
  output.firstChild!.replaceWith(output.firstChild!.cloneNode(true));
  set(2); await Promise.resolve();
  expect(root.lastResult?.status).toBe('rejected'); expect(root.hooks[0]).toMatchObject({ value: 1 });
  expect(setup.mock.calls).toEqual([[0], [1]]);
  root.unmount(); expect(cleanup.mock.calls).toEqual([[0], [1]]); expect(root.host.nodes.size).toBe(0);
});

it('T-N05: handler replacement/removal and form-policy rejection remain observable after a no-op', () => {
  const a = vi.fn(), b = vi.fn();
  const view = (handler: () => void) => resolveExpression(h('button', { events: { click: handler } }, 'same'));
  const tree = view(a), { root, mount } = render(tree); apply(mount, tree);
  const button = root.firstElementChild as HTMLButtonElement; button.click(); apply(mount, view(b)); button.click();
  apply(mount, resolveExpression(h('button', null, 'same'))); button.click();
  expect(a).toHaveBeenCalledOnce(); expect(b).toHaveBeenCalledOnce(); expect(root.firstChild).toBe(button);
  const inputTree = resolveExpression(h('input', { form: { mode: 'uncontrolled', defaultValue: 'A' } }));
  const input = render(inputTree); apply(input.mount, inputTree);
  expect(diff(input.mount.view, resolveExpression(h('input', { form: { mode: 'controlled', value: 'B' } }))).ok).toBe(false);
});
