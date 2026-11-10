// Keyed boundary-run study (2026-11-10), whole Diff/Patch level.
// The engine is loaded twice: as it is (default planner = B0) and with the keyed planner replaced
// by the research candidate C1 (research/keyed-boundaries/keyed.candidate.ts). Plans must be deeply
// equal (command order, anchors, refs, decisions), the committed DOM is checked against an
// independent expectation, and the IME cases run on both engines.
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import * as defaultRuntime from '../../src/runtime';
import { h, memo } from '../../src/runtime';
import { resolveExpression } from '../../src/runtime/resolve';
import { createMount } from '../../src/core/mount';
import { diff } from '../../src/core/reconcile';
import { commit } from '../../src/core/patch';
import type { PatchOp, PatchPlan, PureComponent, ReconcileStrategy, RenderValue, StateSetter, VRoot } from '../../src/core/types';
import { seededRandom, shuffle } from '../fixtures/keyed-model';
import { container } from '../fixtures/helpers';

afterEach(() => { document.body.replaceChildren(); });

let candidateDiff: typeof diff, candidateRuntime: typeof defaultRuntime, candidateCalls = 0;
beforeAll(async () => {
  vi.resetModules();
  vi.doMock('../../src/core/keyed', async () => {
    const actual = await vi.importActual<typeof import('../../src/core/keyed')>('../../src/core/keyed');
    const { planKeyedChildrenCandidate } = await import('../../research/keyed-boundaries/keyed.candidate');
    const counted: typeof planKeyedChildrenCandidate = (...args) => { candidateCalls++; return planKeyedChildrenCandidate(...args); };
    return { ...actual, planKeyedChildren: counted };
  });
  candidateDiff = (await import('../../src/core/reconcile')).diff;
  candidateRuntime = await import('../../src/runtime');
  vi.doUnmock('../../src/core/keyed');
});

interface Row { key: string; tag?: string; owner?: 'plain' | 'memo'; inner?: string }
type Handler = (key: string) => void;
const element = (row: Row, version: string, handler: Handler, key?: string) => h(row.tag ?? 'li', { ...(key === undefined ? {} : { key }), attrs: { 'data-key': row.key, title: `${row.key}-${version}` }, events: { click: () => handler(row.key) } },
  h('span', null, `${row.key}:${version}`), h('input', { form: { mode: 'uncontrolled', defaultValue: `initial-${row.key}` } }));
const Plain: PureComponent<{ row: Row; version: string; handler: Handler }> = props => element(props.row, props.version, props.handler, props.row.inner);
const Memo = memo(Plain);
const tree = (rows: readonly Row[], version: string, handler: Handler): VRoot => resolveExpression(h('section', null, h('h2', null, version),
  h('ul', null, ...rows.map((row): RenderValue => row.owner ? h(row.owner === 'memo' ? Memo : Plain, { key: row.key, row, version, handler }) : element(row, version, handler, row.key)))));
const rows = (keys: string, changes: Record<string, Partial<Row>> = {}): Row[] => Array.from(keys, key => ({ key, ...changes[key] }));
// The reuse contract, written without the engine's compatible(): key, host tag, owner and inner key.
const sameRow = (a: Row, b: Row) => a.key === b.key && (a.tag ?? 'li') === (b.tag ?? 'li') && a.owner === b.owner && a.inner === b.inner;

