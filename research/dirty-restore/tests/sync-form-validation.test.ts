// Research test for the dirty-restore candidate (copied into the candidate tree's tests/integration by run-tests.mjs).
// Compares the SYNC_FORM-only walk with the general graph path on valid and broken plans,
// and checks the FunctionComponent restore behaviour that the candidate must not change.
import { afterEach, expect, it, vi } from 'vitest';
import { FunctionComponent, h, useEffect, useState } from '../../src/runtime';
import type { MountHandle, PatchPlan, StateSetter, ViewNode } from '../../src/core/types';
import { diff } from '../../src/core/reconcile';
import { commit } from '../../src/core/patch';
import { isSyncFormOnlyPlan, validatePlan, validatePlanGeneral } from '../../src/core/planValidation';
import { unwrap } from '../../src/core/vdom';
import { container } from '../fixtures/helpers';

afterEach(() => { document.body.replaceChildren(); });

const labels = ['text', 'area', 'check', 'radio-a', 'radio-b', 'pick', 'free'] as const;
function setup() {
  let set!: StateSetter<number>; let renders = 0; const effect = vi.fn();
  const output = container(); document.body.append(output);
  const root = new FunctionComponent(() => {
    const [n, setter] = useState(0); set = setter; renders++; useEffect(effect, [n]);
    const far = ['x', 'y', 'z'].map(key => h('li', { key, attrs: { 'data-far': key } }, h('span', null, key), `${key}${n}`));
    return h('div', null,
      h('form', null,
        h('input', { attrs: { 'aria-label': 'text' }, form: { mode: 'controlled', value: `v${n}` } }),
        h('textarea', { attrs: { 'aria-label': 'area' }, form: { mode: 'controlled', value: 'area' } }),
        h('input', { attrs: { 'aria-label': 'check', type: 'checkbox' }, form: { mode: 'controlled', checked: true } }),
        h('input', { attrs: { 'aria-label': 'radio-a', type: 'radio', name: 'g' }, form: { mode: 'controlled', checked: true } }),
        h('input', { attrs: { 'aria-label': 'radio-b', type: 'radio', name: 'g' }, form: { mode: 'controlled', checked: false } }),
        h('select', { attrs: { 'aria-label': 'pick' }, form: { mode: 'controlled', selectedIndices: [1] } },
          h('option', { attrs: { value: 'a' } }, 'a'), h('option', { attrs: { value: 'b' } }, 'b'), h('option', { attrs: { value: 'c' } }, 'c')),
        h('input', { attrs: { 'aria-label': 'free' }, form: { mode: 'uncontrolled', defaultValue: 'free' } })),
      h('ul', null, ...far), h('output', null, String(n)));
  }, {}, output);
  root.mount();
  const field = (label: string) => output.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
  const ref = (label: string) => root.host.refs.get(field(label))!;
  return { root, mount: root.host, output, field, ref, set: (v: number) => set(v), renders: () => renders, effect };
}
// Simulates user edits on native state without engine involvement.
function edit(env: ReturnType<typeof setup>, which: readonly string[]) {
  for (const label of which) {
    const node = env.field(label);
    if (label === 'text' || label === 'area' || label === 'free') node.value = `user-${label}`;
    else if (label === 'check') node.checked = false;
    else if (label === 'radio-b') node.checked = true;
    else if (label === 'pick') (node as unknown as HTMLSelectElement).selectedIndex = 2;
  }
}
// inputs.ts marks the whole radio group dirty on a native radio change; mirror that here.
const withGroup = (which: readonly string[]) => which.includes('radio-b') ? [...which, 'radio-a'] : [...which];
const dirtyPlan = (mount: MountHandle, refs: readonly string[]) => unwrap(diff(mount.view, mount.view.snapshot, { dirtyFormRefs: new Set(refs) }));
const nativeState = (env: ReturnType<typeof setup>) => labels.map(label => {
  const node = env.field(label);
  return node.localName === 'select' ? (node as unknown as HTMLSelectElement).selectedIndex : node.type === 'checkbox' || node.type === 'radio' ? node.checked : node.value;
});
// Map.set calls separate the two paths: the general path fills per-node graph/original Maps,
// the SYNC_FORM-only walk fills only the per-command policy Map. This proves validatePlan dispatched.
function mapSets(run: () => unknown): number {
  const spy = vi.spyOn(Map.prototype, 'set'); try { run(); return spy.mock.calls.length; } finally { spy.mockRestore(); }
}
function both(mount: MountHandle, plan: PatchPlan) {
  let fast!: ReturnType<typeof validatePlan>, general!: ReturnType<typeof validatePlan>;
  const fastSets = mapSets(() => { fast = validatePlan(mount, plan); }), generalSets = mapSets(() => { general = validatePlanGeneral(mount, plan); });
  return { fast, general, eligible: isSyncFormOnlyPlan(mount, plan), fastSets, generalSets };
}
const findView = (view: readonly ViewNode[], ref: string): ViewNode | undefined => {
  for (const node of view) { if (node.ref === ref) return node; const found = findView(node.children, ref); if (found) return found; }
  return undefined;
};
// Rebuild a ViewNode tree with one node transformed (other nodes keep their identity).
const mapView = (view: readonly ViewNode[], fn: (node: ViewNode) => ViewNode | ViewNode[] | null): ViewNode[] =>
  view.flatMap(node => { const mapped = fn({ ...node, children: mapView(node.children, fn) }); return mapped === null ? [] : mapped; });

