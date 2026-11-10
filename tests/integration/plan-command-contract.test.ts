// S1 (2026-11-10): command admissibility contract of the Patch preflight.
// A plan whose final simulated state equals a valid target must still be rejected, before the
// first host write, when one of its commands carries a payload the tree rules forbid and a
// later command hides it (SET then REMOVE, a second SYNC_FORM, an update of a created node).
import { afterEach, expect, it, vi } from 'vitest';
import { h } from '../../src/runtime';
import { resolveExpression } from '../../src/runtime/resolve';
import { createMount } from '../../src/core/mount';
import { diff } from '../../src/core/reconcile';
import { applySnapshot, commit } from '../../src/core/patch';
import { isSyncFormOnlyPlan, validatePlan, validatePlanGeneral } from '../../src/core/planValidation';
import { unwrap } from '../../src/core/vdom';
import { render, snapshot } from '../fixtures/helpers';
import type { MountHandle, PatchOp, PatchPlan, VRoot } from '../../src/core/types';

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

const click = vi.fn();
const tree = (extra = false): VRoot => resolveExpression(h('div', { attrs: { id: 'box', class: 'base', title: 't' }, style: { color: 'red' }, events: { click: (event: Event) => click(event.type) } },
  h('a', { attrs: { href: 'https://example.com/' } }, 'link'),
  h('form', null,
    h('input', { attrs: { 'aria-label': 'text' }, form: { mode: 'controlled', value: 'state' } }),
    h('input', { attrs: { 'aria-label': 'ra', type: 'radio', name: 'g' }, form: { mode: 'controlled', checked: true } }),
    h('input', { attrs: { 'aria-label': 'rb', type: 'radio', name: 'g' }, form: { mode: 'controlled', checked: false } }),
    h('select', { attrs: { 'aria-label': 'pick' }, form: { mode: 'controlled', selectedIndices: [1] } }, h('option', null, 'a'), h('option', null, 'b'))),
  h('p', null, 'text'),
  extra ? h('i', null, 'new') : null));

function setup() {
  click.mockClear();
  const root = document.createElement('section'); document.body.append(root);
  const mount = createMount(root);
  expect(applySnapshot(mount, diff(mount.view, tree())).status).toBe('committed');
  const field = (label: string) => root.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
  const ref = (selector: string) => mount.refs.get(root.querySelector(selector)!)!;
  const text = field('text'); text.focus(); text.setSelectionRange(1, 3);
  return { root, mount, field, ref, box: ref('#box'), text };
}
type Env = ReturnType<typeof setup>;
// A plan whose target is the committed snapshot: the forged commands must cancel out.
function forge(mount: MountHandle, operations: PatchOp[]): PatchPlan {
  const plan = unwrap(diff(mount.view, mount.view.snapshot));
  expect(plan.operations).toHaveLength(0);
  return { ...plan, operations, nextView: { ...plan.nextView, revision: mount.revision + 1 } };
}
const hostState = ({ root, mount, field }: Env) => ({
  html: root.innerHTML, style: root.querySelector<HTMLElement>('#box')!.style.cssText,
  native: [field('text').value, field('ra').checked, field('rb').checked, (field('pick') as unknown as HTMLSelectElement).selectedIndex],
  active: document.activeElement, selection: [field('text').selectionStart, field('text').selectionEnd],
  registry: [...mount.nodes], view: mount.view, revision: mount.revision, faulted: mount.faulted,
  dirty: mount.dirtyForms.size, held: mount.heldForms.size,
});
function hostWrites() {
  return [
    vi.spyOn(Element.prototype, 'setAttribute'), vi.spyOn(Element.prototype, 'removeAttribute'),
    vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty'), vi.spyOn(CSSStyleDeclaration.prototype, 'removeProperty'),
    vi.spyOn(EventTarget.prototype, 'addEventListener'), vi.spyOn(EventTarget.prototype, 'removeEventListener'),
    vi.spyOn(Node.prototype, 'insertBefore'), vi.spyOn(Node.prototype, 'removeChild'), vi.spyOn(Node.prototype, 'appendChild'),
    vi.spyOn(Document.prototype, 'createElement'), vi.spyOn(Document.prototype, 'createTextNode'),
    vi.spyOn(HTMLInputElement.prototype, 'value', 'set'), vi.spyOn(HTMLInputElement.prototype, 'checked', 'set'),
    vi.spyOn(HTMLSelectElement.prototype, 'selectedIndex', 'set'), vi.spyOn(HTMLElement.prototype, 'focus'),
  ];
}
function expectRejectedBeforeWrite(env: Env, plan: PatchPlan) {
  const { root, mount } = env;
  // Both preflight paths must reject; a pair that agrees on "accept" proves nothing.
  expect(validatePlanGeneral(mount, plan).ok).toBe(false); expect(validatePlan(mount, plan).ok).toBe(false);
  const before = hostState(env);
  const observer = new MutationObserver(() => undefined);
  observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
  const writes = hostWrites();
  const result = commit(mount, plan);
  for (const spy of writes) { expect(spy).not.toHaveBeenCalled(); spy.mockRestore(); }
  expect(result.status).toBe('rejected');
  expect(observer.takeRecords()).toHaveLength(0); observer.disconnect();
  expect(hostState(env)).toEqual(before); expect(mount.view).toBe(before.view);
  // The original event binding still works and nothing new is bound.
  root.querySelector<HTMLElement>('#box')!.click(); expect(click.mock.calls).toEqual([['click']]);
  // The mount stays usable: a planner plan for the same target is still a no-op.
  expect(commit(mount, unwrap(diff(mount.view, mount.view.snapshot))).status).toBe('noop');
}