function check(oldRows: readonly Row[], nextRows: readonly Row[], strategy: ReconcileStrategy, context: string) {
  const output = container(); document.body.append(output);
  const mount = createMount(output), oldHandler = vi.fn(), newHandler = vi.fn();
  expect(commit(mount, unwrapPlan(diff(mount.view, tree(oldRows, 'old', oldHandler), { strategy }))).status).toBe('committed');
  const list = output.querySelector('ul')!, listRef = mount.refs.get(list)!;
  const before = Array.from(list.children) as HTMLElement[];
  for (const node of before) node.querySelector('input')!.value = `typed-${node.dataset.key}`;
  const target = tree(nextRows, 'new', newHandler);
  // A. differential: the whole plan with the default planner (B0) and with the candidate.
  const called = candidateCalls;
  const baseline = diff(mount.view, target, { strategy, planId: 'same' });
  expect(candidateCalls, context).toBe(called);
  const candidate = candidateDiff(mount.view, target, { strategy, planId: 'same' });
  // (Childless elements are keyed lists of size 0, so one diff may plan several lists.)
  expect(candidateCalls, context).toBeGreaterThan(called);
  expect(candidate, context).toEqual(baseline);
  const plan = unwrapPlan(candidate);
  // B. independent array model of the placement commands of this list (order and anchors).
  const refOf = (node: Element) => mount.refs.get(node)!;
  let model = before.map(refOf);
  for (const op of plan.operations) if (op.kind === 'REMOVE_SUBTREE' && op.parent === listRef) model = model.filter(ref => ref !== op.node);
  const places = plan.operations.filter((op): op is Extract<PatchOp, { kind: 'PLACE_BEFORE' }> => op.kind === 'PLACE_BEFORE' && op.parent === listRef);
  for (const op of places) {
    model = model.filter(ref => ref !== op.node);
    const at = op.anchor === null ? model.length : model.indexOf(op.anchor);
    expect(at, `${context}: anchor is placed`).toBeGreaterThanOrEqual(0);
    model.splice(at, 0, op.node);
  }
  const nextViewRefs = plan.nextView.children[0].children[1].children.map(node => node.ref);
  expect(model, context).toEqual(nextViewRefs);
  // Commit and compare the DOM with the contract: order, identity, inner updates, latest handler.
  const moves = places.filter(op => op.placement === 'move').length, inserts = places.filter(op => op.placement === 'insert').length;
  const result = commit(mount, plan);
  expect(['committed', 'noop'], context).toContain(result.status);
  if (result.status === 'committed') expect(result.counters.movedRoots + result.counters.insertedRoots + result.counters.skippedHostCalls, context).toBeGreaterThanOrEqual(moves + inserts);
  const after = Array.from(list.children) as HTMLElement[];
  expect(after.map(node => node.dataset.key).join(''), context).toBe(nextRows.map(row => row.key).join(''));
  nextRows.forEach((row, i) => {
    const previous = oldRows.findIndex(old => sameRow(old, row));
    if (previous >= 0) expect(after[i], `${context}: identity of ${row.key}`).toBe(before[previous]);
    else expect(before.includes(after[i]), `${context}: ${row.key} is new`).toBe(false);
    // Boundary rows are diffed like any other row: text, attribute and handler are the new ones.
    expect(after[i].querySelector('span')!.textContent).toBe(`${row.key}:new`); expect(after[i].title).toBe(`${row.key}-new`);
    expect(after[i].querySelector('input')!.value).toBe(`${previous >= 0 ? 'typed' : 'initial'}-${row.key}`);
    after[i].click();
  });
  expect(newHandler.mock.calls.map(call => call[0]).join(''), context).toBe(nextRows.map(row => row.key).join('')); expect(oldHandler).not.toHaveBeenCalled();
  for (const node of before) if (!after.includes(node)) expect(node.isConnected, context).toBe(false);
  output.remove();
  return { plan, places, refOf, before };
}
function unwrapPlan(result: ReturnType<typeof diff>): PatchPlan { if (!result.ok) throw new Error(JSON.stringify(result.diagnostics)); return result.value; }