it.each([
  ['zero', [] as string[]],
  ['one', ['text']],
  ['many', ['text', 'area', 'check', 'radio-b', 'pick']],
])('valid %s-dirty plans: candidate and general path agree, eligibility as expected', (_name, which) => {
  const env = setup(); edit(env, which);
  const plan = dirtyPlan(env.mount, withGroup(which).map(env.ref));
  const result = both(env.mount, plan);
  expect(result.eligible).toBe(which.length > 0);
  expect(plan.operations.every(op => op.kind === 'SYNC_FORM')).toBe(true);
  expect(result.fast.ok).toBe(true); expect(result.general.ok).toBe(true);
  if (result.eligible) { expect(result.fastSets).toBe(plan.operations.length); expect(result.generalSets).toBeGreaterThan(env.mount.nodes.size); }
  else expect(result.fastSets).toBe(result.generalSets);
  const status = commit(env.mount, plan).status;
  expect(status).toBe(which.length ? 'committed' : 'noop');
  // Controlled fields are restored from State; the uncontrolled user value stays.
  expect(nativeState(env)).toEqual(['v0', 'area', true, true, false, 1, 'free']);
  env.root.unmount();
});

it('duplicate SYNC_FORM commands on one node: last policy wins in both paths', () => {
  const env = setup(); edit(env, ['text']);
  const plan = dirtyPlan(env.mount, [env.ref('text')]);
  const twice: PatchPlan = { ...plan, operations: [...plan.operations, ...plan.operations] };
  const result = both(env.mount, twice);
  expect(result.eligible).toBe(true); expect(result.fast.ok).toBe(true); expect(result.general.ok).toBe(true);
  expect(result.fastSets).toBe(2);
  const forged = syncTo(twice, op => op); // second op with a forged value must reject in both
  const bad: PatchPlan = { ...forged, operations: [forged.operations[0], { ...forged.operations[1], policy: { ...(forged.operations[1] as { policy: object }).policy, value: 'x' } } as never] };
  const rejected = both(env.mount, bad);
  expect(rejected.fast.ok).toBe(false); expect(rejected.general.ok).toBe(false);
  expect(commit(env.mount, twice).status).toBe('committed'); expect(env.field('text').value).toBe('v0');
  env.root.unmount();
});

it('uncontrolled user value survives a restore of controlled fields', () => {
  const env = setup(); edit(env, ['text', 'free']);
  const plan = dirtyPlan(env.mount, [env.ref('text'), env.ref('free')]);
  expect(plan.operations.map(op => op.kind)).toEqual(['SYNC_FORM']); // uncontrolled dirty ref is not synced by diff
  expect(both(env.mount, plan).eligible).toBe(true);
  expect(commit(env.mount, plan).status).toBe('committed');
  expect(env.field('text').value).toBe('v0'); expect(env.field('free').value).toBe('user-free');
  env.root.unmount();
});

type Mutation = (env: ReturnType<typeof setup>, plan: PatchPlan) => PatchPlan;
const syncTo = (plan: PatchPlan, change: (op: Extract<PatchPlan['operations'][number], { kind: 'SYNC_FORM' }>) => PatchPlan['operations'][number]): PatchPlan =>
  ({ ...plan, operations: plan.operations.map(op => op.kind === 'SYNC_FORM' ? change(op) : op) });
