import { expect, it } from 'vitest';
import type { VElement, VRoot } from '../../src/core/types';
import { freezeTree, isImmutableData } from '../../src/core/vdom';
import { validateTree } from '../../src/core/validate';
import { h } from '../../src/runtime/expression';
import { resolveExpression } from '../../src/runtime/resolve';

const wideTree = () => resolveExpression(h('ul', null,
  ...Array.from({ length: 128 }, (_, index) => h('li', { key: index },
    h('span', { attrs: { title: `row ${index}` } }, `row ${index}`))),
));

function objects(value: unknown, result = new Set<object>()): Set<object> {
  if (!value || typeof value !== 'object' || result.has(value)) return result;
  result.add(value);
  for (const child of Object.values(value)) objects(child, result);
  return result;
}

it('T-N08: a wide tree is fully frozen while retained proof metadata stays bounded', () => {
  const tree = wideTree(), owned = [...objects(tree)];
  expect(owned.length).toBeGreaterThan(1000);
  expect(owned.every(Object.isFrozen)).toBe(true);
  expect(owned.filter(isImmutableData).length).toBeLessThanOrEqual(64);
  // Keep the root and early reusable boundary, not merely an empty cache.
  expect(isImmutableData(tree)).toBe(true);
  expect(isImmutableData(tree.children[0])).toBe(true);
  expect(validateTree(tree).ok).toBe(true);
});

it('T-N08: exhausting retention never stops deep proof or certifies a late accessor', () => {
  const tree = JSON.parse(JSON.stringify(wideTree())) as VRoot;
  const list = tree.children[0] as VElement;
  const last = list.children.at(-1) as VElement;
  let reads = 0, attrs: Record<string, string> = { title: 'safe' };
  Object.defineProperty(last, 'attrs', {
    enumerable: true, configurable: true, get: () => { reads++; return attrs; },
  });
  freezeTree(tree);
  expect(reads).toBe(0);
  expect(isImmutableData(tree)).toBe(false);
  expect(Object.isFrozen(last.children)).toBe(true);
  expect(Object.isFrozen(attrs)).toBe(false);
  expect(validateTree(tree).ok).toBe(true);
  attrs = { onclick: 'unsupported' };
  expect(validateTree(tree).ok).toBe(false);
});