const evil = () => undefined;
const masked: Record<string, (env: Env) => PatchOp[]> = {
  'SET_ATTR onclick -> REMOVE_ATTR onclick': e => [
    { kind: 'SET_ATTR', node: e.box, name: 'onclick', value: 'alert(1)' }, { kind: 'REMOVE_ATTR', node: e.box, name: 'onclick' }],
  'SET_ATTR javascript: href -> SET_ATTR original href': e => [
    { kind: 'SET_ATTR', node: e.ref('a'), name: 'href', value: 'javascript:alert(1)' }, { kind: 'SET_ATTR', node: e.ref('a'), name: 'href', value: 'https://example.com/' }],
  'SET_ATTR style -> REMOVE_ATTR style': e => [
    { kind: 'SET_ATTR', node: e.ref('p'), name: 'style', value: 'color:blue' }, { kind: 'REMOVE_ATTR', node: e.ref('p'), name: 'style' }],
  'SET_ATTR srcdoc -> REMOVE_ATTR srcdoc': e => [
    { kind: 'SET_ATTR', node: e.ref('p'), name: 'srcdoc', value: '<script></script>' }, { kind: 'REMOVE_ATTR', node: e.ref('p'), name: 'srcdoc' }],
  'SET_ATTR with a non-string value -> SET_ATTR original': e => [
    { kind: 'SET_ATTR', node: e.box, name: 'title', value: { toString: () => 'x' } as never }, { kind: 'SET_ATTR', node: e.box, name: 'title', value: 't' }],
  'SET_ATTR value on a controlled input -> REMOVE_ATTR value': e => [
    { kind: 'SET_ATTR', node: e.ref('[aria-label="text"]'), name: 'value', value: 'forged' }, { kind: 'REMOVE_ATTR', node: e.ref('[aria-label="text"]'), name: 'value' }],
  'SET_ATTR checked on a controlled radio -> REMOVE_ATTR checked': e => [
    { kind: 'SET_ATTR', node: e.ref('[aria-label="rb"]'), name: 'checked', value: '' }, { kind: 'REMOVE_ATTR', node: e.ref('[aria-label="rb"]'), name: 'checked' }],
  'SET_ATTR selected on an option of a controlled select -> REMOVE_ATTR selected': e => [
    { kind: 'SET_ATTR', node: e.ref('option'), name: 'selected', value: '' }, { kind: 'REMOVE_ATTR', node: e.ref('option'), name: 'selected' }],
  'SET_STYLE url(javascript:) -> REMOVE_STYLE': e => [
    { kind: 'SET_STYLE', node: e.box, name: 'background', value: { value: 'url(javascript:alert(1))', priority: '' } }, { kind: 'REMOVE_STYLE', node: e.box, name: 'background' }],
  'SET_STYLE bad priority -> SET_STYLE original': e => [
    { kind: 'SET_STYLE', node: e.box, name: 'color', value: { value: 'blue', priority: 'urgent' as never } }, { kind: 'SET_STYLE', node: e.box, name: 'color', value: { value: 'red', priority: '' } }],
  'SET_STYLE bad property name -> REMOVE_STYLE': e => [
    { kind: 'SET_STYLE', node: e.box, name: 'behavior', value: { value: 'x', priority: '' } }, { kind: 'REMOVE_STYLE', node: e.box, name: 'behavior' }],
  'SET_EVENT onclick -> SET_EVENT onclick null': e => [
    { kind: 'SET_EVENT', node: e.box, name: 'onclick', binding: { handler: evil, capture: false } }, { kind: 'SET_EVENT', node: e.box, name: 'onclick', binding: null }],
  'SET_EVENT bad name -> SET_EVENT null': e => [
    { kind: 'SET_EVENT', node: e.box, name: 'Click!', binding: { handler: evil, capture: false } }, { kind: 'SET_EVENT', node: e.box, name: 'Click!', binding: null }],
  'SET_TEXT with a non-string value -> SET_TEXT original': e => {
    const text = e.mount.refs.get(e.root.querySelector('p')!.firstChild!)!;
    return [{ kind: 'SET_TEXT', node: text, value: { toString: () => 'x' } as never }, { kind: 'SET_TEXT', node: text, value: 'text' }];
  },
  // SYNC_FORM is not last-wins on the host: checking radio b unchecks radio a natively, and the
  // second command only unchecks b again. The final simulated policy equals the target.
  'SYNC_FORM radio checked=true -> SYNC_FORM original (SYNC_FORM-only path)': e => [
    { kind: 'SYNC_FORM', node: e.ref('[aria-label="rb"]'), policy: { mode: 'controlled', checked: true } },
    { kind: 'SYNC_FORM', node: e.ref('[aria-label="rb"]'), policy: { mode: 'controlled', checked: false } }],
  'SYNC_FORM forged value -> SYNC_FORM original (SYNC_FORM-only path)': e => [
    { kind: 'SYNC_FORM', node: e.ref('[aria-label="text"]'), policy: { mode: 'controlled', value: 'forged' } },
    { kind: 'SYNC_FORM', node: e.ref('[aria-label="text"]'), policy: { mode: 'controlled', value: 'state' } }],
  'SYNC_FORM non-string value -> SYNC_FORM original (SYNC_FORM-only path)': e => [
    { kind: 'SYNC_FORM', node: e.ref('[aria-label="text"]'), policy: { mode: 'controlled', value: { toString: () => 'x' } as never } },
    { kind: 'SYNC_FORM', node: e.ref('[aria-label="text"]'), policy: { mode: 'controlled', value: 'state' } }],
  'SYNC_FORM out-of-range select -> SYNC_FORM original (SYNC_FORM-only path)': e => [
    { kind: 'SYNC_FORM', node: e.ref('select'), policy: { mode: 'controlled', selectedIndices: [9] } },
    { kind: 'SYNC_FORM', node: e.ref('select'), policy: { mode: 'controlled', selectedIndices: [1] } }],
  'SYNC_FORM snapshot policy -> SYNC_FORM original (general path)': e => [
    { kind: 'SYNC_FORM', node: e.ref('[aria-label="text"]'), policy: { mode: 'snapshot', value: 'forged' } },
    { kind: 'SYNC_FORM', node: e.ref('[aria-label="text"]'), policy: { mode: 'controlled', value: 'state' } }],
  'SYNC_FORM radio checked=true -> SYNC_FORM original (general path, mixed with an attribute command)': e => [
    { kind: 'SET_ATTR', node: e.box, name: 'title', value: 't' },
    { kind: 'SYNC_FORM', node: e.ref('[aria-label="rb"]'), policy: { mode: 'controlled', checked: true } },
    { kind: 'SYNC_FORM', node: e.ref('[aria-label="rb"]'), policy: { mode: 'controlled', checked: false } }],
};