const mutations: Record<string, { eligible: boolean; apply: Mutation }> = {
  'missing ref': { eligible: true, apply: (_e, p) => syncTo(p, op => ({ ...op, node: 'nope' })) },
  'root ref': { eligible: true, apply: (e, p) => syncTo(p, op => ({ ...op, node: e.mount.view.rootRef })) },
  'text node ref': { eligible: true, apply: (e, p) => syncTo(p, op => ({ ...op, node: e.mount.refs.get(e.output.querySelector('li')!.lastChild!)! })) },
  'other field ref': { eligible: true, apply: (e, p) => syncTo(p, op => ({ ...op, node: e.ref('area') })) },
  'wrong policy value': { eligible: true, apply: (_e, p) => syncTo(p, op => ({ ...op, policy: { ...op.policy, value: 'forged' } })) },
  'uncontrolled policy': { eligible: false, apply: (_e, p) => syncTo(p, op => ({ ...op, policy: { mode: 'uncontrolled', defaultValue: 'v0' } })) },
  'extra non-form op': { eligible: false, apply: (e, p) => ({ ...p, operations: [{ kind: 'SET_ATTR', node: e.ref('area'), name: 'title', value: 't' }, ...p.operations] }) },
  'nextView revision': { eligible: true, apply: (_e, p) => ({ ...p, nextView: { ...p.nextView, revision: p.nextView.revision + 1 } }) },
  'nextView mount': { eligible: true, apply: (_e, p) => ({ ...p, nextView: { ...p.nextView, mountId: 'other' } }) },
  'nextView snapshot': { eligible: true, apply: (_e, p) => ({ ...p, nextView: { ...p.nextView, snapshot: { kind: 'root', children: [] } } }) },
  'nextView swapped siblings': { eligible: true, apply: (e, p) => {
    const ul = findView(p.nextView.children, e.mount.refs.get(e.output.querySelector('ul')!)!)!;
    const [a, b, ...rest] = ul.children;
    return { ...p, nextView: { ...p.nextView, children: mapView(p.nextView.children, n => n.ref === ul.ref ? { ...n, children: [b, a, ...rest] } : n) } };
  } },
  'nextView missing child': { eligible: true, apply: (e, p) => {
    const ref = e.mount.refs.get(e.output.querySelector('li')!)!;
    return { ...p, nextView: { ...p.nextView, children: mapView(p.nextView.children, n => n.ref === ref ? null : n) } };
  } },
  'nextView extra child': { eligible: true, apply: (e, p) => {
    const ref = e.mount.refs.get(e.output.querySelector('li')!)!;
    return { ...p, nextView: { ...p.nextView, children: mapView(p.nextView.children, n => n.ref === ref ? [n, { ...n, ref: 'ghost' }] : n) } };
  } },
  'nextView duplicate ref': { eligible: true, apply: (e, p) => {
    const lis = [...e.output.querySelectorAll('li')].map(li => e.mount.refs.get(li)!);
    return { ...p, nextView: { ...p.nextView, children: mapView(p.nextView.children, n => n.ref === lis[1] ? { ...n, ref: lis[0] } : n) } };
  } },
  'nextView child vnode': { eligible: true, apply: (e, p) => {
    const ref = e.mount.refs.get(e.output.querySelector('li span')!.firstChild!)!;
    return { ...p, nextView: { ...p.nextView, children: mapView(p.nextView.children, n => n.ref === ref ? { ...n, vnode: { ...n.vnode, text: 'forged' } as never } : n) } };
  } },
  // Same host fields; only the nextView ViewNode/VNode children check can see it.
  'nextView vnode children': { eligible: true, apply: (e, p) => {
    const ref = e.mount.refs.get(e.output.querySelector('li')!)!;
    return { ...p, nextView: { ...p.nextView, children: mapView(p.nextView.children, n => n.ref === ref && n.vnode.kind === 'element' ? { ...n, vnode: { ...n.vnode, children: [] } } : n) } };
  } },
  'nextView identity only': { eligible: true, apply: (e, p) => {
    const ref = e.mount.refs.get(e.output.querySelector('li')!)!;
    return { ...p, nextView: { ...p.nextView, children: mapView(p.nextView.children, n => n.ref === ref ? { ...n, vnode: { ...n.vnode, identity: { ...n.vnode.identity, key: 'other' } } } : n) } };
  } },
  // The next six stop in the shared preamble (before either walk); kept as regression checks of the dispatch order.
  'stale revision': { eligible: true, apply: (_e, p) => ({ ...p, baseRevision: p.baseRevision - 1 }) },
  'other mount': { eligible: true, apply: (_e, p) => ({ ...p, mountId: 'other' }) },
  'disposed mount': { eligible: true, apply: (e, p) => { e.mount.disposed = true; return p; } },
  'far sibling removed': { eligible: true, apply: (e, p) => { e.output.querySelectorAll('li')[2].remove(); return p; } },
  'far sibling replaced': { eligible: true, apply: (e, p) => { const li = e.output.querySelectorAll('li')[2]; li.replaceWith(document.createElement('li')); return p; } },
  'far siblings reordered': { eligible: true, apply: (e, p) => { const [a, , c] = e.output.querySelectorAll('li'); c.after(a); return p; } },
  // Tail stays in place, so only the per-position DOM check can see it.
  'far siblings swapped head': { eligible: true, apply: (e, p) => { const [a, b] = e.output.querySelectorAll('li'); b.after(a); return p; } },
  'far extra text': { eligible: true, apply: (e, p) => { e.output.querySelector('ul')!.append('stray'); return p; } },
  'far node type': { eligible: true, apply: (e, p) => { const span = e.output.querySelector('li span')!; const b = document.createElement('b');
    b.append(...span.childNodes); span.replaceWith(b); e.mount.nodes.set(e.mount.refs.get(span)!, b); e.mount.refs.set(b, e.mount.refs.get(span)!); return p; } },
  'reverse ref': { eligible: true, apply: (e, p) => { e.mount.refs.set(e.output.querySelectorAll('li')[1], 'wrong'); return p; } },
  'registry extra': { eligible: true, apply: (e, p) => { e.mount.nodes.set('extra', document.createElement('i')); return p; } },
  'registry missing': { eligible: true, apply: (e, p) => { e.mount.nodes.delete(e.mount.refs.get(e.output.querySelectorAll('li')[1])!); return p; } },
  'current view duplicate ref': { eligible: true, apply: (e, p) => {
    const lis = [...e.output.querySelectorAll('li')].map(li => e.mount.refs.get(li)!);
    e.mount.view = { ...e.mount.view, children: mapView(e.mount.view.children, n => n.ref === lis[2] ? { ...n, ref: lis[0] } : n) }; return p;
  } },
  // Same host fields and same ViewNode children; only the ViewNode/VNode children check can see it.
  'current vnode children': { eligible: true, apply: (e, p) => {
    const ref = e.mount.refs.get(e.output.querySelector('li')!)!;
    e.mount.view = { ...e.mount.view, children: mapView(e.mount.view.children, n => n.ref === ref && n.vnode.kind === 'element' ? { ...n, vnode: { ...n.vnode, children: [] } } : n) }; return p;
  } },
  'current view vs vnode': { eligible: true, apply: (e, p) => {
    const ref = e.mount.refs.get(e.output.querySelector('li')!)!;
    e.mount.view = { ...e.mount.view, children: mapView(e.mount.view.children, n => n.ref === ref ? { ...n, children: n.children.slice(1) } : n) }; return p;
  } },
};

