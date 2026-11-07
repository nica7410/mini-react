import { expect, it, vi } from 'vitest';
import type { PatchOp, PatchPlan } from '../../src/core/types';
import { diff } from '../../src/core/reconcile';
import { commit } from '../../src/core/patch';
import { unwrap } from '../../src/core/vdom';
import { apply, render, snapshot } from '../fixtures/helpers';

it.each(['anchor', 'parent', 'type', 'missing-op', 'next-view', 'duplicate-ref', 'order'])('T-E01: 잘못된 %s 계획은 첫 쓰기 전에 거절한다', variant => {
  const { root, mount } = render(snapshot('<div><p>A</p><span>B</span></div>'));
  const plan = unwrap(diff(mount.view, snapshot('<div><p>changed</p><span>B</span><i>C</i></div>')));
  let operations: PatchOp[] = [...plan.operations], nextView = plan.nextView;
  const parentRef = mount.view.children[0].ref, textRef = mount.view.children[0].children[0].children[0].ref;
  if (variant === 'anchor') operations = operations.map(op => op.kind === 'PLACE_BEFORE' ? { ...op, anchor: textRef } : op);
  if (variant === 'parent') operations = operations.map(op => op.kind === 'PLACE_BEFORE' ? { ...op, parent: textRef } : op);
  if (variant === 'type') operations = operations.map(op => op.kind === 'SET_TEXT' ? { ...op, node: parentRef } : op);
  if (variant === 'missing-op') operations = operations.filter(op => op.kind !== 'SET_TEXT');
  if (variant === 'next-view') nextView = { ...nextView, revision: 999 };
  if (variant === 'duplicate-ref') operations = operations.map(op => op.kind === 'CREATE_SUBTREE' ? { ...op, tree: { ...op.tree, ref: parentRef } } : op);
  if (variant === 'order') operations.reverse();
  const writes = vi.spyOn(root.ownerDocument, 'createElement');
  const result = commit(mount, { ...plan, operations, nextView });
  expect(result.status).toBe('rejected'); expect(writes).not.toHaveBeenCalled();
  expect(root.innerHTML).toBe('<div><p>A</p><span>B</span></div>'); expect(mount.faulted).toBe(false);
  writes.mockRestore();
});

it('T-D03: 앞쪽 삭제/교체와 뒤쪽 수정이 섞여도 정확한 ref를 갱신한다', () => {
  const { root, mount } = render(snapshot('<b>A</b><i>B</i><p>C</p><!--old-->'));
  const p = root.querySelector('p');
  apply(mount, snapshot('<span>X</span><i>Y</i><p>changed</p><!--new-->'));
  expect(root.innerHTML).toBe('<span>X</span><i>Y</i><p>changed</p><!--new-->');
  expect(root.querySelector('p')).toBe(p);
});

it('T-E01: 외부 구조 변경은 preflight에서 발견하여 부분 쓰기를 막는다', () => {
  const { root, mount } = render(snapshot('<p>A</p>'));
  const plan = unwrap(diff(mount.view, snapshot('<p>B</p>')));
  root.firstChild!.remove();
  expect(commit(mount, plan).status).toBe('rejected'); expect(root.childNodes).toHaveLength(0);
});

it('T-E03: 실제 host 예외는 faulted가 되고 이후 계획은 쓰기 없이 차단된다', () => {
  const { root, mount } = render(snapshot('<p>A</p>'));
  const plan = unwrap(diff(mount.view, snapshot('<p>A</p><hr>')));
  const insert = vi.spyOn(root, 'insertBefore').mockImplementation(() => { throw new Error('injected host failure'); });
  expect(commit(mount, plan).status).toBe('faulted'); expect(mount.faulted).toBe(true);
  insert.mockRestore();
  const again: PatchPlan = { ...plan, id: 'after-fault' };
  expect(commit(mount, again).status).toBe('rejected'); expect(root.innerHTML).toBe('<p>A</p>');
});