const scenarios: [string, Row[], Row[]][] = [
  ['identical', rows('ABCDEF'), rows('ABCDEF')],
  ['append', rows('ABCD'), rows('ABCDEF')],
  ['prepend', rows('CDEF'), rows('ABCDEF')],
  ['insert in the middle', rows('ABEF'), rows('ABCDEF')],
  ['remove front, middle and back', rows('ABCDEF'), rows('BCE')],
  ['replace the middle', rows('PABQ'), rows('PXYQ')],
  ['swap neighbours inside boundaries', rows('PABCDQ'), rows('PBADCQ')],
  ['reverse inside boundaries', rows('PABCDQ'), rows('PDCBAQ')],
  ['last to first', rows('ABCDEFGH'), rows('HABCDEFG')],
  ['reverse', rows('ABCDEFGH'), rows('HGFEDCBA')],
  ['insert, remove and move', rows('PABCDQ'), rows('PDXBQ')],
  ['tag change at the front', rows('ABCD'), rows('ABCD', { A: { tag: 'div' } })],
  ['tag change at the back', rows('ABCD'), rows('ABCD', { D: { tag: 'div' } })],
  ['component rows moved inside boundaries', rows('PABQ', { A: { owner: 'memo' }, B: { owner: 'plain' }, Q: { owner: 'memo' } }), rows('PBAQ', { A: { owner: 'memo' }, B: { owner: 'plain' }, Q: { owner: 'memo' } })],
  ['component type change at the front', rows('ABC', { A: { owner: 'plain' } }), rows('ABC', { A: { owner: 'memo' } })],
  ['inner key change at the back', rows('ABC', { C: { owner: 'plain', inner: 'x' } }), rows('ABC', { C: { owner: 'plain', inner: 'y' } })],
  ['element row becomes a component row in the middle', rows('PABQ'), rows('PBAQ', { A: { owner: 'plain' } })],
  ['all removed', rows('ABC'), []],
  ['all inserted', [], rows('ABC')],
];
for (const strategy of ['greedy', 'lis'] as const) {
  it.each(scenarios)(`${strategy}: %s gives the same plan with B0 and the candidate, and the expected DOM`, (name, oldRows, nextRows) => { check(oldRows, nextRows, strategy, `${strategy}/${name}`); });
}

it('seed 20261110: 300 generated list pairs give the same plan with B0 and the candidate, and the expected DOM (both strategies)', () => {
  const random = seededRandom(20261110), pool = Array.from('abcdefghijkl');
  const make = (key: string): Row => ({ key, ...(random() < 0.15 ? { tag: 'div' } : {}), ...(random() < 0.25 ? { owner: random() < 0.5 ? 'plain' as const : 'memo' as const, ...(random() < 0.3 ? { inner: random() < 0.5 ? 'x' : 'y' } : {}) } : {}) });
  for (let sample = 0; sample < 300; sample++) {
    const oldRows = shuffle(pool, random).slice(0, Math.floor(random() * 11)).map(make);
    const prefix = Math.floor(random() * (oldRows.length + 1)), suffix = Math.floor(random() * (oldRows.length - prefix + 1));
    let middle = oldRows.slice(prefix, oldRows.length - suffix);
    const kind = Math.floor(random() * 5);
    if (kind === 1) middle = shuffle(middle, random);
    if (kind === 2) middle = middle.filter(() => random() < 0.6);
    if (kind === 3) { middle = shuffle(middle, random); for (const key of pool.filter(key => !oldRows.some(row => row.key === key)).slice(0, 2)) middle.splice(Math.floor(random() * (middle.length + 1)), 0, make(key)); }
    if (kind === 4 && middle.length) middle = [middle[middle.length - 1], ...middle.slice(0, -1)];
    const nextRows = [...oldRows.slice(0, prefix), ...middle, ...oldRows.slice(oldRows.length - suffix)].map(row => random() < 0.06 ? make(row.key) : row);
    for (const strategy of ['greedy', 'lis'] as const) check(oldRows, nextRows, strategy, JSON.stringify({ seed: 20261110, sample, strategy, oldRows, nextRows }));
  }
}, 120000);

it('placement commands keep their order and whole-list anchors next to boundary runs', () => {
  const keys = (result: ReturnType<typeof check>) => result.places.map(op => {
    const name = (ref: string | null) => ref === null ? 'end' : result.before.find(node => result.refOf(node) === ref)?.dataset.key ?? 'new';
    return `${op.placement}:${name(op.node)}<${name(op.anchor)}`;
  });
  // Right to left over the new list: D before C, then B before A (LIS keeps A and C).
  expect(keys(check(rows('PABCDQ'), rows('PBADCQ'), 'lis', 'anchors/lis'))).toEqual(['move:D<C', 'move:B<A']);
  // Greedy keeps B and D instead: C before Q, then A before D.
  expect(keys(check(rows('PABCDQ'), rows('PBADCQ'), 'greedy', 'anchors/greedy'))).toEqual(['move:C<Q', 'move:A<D']);
  // New nodes between boundary runs are anchored to whole-list neighbours.
  expect(keys(check(rows('PAQ'), rows('PXAYQ'), 'lis', 'anchors/insert'))).toEqual(['insert:new<Q', 'insert:new<A']);
  expect(keys(check(rows('PAQ'), rows('PAQXY'), 'lis', 'anchors/append'))).toEqual(['insert:new<end', 'insert:new<new']);
  expect(keys(check(rows('ABCQ'), rows('CABQ'), 'greedy', 'anchors/greedy-suffix'))).toEqual(['move:B<Q', 'move:A<B']);
});