it.each(Object.keys(mutations))('broken plan/state "%s": both paths reject before any DOM write', name => {
  const env = setup(); edit(env, ['text', 'pick']);
  const plan = mutations[name].apply(env, dirtyPlan(env.mount, [env.ref('text'), env.ref('pick')]));
  const result = both(env.mount, plan);
  expect(result.eligible).toBe(mutations[name].eligible);
  expect(result.fast.ok).toBe(false); expect(result.general.ok).toBe(false);
  if (!result.fast.ok && !result.general.ok) expect(result.fast.diagnostics[0].code).toBe(result.general.diagnostics[0].code);
  const before = nativeState(env), revision = env.mount.revision;
  const observer = new MutationObserver(() => undefined); observer.observe(env.output, { subtree: true, childList: true, attributes: true, characterData: true });
  const writes = [vi.spyOn(HTMLInputElement.prototype, 'value', 'set'), vi.spyOn(HTMLInputElement.prototype, 'checked', 'set'),
    vi.spyOn(HTMLTextAreaElement.prototype, 'value', 'set'), vi.spyOn(HTMLSelectElement.prototype, 'selectedIndex', 'set')];
  expect(commit(env.mount, plan).status).toBe('rejected');
  for (const spy of writes) { expect(spy).not.toHaveBeenCalled(); spy.mockRestore(); }
  expect(observer.takeRecords()).toHaveLength(0); observer.disconnect();
  expect(nativeState(env)).toEqual(before); expect(env.mount.revision).toBe(revision); expect(env.mount.faulted).toBe(false);
});

