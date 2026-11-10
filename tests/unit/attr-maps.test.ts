// Attribute-map study (docs/validation/followup-attr-maps/plan.md): an engine-built attribute
// map must look exactly like the earlier Object.create(null) map, whatever way it is built.
// The expected map is computed here by the earlier algorithm, independently of the engine.
import { describe, expect, it } from 'vitest';
import type { ElementInputProps, VElement, VNode, VRoot } from '../../src/core/types';
import { booleanAttrs } from '../../src/core/validate';
import { unwrap } from '../../src/core/vdom';
import { h } from '../../src/runtime/expression';
import * as defaultResolve from '../../src/runtime/resolve';
import * as defaultCapture from '../../src/core/capture';
import { apply, container, render } from '../fixtures/helpers';

// Before adoption (commit d48332e) the research candidate was listed here as well.
const implementations = {
  'default engine': { resolveExpression: defaultResolve.resolveExpression, readDOM: defaultCapture.readDOM },
};
type Attrs = NonNullable<ElementInputProps['attrs']>;

// The earlier algorithm of resolve.ts: null prototype, lower-cased names in input order.
function expectedFromProps(input: Attrs): Record<string, string> {
  const attrs: Record<string, string> = Object.create(null);
  for (const rawName of Object.keys(input)) {
    const value = input[rawName], name = rawName.toLowerCase();
    if (value === null || value === undefined) continue;
    if (booleanAttrs.has(name)) { if (value !== false) attrs[name] = ''; }
    else attrs[name] = String(value);
  }
  return attrs;
}
function expectSameMap(actual: Readonly<Record<string, string>>, expected: Record<string, string>, label: string) {
  expect(Object.getPrototypeOf(actual), `${label}: prototype`).toBe(null);
  expect(Reflect.ownKeys(actual), `${label}: own keys and order`).toEqual(Reflect.ownKeys(expected));
  expect(Object.keys(actual), `${label}: enumerable keys`).toEqual(Object.keys(expected));
  for (const key of Reflect.ownKeys(expected) as string[]) {
    expect(Object.getOwnPropertyDescriptor(actual, key), `${label}: ${key}`).toEqual({ value: expected[key], writable: false, enumerable: true, configurable: false });
  }
  expect(Object.isFrozen(actual), `${label}: frozen`).toBe(true);
  // Nothing is inherited: a name that is not an own attribute is absent in every way.
  for (const name of ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf', 'isPrototypeOf']) {
    if (Object.hasOwn(expected, name)) continue;
    expect(name in actual, `${label}: ${name} in`).toBe(false);
    expect(actual[name], `${label}: ${name} read`).toBe(undefined);
  }
  const seen: string[] = [];
  for (const key in actual) seen.push(key);
  expect(seen, `${label}: for-in`).toEqual(Object.keys(expected));
}
const elementOf = (tree: VRoot, ...path: number[]): VElement => {
  let node: VNode = tree.children[0];
  for (const index of path) node = (node as VElement).children[index];
  return node as VElement;
};
// JSON.parse creates `__proto__` as an own data property (an object literal would not).
const withProto = (json: string) => JSON.parse(json) as Attrs;
const propCases: [string, Attrs][] = [
  ['ordinary names', { class: 'a', id: 'b', 'aria-label': 'c' }],
  ['__proto__ between other names', withProto('{"id":"a","__proto__":"p","class":"c"}')],
  ['only __proto__', withProto('{"__proto__":"p"}')],
  ['names of Object.prototype members', { constructor: 'c', toString: 't', hasOwnProperty: 'h', valueOf: 'v', isPrototypeOf: 'i', title: 'x' }],
  ['upper case collides with lower case (first position, last value)', { Class: 'A', title: 't', class: 'b' }],
  ['upper case after lower case', { class: 'b', CLASS: 'A', Title: 'T' }],
  ['boolean, null, undefined and number values', { disabled: true, hidden: false, title: null, 'data-n': 5, 'aria-x': undefined, 'data-s': '' }],
  ['no attributes', {}],
  ['many attributes', Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`data-a${i}`, `v${i}`]))],
  ['names with every allowed punctuation', { 'a.b': '1', 'a:b': '2', a_b: '3', _x: '4', 'xlink:href': 'https://a' }],
];

