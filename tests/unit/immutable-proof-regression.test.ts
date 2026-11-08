import { expect, it } from 'vitest';
import type { VElement, VRoot } from '../../src/core/types';
import { freezeTree, isImmutableData } from '../../src/core/vdom';
import { validateTree } from '../../src/core/validate';
import { h } from '../../src/runtime/expression';
import { resolveExpression } from '../../src/runtime/resolve';

const mutableRoot = (): VRoot => JSON.parse(JSON.stringify(resolveExpression(h('p', { attrs: { title: 'safe' } }, 'text'))));

it('T-N06: a Proxy cannot hide inherited mutable children behind its pre-freeze prototype', () => {
  const inherited = { children: mutableRoot().children };
  const target = Object.assign(Object.create(inherited) as VRoot, { kind: 'root' });
  const tree = new Proxy(target, {
    getPrototypeOf(object) {
      return Reflect.isExtensible(object) ? Object.prototype : Reflect.getPrototypeOf(object);
    },
  });
  freezeTree(tree);
  expect(validateTree(tree).ok).toBe(true);
  // Inherited data is not engine-owned data to freeze on the caller's behalf.
  expect(Object.isFrozen(inherited.children)).toBe(false);
  ((inherited.children[0] as VElement).attrs as Record<string, string>).onclick = 'unsupported';
  expect(validateTree(tree).ok).toBe(false);
  expect(isImmutableData(tree)).toBe(false);
});

it('T-N06: the final child reference installed by a freeze trap must be deeply frozen', () => {
  const replacement = mutableRoot().children;
  const tree = new Proxy(mutableRoot(), {
    defineProperty(object, key, descriptor) {
      return Reflect.defineProperty(object, key, key === 'children' && descriptor.writable === false
        ? { ...descriptor, value: replacement } : descriptor);
    },
  });
  freezeTree(tree);
  expect(tree.children).toBe(replacement);
  expect(validateTree(tree).ok).toBe(true);
  const attrs = (replacement[0] as VElement).attrs as Record<string, string>;
  expect(Object.isFrozen(attrs)).toBe(true);
  expect(() => { attrs.onclick = 'unsupported'; }).toThrow();
  expect(validateTree(tree).ok).toBe(true);
});

it('T-N06: an interrupted proof leaves the same object eligible for a later complete proof', () => {
  let interrupt = true;
  const value = new Proxy({ nested: { value: 1 } }, {
    ownKeys(object) {
      if (interrupt) throw new Error('proof interrupted');
      return Reflect.ownKeys(object);
    },
  });
  expect(() => freezeTree(value)).toThrow('proof interrupted');
  expect(isImmutableData(value)).toBe(false);
  interrupt = false;
  expect(freezeTree(value)).toBe(value);
  expect(isImmutableData(value)).toBe(true);
  expect(Object.isFrozen(value.nested)).toBe(true);
});

it('T-N06: cyclic and reentrant proofs reject deliberately instead of overflowing the stack', () => {
  const cyclic: { self?: unknown } = {}; cyclic.self = cyclic;
  expect(() => freezeTree(cyclic)).toThrow('순환 데이터');
  let reenter = true;
  let value: { value: number };
  value = new Proxy({ value: 1 }, {
    ownKeys(object) {
      if (reenter) freezeTree(value);
      return Reflect.ownKeys(object);
    },
  });
  expect(() => freezeTree(value)).toThrow('순환 데이터');
  reenter = false;
  expect(freezeTree(value)).toBe(value);
  expect(isImmutableData(value)).toBe(true);
});
