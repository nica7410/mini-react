import { expect, it } from 'vitest';
import type { RenderValue, VRoot } from '../../src/core/types';
import { validateTree } from '../../src/core/validate';
import { h } from '../../src/runtime/expression';
import { resolveExpression } from '../../src/runtime/resolve';

const mutable = (value: RenderValue) => JSON.parse(JSON.stringify(resolveExpression(value))) as VRoot;

it('T-V05: the first problem keeps its exact message and nested path after the walk returns from siblings', () => {
  const tree = mutable(h('div', null, h('p', null, h('span', null, 'a')), h('ul', null, h('li', { key: 'a' }, 'x'), h('li', { key: 'b' }, h('b', { attrs: { title: 't' } }, 'y')))));
  const bold = (tree.children[0] as any).children[1].children[1].children[0];
  bold.attrs.onclick = 'bad';
  (tree.children[0] as any).children[1].children[0].tag = 'blink'; // earlier in document order
  expect(validateTree(tree)).toEqual({ ok: false, diagnostics: [{ code: 'INVALID_TREE', message: '미지원 HTML 태그: blink', path: 'root/0/1/0' }] });
  (tree.children[0] as any).children[1].children[0].tag = 'li';
  expect(validateTree(tree)).toEqual({ ok: false, diagnostics: [{ code: 'INVALID_TREE', message: '지원하지 않는 속성: onclick', path: 'root/0/1/1/0' }] });
});

it('T-V05: duplicate keys report the second sibling; an empty root and top-level problems use short paths', () => {
  const tree = mutable(h('ul', null, h('li', { key: 'a' }, 'x'), h('li', { key: 'b' }, 'y')));
  (tree.children[0] as any).children[1].identity.key = 'a';
  expect(validateTree(tree)).toMatchObject({ ok: false, diagnostics: [{ message: '중복 key: a', path: 'root/0/1' }] });
  expect(validateTree({ kind: 'root', children: [] }).ok).toBe(true);
  const top = mutable(h('div', null)); (top.children[0] as any).tag = 'blink';
  expect(validateTree(top)).toMatchObject({ ok: false, diagnostics: [{ path: 'root/0' }] });
});