it.each(Object.keys(masked))('masked forbidden command "%s" is rejected before the first host write', name => {
  const env = setup();
  const plan = forge(env.mount, masked[name](env));
  if (name.includes('SYNC_FORM-only path')) expect(isSyncFormOnlyPlan(env.mount, plan)).toBe(true);
  else expect(isSyncFormOnlyPlan(env.mount, plan)).toBe(false);
  expectRejectedBeforeWrite(env, plan);
});

it('a created subtree cannot be cleaned up by a later command of the same plan', () => {
  const env = setup(), { mount } = env;
  const plan = unwrap(diff(mount.view, tree(true)));
  const createIndex = plan.operations.findIndex(op => op.kind === 'CREATE_SUBTREE' && op.tree.vnode.kind === 'element' && op.tree.vnode.tag === 'i');
  const create = plan.operations[createIndex] as Extract<PatchOp, { kind: 'CREATE_SUBTREE' }>;
  expect(createIndex).toBeGreaterThanOrEqual(0);
  const placeIndex = plan.operations.findIndex(op => op.kind === 'PLACE_BEFORE');
  for (const hidden of [
    { forgedVNode: { ...create.tree.vnode, attrs: { onclick: 'alert(1)' } }, cleanup: { kind: 'REMOVE_ATTR', node: create.tree.ref, name: 'onclick' } },
    { forgedVNode: { ...create.tree.vnode, style: { behavior: { value: 'x', priority: '' } } }, cleanup: { kind: 'REMOVE_STYLE', node: create.tree.ref, name: 'behavior' } },
    { forgedVNode: { ...create.tree.vnode, events: { onclick: { handler: evil, capture: false } } }, cleanup: { kind: 'SET_EVENT', node: create.tree.ref, name: 'onclick', binding: null } },
  ] as const) {
    const operations = [...plan.operations];
    operations[createIndex] = { kind: 'CREATE_SUBTREE', tree: { ...create.tree, vnode: hidden.forgedVNode as never } };
    operations.splice(placeIndex, 0, hidden.cleanup as PatchOp);
    expectRejectedBeforeWrite(env, { ...plan, operations });
    click.mockClear();
  }
  // The planner's own plan for the same target is still accepted.
  expect(commit(mount, plan).status).toBe('committed'); expect(env.root.querySelector('i')?.textContent).toBe('new');
});

