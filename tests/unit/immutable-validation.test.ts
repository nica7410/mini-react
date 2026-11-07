import { expect, it } from 'vitest';
import type { VElement, VRoot } from '../../src/core/types';
import { freezeTree, isImmutableData } from '../../src/core/vdom';
import { validateTree } from '../../src/core/validate';
import { h } from '../../src/runtime/expression';
import { resolveExpression } from '../../src/runtime/resolve';

const mutable = () => JSON.parse(JSON.stringify(resolveExpression(h('p', { attrs: { title: 'safe' } }, 'text')))) as VRoot;

it.each([false, true])('T-N06: mutable descendants are revalidated even when outer freeze=%s', frozen => {
  const tree = mutable(); if (frozen) Object.freeze(tree);
  expect(validateTree(tree).ok).toBe(true);
  const attrs = (tree.children[0] as VElement).attrs as Record<string, string>; attrs.onclick = 'unsupported';
  expect(validateTree(tree).ok).toBe(false); expect(isImmutableData(tree)).toBe(false);
});

it('T-N06: owned freezing descends through a previously shallow-frozen wrapper', () => {
  const tree = mutable(); Object.freeze(tree); freezeTree(tree);
  expect(isImmutableData(tree)).toBe(true); expect(validateTree(tree).ok).toBe(true);
  expect(Object.isFrozen((tree.children[0] as VElement).attrs)).toBe(true);
  expect(() => { ((tree.children[0] as VElement).attrs as Record<string, string>).onclick = 'bad'; }).toThrow();
  expect(validateTree(tree).ok).toBe(true);
});

it('T-N06: frozen accessors are not immutable certificates and changed values are rejected', () => {
  const original = mutable().children[0] as VElement; let attrs: Record<string, string> = { title: 'safe' };
  const node = { ...original, get attrs() { return attrs; } };
  const tree = freezeTree<VRoot>({ kind: 'root', children: [node] });
  expect(isImmutableData(tree)).toBe(false); expect(validateTree(tree).ok).toBe(true);
  attrs = { onclick: 'bad' }; expect(validateTree(tree).ok).toBe(false);
});

it('T-N06: data with a custom prototype is not certified and functions remain opaque/unfrozen', () => {
  const attrs = Object.create({ inherited: 'mutable' }) as Record<string, string>; attrs.title = 'safe';
  expect(isImmutableData(freezeTree(attrs))).toBe(false);
  const handler = () => undefined;
  const tree = resolveExpression(h('button', { events: { click: handler } }, 'safe'));
  expect(isImmutableData(tree)).toBe(true); expect(Object.isFrozen(handler)).toBe(false);
});

it('T-N07: cached roots do not certify a snapshot radio moved outside its form', () => {
  const tree = resolveExpression(h('form', null, h('input', { attrs: { type: 'radio', name: 'r' }, form: { mode: 'snapshot', checked: true } })));
  expect(validateTree(tree).ok).toBe(true);
  const radio = (tree.children[0] as VElement).children[0];
  expect(validateTree(freezeTree<VRoot>({ kind: 'root', children: [radio] })).ok).toBe(false);
});

it('T-N07: reused option data is rechecked against a different select ownership context', () => {
  const tree = resolveExpression(h('select', { form: { mode: 'snapshot', selectedIndices: [0] } }, h('option', { attrs: { selected: true } }, 'A')));
  expect(validateTree(tree).ok).toBe(true);
  const select = tree.children[0] as VElement;
  const next = freezeTree<VRoot>({ kind: 'root', children: [{ ...select, form: { mode: 'controlled', selectedIndices: [0] } }] });
  expect(validateTree(next).ok).toBe(false);
});

it('T-N07: radio groups combined under a new root are checked together', () => {
  const radio = () => resolveExpression(h('input', { attrs: { type: 'radio', name: 'same' }, form: { mode: 'controlled', checked: true } }));
  const a = radio(), b = radio();
  expect(validateTree(a).ok && validateTree(b).ok).toBe(true);
  expect(validateTree(freezeTree<VRoot>({ kind: 'root', children: [...a.children, ...b.children] })).ok).toBe(false);
});
