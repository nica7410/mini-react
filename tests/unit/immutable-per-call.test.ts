import { expect, it } from 'vitest';
import type { VElement, VRoot } from '../../src/core/types';
import { freezeBoundaryNode, freezeOwnedNode, freezeTree } from '../../src/core/vdom';
import { validateTree } from '../../src/core/validate';
import { h } from '../../src/runtime/expression';
import { evaluateExpression, resolveExpression } from '../../src/runtime/resolve';

const rows = (count: number, label = (index: number) => `row ${index}`) => h('ul', null,
  ...Array.from({ length: count }, (_, index) => h('li', { key: index, events: { click: () => undefined } },
    h('span', { attrs: { title: label(index) } }, label(index)))),
);

function objects(value: unknown, result = new Set<object>()): Set<object> {
  if (!value || typeof value !== 'object' || result.has(value)) return result;
  result.add(value);
  for (const child of Object.values(value)) objects(child, result);
  return result;
}

it('T-N08: a wide resolved tree is fully frozen and the same root is revalidated on every call', () => {
  const tree = resolveExpression(rows(128)), owned = [...objects(tree)];
  expect(owned.length).toBeGreaterThan(1000);
  expect(owned.every(Object.isFrozen)).toBe(true);
  // A frozen accessor is read by every validation: no per-root result is retained.
  const list = JSON.parse(JSON.stringify(tree)) as VRoot, last = (list.children[0] as VElement).children.at(-1) as VElement;
  let reads = 0; const attrs = { title: 'safe' };
  Object.defineProperty(last, 'attrs', { enumerable: true, configurable: true, get: () => { reads++; return attrs; } });
  freezeTree(list);
  expect(reads).toBe(0);
  expect(validateTree(list).ok).toBe(true);
  const once = reads; expect(once).toBeGreaterThan(0);
  expect(validateTree(list).ok).toBe(true);
  expect(reads).toBe(once * 2);
});

it('T-N08: a late accessor in a wide tree is never invoked by freezing and changed values are rejected', () => {
  const tree = JSON.parse(JSON.stringify(resolveExpression(rows(128)))) as VRoot;
  const list = tree.children[0] as VElement;
  const last = list.children.at(-1) as VElement;
  let reads = 0, attrs: Record<string, string> = { title: 'safe' };
  Object.defineProperty(last, 'attrs', {
    enumerable: true, configurable: true, get: () => { reads++; return attrs; },
  });
  freezeTree(tree);
  expect(reads).toBe(0);
  expect(Object.isFrozen(last.children)).toBe(true);
  expect(Object.isFrozen(attrs)).toBe(false);
  expect(validateTree(tree).ok).toBe(true);
  attrs = { onclick: 'unsupported' };
  expect(validateTree(tree).ok).toBe(false);
});

it('T-N08: resolver sealing keeps reused and new VNodes deeply frozen across renders without freezing handlers', () => {
  const handlers = new Set<unknown>();
  const first = evaluateExpression(rows(64), null, true);
  const changed = rows(64, index => index === 3 ? 'changed' : `row ${index}`);
  const second = evaluateExpression(changed, first.nextState, true);
  const before = (first.snapshot.children[0] as VElement).children, after = (second.snapshot.children[0] as VElement).children;
  for (const value of objects(second.snapshot)) {
    expect(Object.isFrozen(value)).toBe(true);
    if ('handler' in value) handlers.add((value as { handler: unknown }).handler);
  }
  expect(handlers.size).toBe(64);
  for (const handler of handlers) expect(Object.isFrozen(handler)).toBe(false);
  // Expressions are new, so rows are re-created, but older snapshots stay intact.
  expect(after[3]).not.toBe(before[3]);
  expect(((before[3] as VElement).children[0] as VElement).attrs.title).toBe('row 3');
  expect(((after[3] as VElement).children[0] as VElement).attrs.title).toBe('changed');
  // A reused expression returns the earlier sealed VNode unchanged.
  const same = evaluateExpression(changed, second.nextState, true);
  expect(same.reusedExpressions).toBeGreaterThan(0);
  expect((same.snapshot.children[0] as VElement)).toBe(second.snapshot.children[0]);
});

it('T-N08: a new parent seals around a reused keyed child and a component boundary, leaving functions unfrozen', () => {
  const click = () => undefined;
  function Row(props: { label: string }) { return h('span', { attrs: { title: props.label }, events: { click } }, props.label); }
  const kept = h('li', { key: 'kept' }, h(Row, { label: 'kept', key: 'row' }));
  const view = (label: string) => h('ul', null, kept, h('li', { key: 'new' }, h(Row, { label, key: 'row' })));
  const first = evaluateExpression(view('a'), null, true);
  const second = evaluateExpression(view('b'), first.nextState, true);
  expect(second.reusedExpressions).toBeGreaterThan(0);
  const [keptBefore] = (first.snapshot.children[0] as VElement).children;
  const [keptAfter, changed] = (second.snapshot.children[0] as VElement).children as VElement[];
  expect(keptAfter).toBe(keptBefore);
  const boundary = changed.children[0];
  expect(boundary.identity.boundaries[0].type).toBe(Row);
  for (const value of objects(second.snapshot)) expect(Object.isFrozen(value)).toBe(true);
  expect(Object.isFrozen(Row)).toBe(false); expect(Object.isFrozen(click)).toBe(false);
});

it('T-N08: resolver sealing rejects a parent whose child or boundary data was not sealed by the resolver', () => {
  const child = JSON.parse(JSON.stringify(resolveExpression(h('p', null, 'x')).children[0])) as VElement;
  expect(() => freezeOwnedNode({ kind: 'root', children: [child] })).toThrow('봉인되지 않은 자식 VNode');
  const sealed = resolveExpression(h('p', null, 'x')).children[0] as VElement;
  expect(() => freezeBoundaryNode({ ...sealed, attrs: { title: 'mutable' } }, sealed)).toThrow('자식 VNode의 데이터만');
  expect(() => freezeBoundaryNode({ ...child }, child)).toThrow('봉인되지 않은 자식 VNode');
  expect(Object.isFrozen(freezeBoundaryNode({ ...sealed, identity: { ...sealed.identity, key: 'k' } }, sealed))).toBe(true);
});