it('legal sequential commands stay legal: repeated attribute/style/event writes and identical SYNC_FORM commands', () => {
  const env = setup(), { root, mount, box } = env;
  const latest = vi.fn(), first = vi.fn();
  const plan = forge(mount, [
    { kind: 'SET_ATTR', node: box, name: 'class', value: 'a' }, { kind: 'SET_ATTR', node: box, name: 'class', value: 'base' },
    { kind: 'SET_ATTR', node: box, name: 'data-x', value: '1' }, { kind: 'REMOVE_ATTR', node: box, name: 'data-x' },
    { kind: 'REMOVE_ATTR', node: box, name: 'title' }, { kind: 'SET_ATTR', node: box, name: 'title', value: 't' },
    { kind: 'SET_STYLE', node: box, name: 'color', value: { value: 'blue', priority: 'important' } }, { kind: 'SET_STYLE', node: box, name: 'color', value: { value: 'red', priority: '' } },
    { kind: 'SET_EVENT', node: box, name: 'keydown', binding: { handler: first, capture: false } }, { kind: 'SET_EVENT', node: box, name: 'keydown', binding: { handler: latest, capture: false } },
    { kind: 'SET_EVENT', node: box, name: 'keydown', binding: null },
    { kind: 'SYNC_FORM', node: env.ref('[aria-label="text"]'), policy: { mode: 'controlled', value: 'state' } },
    { kind: 'SYNC_FORM', node: env.ref('[aria-label="text"]'), policy: { mode: 'controlled', value: 'state' } },
  ]);
  expect(validatePlan(mount, plan).ok).toBe(true); expect(validatePlanGeneral(mount, plan).ok).toBe(true);
  env.text.value = 'user';
  expect(commit(mount, plan).status).toBe('committed');
  expect(root.querySelector('#box')!.getAttribute('class')).toBe('base'); expect(root.querySelector('#box')!.hasAttribute('data-x')).toBe(false);
  expect(root.querySelector<HTMLElement>('#box')!.style.getPropertyValue('color')).toBe('red');
  root.querySelector('#box')!.dispatchEvent(new Event('keydown')); expect(first).not.toHaveBeenCalled(); expect(latest).not.toHaveBeenCalled();
  expect(env.text.value).toBe('state');
});