it('sub-diffs of siblings run in new-list order, including the boundary rows', () => {
  const output = container(); document.body.append(output); const mount = createMount(output), noop = () => undefined;
  commit(mount, unwrapPlan(diff(mount.view, tree(rows('PABCDQ'), 'old', noop))));
  const plan = unwrapPlan(diff(mount.view, tree(rows('PBADCQ'), 'new', noop)));
  const texts = plan.operations.filter(op => op.kind === 'SET_TEXT').map(op => (op as { value: string }).value);
  expect(texts).toEqual(['new', 'P:new', 'B:new', 'A:new', 'D:new', 'C:new', 'Q:new']);
  expect(plan.reconciliations.find(decision => decision.reason === 'keyed' && decision.reused > 0)).toMatchObject({ usedLIS: true, reused: 6, inserts: 0, removes: 0, moves: 2 });
});

// P A B C D Q -> P B A D C Q moves two rows with either strategy, but not the same rows:
// LIS moves B and D, Greedy moves A and C. With an IME composition in row A this decides
// between "commit now and hold only A's form value" and "defer the whole plan".
type Engine = 'default' | 'candidate';
function composingList(engine: Engine, strategy: ReconcileStrategy) {
  const { FunctionComponent, h, useEffect, useState } = engine === 'candidate' ? candidateRuntime : defaultRuntime;
  const planned = candidateCalls;
  let setOrder!: StateSetter<string>, setNote!: StateSetter<string>;
  const output = container(); document.body.append(output); const effect = vi.fn();
  const root = new FunctionComponent(() => {
    const [order, a] = useState('PABCDQ'), [note, b] = useState('n0'); setOrder = a; setNote = b;
    useEffect(() => { effect(order, note); }, [order, note]);
    return h('div', null, h('output', null, note), h('ul', null, ...Array.from(order, key => h('li', { key, attrs: { 'data-key': key } },
      h('input', { attrs: { 'aria-label': key }, form: { mode: 'controlled', value: `${key}:${note}` } }), h('span', null, `${key}:${note}`)))));
  }, {}, output, { reconcile: strategy });
  root.mount();
  const list = output.querySelector('ul')!;
  const input = (key: string) => output.querySelector<HTMLInputElement>(`[aria-label="${key}"]`)!;
  const order = () => Array.from(list.children, node => (node as HTMLElement).dataset.key).join('');
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
  const compose = async (key: string) => {
    input(key).dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    input(key).value = 'ㅎ'; input(key).dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    await flush();
  };
  const end = async (key: string) => { input(key).dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '한' })); await new Promise(resolve => setTimeout(resolve, 5)); await flush(); };
  // After an update: the candidate engine really planned with the candidate, the default engine never did.
  const finish = () => { expect(candidateCalls > planned).toBe(engine === 'candidate'); root.unmount(); };
  return { root, output, list, input, order, flush, compose, end, effect, finish, setOrder: (value: string) => setOrder(value), setNote: (value: string) => setNote(value) };
}