it('same-State restore through FunctionComponent: no render/Effect, focus and selection kept, all controlled kinds restored', async () => {
  const env = setup(); const renders = env.renders(), effects = env.effect.mock.calls.length;
  const text = env.field('text'); text.focus(); edit(env, ['text', 'area', 'check', 'radio-b', 'pick', 'free']);
  text.setSelectionRange(1, 2);
  for (const label of withGroup(['text', 'area', 'check', 'radio-b', 'pick', 'free'])) env.mount.dirtyForms.set(env.ref(label), ++env.mount.inputSequence);
  const plan = dirtyPlan(env.mount, [...env.mount.dirtyForms.keys()]);
  expect(isSyncFormOnlyPlan(env.mount, plan)).toBe(true);
  env.set(0); await Promise.resolve(); await Promise.resolve();
  expect(env.root.lastResult?.status).toBe('committed');
  expect(env.renders()).toBe(renders); expect(env.effect).toHaveBeenCalledTimes(effects);
  expect(nativeState(env)).toEqual(['v0', 'area', true, true, false, 1, 'user-free']);
  expect(document.activeElement).toBe(text); expect([text.selectionStart, text.selectionEnd]).toEqual([1, 2]);
  expect(env.mount.dirtyForms.size).toBe(0);
  env.root.unmount();
});

it('composition holds the dirty value and restores it after compositionend', async () => {
  const env = setup(); const text = env.field('text');
  text.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  text.value = 'ㅎ'; env.mount.dirtyForms.set(env.ref('text'), ++env.mount.inputSequence);
  env.set(0); await Promise.resolve(); await Promise.resolve();
  expect(text.value).toBe('ㅎ'); expect(env.mount.heldForms.has(env.ref('text'))).toBe(true);
  text.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '한' }));
  await new Promise(resolve => setTimeout(resolve, 5));
  expect(text.value).toBe('v0'); expect(env.mount.heldForms.size).toBe(0); expect(env.mount.dirtyForms.size).toBe(0);
  env.root.unmount();
});

it('a dirty sequence created during the restore is not acknowledged by that restore', async () => {
  const env = setup(); const text = env.field('text'), ref = env.ref('text');
  text.value = 'user'; env.mount.dirtyForms.set(ref, ++env.mount.inputSequence);
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
  let bumped = 0;
  Object.defineProperty(text, 'value', { configurable: true, get() { return proto.get!.call(this); }, set(v: string) {
    proto.set!.call(this, v); if (!bumped++) env.mount.dirtyForms.set(ref, ++env.mount.inputSequence); } });
  env.set(0); await Promise.resolve(); await Promise.resolve();
  expect(bumped).toBeGreaterThan(0);
  // The newer sequence survived the first acknowledgement and triggered another restore.
  for (let i = 0; i < 5 && env.mount.dirtyForms.size; i++) await Promise.resolve();
  delete (text as unknown as Record<string, unknown>).value;
  expect(text.value).toBe('v0'); expect(env.root.errors).toHaveLength(0);
  env.root.unmount();
});

it('explicit update and a real State change keep their behaviour with a dirty field', async () => {
  const env = setup(); const renders = env.renders();
  edit(env, ['text']); env.mount.dirtyForms.set(env.ref('text'), ++env.mount.inputSequence);
  env.root.update(); await Promise.resolve(); await Promise.resolve();
  expect(env.renders()).toBe(renders + 1); expect(env.field('text').value).toBe('v0');
  edit(env, ['text']); env.mount.dirtyForms.set(env.ref('text'), ++env.mount.inputSequence);
  env.set(1); await Promise.resolve(); await Promise.resolve();
  expect(env.renders()).toBe(renders + 2); expect(env.field('text').value).toBe('v1');
  expect(env.output.querySelector('output')!.textContent).toBe('1'); expect(env.effect).toHaveBeenCalledTimes(2);
  env.root.unmount();
});