it('planner plans keep their radio/option application order and are accepted by both paths', () => {
  const env = setup(), { root, mount, field } = env;
  // Radio a -> b, another select option and an option list change in one plan.
  const target = resolveExpression(h('div', { attrs: { id: 'box', class: 'next' }, events: { click: (event: Event) => click(event.type) } },
    h('a', { attrs: { href: 'https://example.com/next' } }, 'link'),
    h('form', null,
      h('input', { attrs: { 'aria-label': 'text' }, form: { mode: 'controlled', value: 'next' } }),
      h('input', { attrs: { 'aria-label': 'ra', type: 'radio', name: 'g' }, form: { mode: 'controlled', checked: false } }),
      h('input', { attrs: { 'aria-label': 'rb', type: 'radio', name: 'g' }, form: { mode: 'controlled', checked: true } }),
      h('select', { attrs: { 'aria-label': 'pick' }, form: { mode: 'controlled', selectedIndices: [2] } }, h('option', null, 'a'), h('option', null, 'b'), h('option', null, 'c'))),
    h('p', null, 'text'), null));
  const plan = unwrap(diff(mount.view, target));
  const forms = plan.operations.filter(op => op.kind === 'SYNC_FORM').map(op => op.node);
  expect(forms).toEqual(['text', 'ra', 'rb', 'pick'].map(label => mount.refs.get(field(label))));
  expect(validatePlan(mount, plan).ok).toBe(true); expect(validatePlanGeneral(mount, plan).ok).toBe(true);
  expect(commit(mount, plan).status).toBe('committed');
  expect([field('text').value, field('ra').checked, field('rb').checked, (field('pick') as unknown as HTMLSelectElement).selectedIndex]).toEqual(['next', false, true, 2]);
  expect(root.querySelector('#box')!.getAttribute('class')).toBe('next'); expect(root.querySelector<HTMLElement>('#box')!.style.cssText).toBe('');
});

it('snapshot-mode select (Phase 1 capture): the planner may move the selected attribute between options', () => {
  // The same attribute that is forbidden under a controlled select is part of a captured snapshot.
  const { root, mount } = render(snapshot('<select><option>a</option><option selected>b</option></select>'));
  const plan = unwrap(diff(mount.view, snapshot('<select><option selected>a</option><option>b</option></select>')));
  expect(plan.operations.some(op => op.kind === 'SET_ATTR' && op.name === 'selected')).toBe(true);
  expect(validatePlan(mount, plan).ok).toBe(true); expect(validatePlanGeneral(mount, plan).ok).toBe(true);
  expect(commit(mount, plan).status).toBe('committed');
  expect(root.querySelector('select')!.selectedIndex).toBe(0); expect(root.querySelectorAll('option')[0].hasAttribute('selected')).toBe(true);
});