describe.each(Object.entries(implementations))('%s: attribute maps built by the resolver', (_, engine) => {
  it.each(propCases)('%s', (label, attrs) => {
    const tree = engine.resolveExpression(h('div', null, h('button', { attrs }, 'x')));
    expectSameMap(elementOf(tree, 0).attrs, expectedFromProps(attrs), label);
    expectSameMap(elementOf(tree).attrs, Object.create(null), `${label} (parent without attrs)`);
  });

  it('gives the same tree as the default resolver, node by node', () => {
    for (const [label, attrs] of propCases) {
      const expression = h('section', { attrs: { id: 's' } }, h('input', { attrs: { ...attrs, type: 'text' }, form: { mode: 'controlled', value: 'v' } }), h('p', { attrs }, 'text'));
      const actual = engine.resolveExpression(expression), expected = defaultResolve.resolveExpression(expression);
      expect(actual, label).toEqual(expected);
      expect(JSON.stringify(actual), label).toBe(JSON.stringify(expected));
    }
  });

  it('does not read or write Object.prototype, even one with an accessor or a locked value for the name', () => {
    const hits: string[] = [];
    Object.defineProperty(Object.prototype, 'data-poison', { configurable: true, get() { hits.push('get'); return 'inherited'; }, set() { hits.push('set'); } });
    Object.defineProperty(Object.prototype, 'data-locked', { configurable: true, writable: false, value: 'inherited' });
    try {
      const attrs = { 'data-poison': 'own', title: 't', 'data-locked': 'own too' };
      const tree = engine.resolveExpression(h('div', { attrs: { id: 'outer' } }, h('p', { attrs }, 'x')));
      expect(hits).toEqual([]);
      expectSameMap(elementOf(tree, 0).attrs, expectedFromProps(attrs), 'polluted prototype');
      const outer = elementOf(tree).attrs;
      expect('data-poison' in outer).toBe(false);
      expect(outer['data-locked']).toBe(undefined);
      expect(hits).toEqual([]);
    } finally {
      delete (Object.prototype as Record<string, unknown>)['data-poison'];
      delete (Object.prototype as Record<string, unknown>)['data-locked'];
    }
  });

  it('special names reach the DOM and are removed again through diff and commit', () => {
    const first = engine.resolveExpression(h('div', { attrs: withProto('{"id":"a","__proto__":"p","constructor":"c"}') }, 'x'));
    const { root, mount } = render(first);
    const element = root.firstElementChild!;
    expect([element.getAttribute('__proto__'), element.getAttribute('constructor'), element.getAttribute('id')]).toEqual(['p', 'c', 'a']);
    apply(mount, engine.resolveExpression(h('div', { attrs: withProto('{"id":"a","__proto__":"q"}') }, 'x')));
    expect([element.getAttribute('__proto__'), element.hasAttribute('constructor')]).toEqual(['q', false]);
    apply(mount, engine.resolveExpression(h('div', { attrs: { id: 'a' } }, 'x')));
    expect(element.getAttributeNames()).toEqual(['id']);
  });
});

describe.each(Object.entries(implementations))('%s: attribute maps read from the DOM', (_, engine) => {
  it('keeps the DOM order, drops style, and stores special names as own data', () => {
    const root = container('<div id="a" class="c" style="color: red" title="t"><span></span><input type="checkbox" checked></div>');
    const element = root.firstElementChild!;
    element.setAttribute('__proto__', 'p');
    element.setAttribute('constructor', 'k');
    const tree = unwrap(engine.readDOM(root));
    const expected: Record<string, string> = Object.create(null);
    for (const [name, value] of [['id', 'a'], ['class', 'c'], ['title', 't'], ['__proto__', 'p'], ['constructor', 'k']]) expected[name] = value;
    expectSameMap(elementOf(tree).attrs, expected, 'captured element');
    expectSameMap(elementOf(tree, 0).attrs, Object.create(null), 'captured element without attributes');
    const input: Record<string, string> = Object.create(null);
    input.type = 'checkbox'; input.checked = '';
    expectSameMap(elementOf(tree, 1).attrs, input, 'captured input');
    expect(tree).toEqual(unwrap(defaultCapture.readDOM(root)));
  });

  it('does not touch a polluted Object.prototype while reading', () => {
    const hits: string[] = [];
    Object.defineProperty(Object.prototype, 'data-poison', { configurable: true, get() { hits.push('get'); return 'inherited'; }, set() { hits.push('set'); } });
    try {
      const root = container('<p data-poison="own" title="t"></p><p></p>');
      const tree = unwrap(engine.readDOM(root));
      expect(hits).toEqual([]);
      expect(Object.getOwnPropertyDescriptor(elementOf(tree).attrs, 'data-poison')?.value).toBe('own');
      expect('data-poison' in (tree.children[1] as VElement).attrs).toBe(false);
      expect(hits).toEqual([]);
    } finally { delete (Object.prototype as Record<string, unknown>)['data-poison']; }
  });
});
