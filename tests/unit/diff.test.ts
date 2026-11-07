// @vitest-environment node
import { expect, it } from 'vitest';
import { diff } from '../../src/core/reconcile';
import { emptyRoot, unwrap } from '../../src/core/vdom';
import { h } from '../../src/runtime/expression';
import { resolveExpression } from '../../src/runtime/resolve';
import type { MountView } from '../../src/core/types';

it('T-D01: DOM 없는 환경에서 위치 기반 계획을 계산한다', () => {
  expect(typeof document).toBe('undefined');
  const base: MountView = { mountId: 'model', revision: 0, rootRef: 'root', snapshot: emptyRoot(), children: [] };
  const first = unwrap(diff(base, resolveExpression(h('p', { attrs: { title: 'old' } }, 'A'))));
  const second = unwrap(diff(first.nextView, resolveExpression(h('p', { attrs: { title: 'new' } }, 'B'))));
  expect(second.operations.map(op => op.kind)).toEqual(['SET_ATTR', 'SET_TEXT']);
  expect(first.target.children[0]).toMatchObject({ attrs: { title: 'old' }, children: [{ text: 'A' }] });
});