const engines: Engine[] = ['default', 'candidate'];
it.each(engines)('IME in row A, LIS (%s engine): A is not a move target, so the plan commits, only B and D move and A\'s form value is held until the composition ends', async engine => {
  const env = composingList(engine, 'lis'); await env.compose('A');
  expect(env.input('A').value).toBe('ㅎ'); expect(env.root.host.heldForms.has(env.root.host.refs.get(env.input('A'))!)).toBe(true);
  const nodes = new Map(Array.from(env.list.children, node => [(node as HTMLElement).dataset.key!, node]));
  const records: MutationRecord[] = [];
  const observer = new MutationObserver(list => { records.push(...list); }); observer.observe(env.list, { childList: true });
  env.setOrder('PBADCQ'); env.setNote('n1'); await env.flush();
  expect(env.root.lastResult).toMatchObject({ status: 'committed', counters: { movedRoots: 2, createdNodes: 0, removedNodes: 0 } });
  records.push(...observer.takeRecords()); observer.disconnect();
  const moved = new Set(records.flatMap(record => [...record.addedNodes, ...record.removedNodes]));
  expect([...moved].map(node => (node as HTMLElement).dataset.key).sort()).toEqual(['B', 'D']);
  expect(env.order()).toBe('PBADCQ');
  for (const [key, node] of nodes) expect(env.list.querySelector(`[data-key="${key}"]`)).toBe(node);
  // Everything except the composing value is the latest State.
  expect(env.output.querySelector('output')!.textContent).toBe('n1'); expect(env.input('B').value).toBe('B:n1');
  expect(env.list.querySelector('[data-key="A"] span')!.textContent).toBe('A:n1');
  expect(env.input('A').value).toBe('ㅎ'); expect(env.root.host.heldForms.size).toBe(1); expect(env.root.host.composing.size).toBe(1);
  expect(env.effect).toHaveBeenLastCalledWith('PBADCQ', 'n1');
  env.setNote('n2'); await env.flush();
  expect(env.root.lastResult?.status).toBe('committed'); expect(env.input('A').value).toBe('ㅎ'); expect(env.input('C').value).toBe('C:n2');
  await env.end('A');
  expect(env.input('A').value).toBe('A:n2'); expect(env.root.host.heldForms.size).toBe(0); expect(env.root.host.dirtyForms.size).toBe(0);
  expect(env.order()).toBe('PBADCQ'); expect(env.root.errors).toEqual([]); env.finish();
});

const both = <T extends readonly unknown[]>(cases: readonly T[]) => engines.flatMap(engine => cases.map(entry => [engine, ...entry] as const));
it.each(both([['greedy', 'A'], ['lis', 'B'], ['lis', 'D'], ['greedy', 'C']] as const))('IME in a moved row (%s engine, %s, row %s): the whole plan is deferred and the latest State is applied after the composition ends', async (engine, strategy, key) => {
  const env = composingList(engine, strategy); await env.compose(key);
  const nodes = new Map(Array.from(env.list.children, node => [(node as HTMLElement).dataset.key!, node]));
  const html = env.list.innerHTML, revision = env.root.host.revision, effects = env.effect.mock.calls.length;
  env.setOrder('PBADCQ'); env.setNote('n1'); await env.flush();
  expect(env.root.lastResult).toMatchObject({ status: 'deferred', reason: 'composition' });
  expect((env.root.lastResult as unknown as { refs: string[] }).refs).toEqual([env.root.host.refs.get(nodes.get(key)!)]);
  expect(env.order()).toBe('PABCDQ'); expect(env.list.innerHTML).toBe(html); expect(env.root.host.revision).toBe(revision);
  expect(env.output.querySelector('output')!.textContent).toBe('n0'); expect(env.effect).toHaveBeenCalledTimes(effects);
  expect(env.input(key).value).toBe('ㅎ');
  env.setNote('n2'); await env.flush();
  expect(env.root.lastResult?.status).toBe('deferred'); expect(env.order()).toBe('PABCDQ');
  await env.end(key);
  expect(env.root.lastResult?.status).not.toBe('deferred');
  expect(env.order()).toBe('PBADCQ'); expect(env.output.querySelector('output')!.textContent).toBe('n2');
  for (const [name, node] of nodes) expect(env.list.querySelector(`[data-key="${name}"]`)).toBe(node);
  expect(env.input(key).value).toBe(`${key}:n2`); expect(env.root.host.heldForms.size).toBe(0);
  expect(env.effect).toHaveBeenLastCalledWith('PBADCQ', 'n2'); expect(env.root.errors).toEqual([]); env.finish();
});

it.each(both([['lis', 'A'], ['lis', 'C'], ['greedy', 'B'], ['greedy', 'D'], ['lis', 'P'], ['greedy', 'Q']] as const))('IME in a kept row (%s engine, %s, row %s): the reorder commits during the composition', async (engine, strategy, key) => {
  const env = composingList(engine, strategy); await env.compose(key);
  env.setOrder('PBADCQ'); await env.flush();
  expect(env.root.lastResult).toMatchObject({ status: 'committed', counters: { movedRoots: 2 } });
  expect(env.order()).toBe('PBADCQ'); expect(env.input(key).value).toBe('ㅎ');
  await env.end(key); expect(env.input(key).value).toBe(`${key}:n0`); env.finish();
});
