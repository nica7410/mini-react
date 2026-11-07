import type { DiffOptions, MountView, PatchOp, PatchPlan, Result, VElement, VNode, VRoot, ViewNode } from './types';
import { compatible, equalData, fail, ok } from './vdom';
import { validateTree } from './validate';

let planSequence = 0;

// 순수 planner: 이 모듈은 DOM 객체/API를 읽지 않는다.
export function diff(base: MountView, target: VRoot, options: DiffOptions = {}): Result<PatchPlan> {
  const validBase = validateTree(base.snapshot);
  if (!validBase.ok) return validBase;
  const valid = validateTree(target);
  if (!valid.ok) return valid;
  if (options.strategy && options.strategy !== 'positional') return fail('UNSUPPORTED_STRATEGY', 'M1은 positional만 지원합니다.');
  const id = options.planId ?? `plan-${++planSequence}`;
  let nextRef = 0;
  const creates: PatchOp[] = [], removes: PatchOp[] = [], updates: PatchOp[] = [], placements: PatchOp[] = [], forms: PatchOp[] = [];
  const newRefs = new Set<string>();
  function create(vnode: VNode): ViewNode {
    const ref = `${base.mountId}/${id}/${++nextRef}`;
    newRefs.add(ref);
    return { ref, vnode, children: vnode.kind === 'element' ? vnode.children.map(create) : [] };
  }
  function elementChanges(old: VElement, next: VElement, ref: string) {
    if (old.form && next.form && old.form.mode !== next.form.mode) throw new Error('같은 노드의 폼 소유 모드는 변경할 수 없습니다.');
    for (const name of Object.keys(old.attrs)) if (!Object.hasOwn(next.attrs, name)) updates.push({ kind: 'REMOVE_ATTR', node: ref, name });
    for (const [name, value] of Object.entries(next.attrs)) if (old.attrs[name] !== value) updates.push({ kind: 'SET_ATTR', node: ref, name, value });
    for (const name of Object.keys(old.style)) if (!Object.hasOwn(next.style, name)) updates.push({ kind: 'REMOVE_STYLE', node: ref, name });
    for (const [name, value] of Object.entries(next.style)) if (!equalData(old.style[name], value)) updates.push({ kind: 'SET_STYLE', node: ref, name, value });
    for (const name of new Set([...Object.keys(old.events), ...Object.keys(next.events)])) {
      if (!equalData(old.events[name], next.events[name])) updates.push({ kind: 'SET_EVENT', node: ref, name, binding: next.events[name] ?? null });
    }
    if (next.form && (!equalData(old.form, next.form) || !equalData(old.children, next.children) || !equalData(old.attrs, next.attrs))) {
      forms.push({ kind: 'SYNC_FORM', node: ref, policy: next.form });
    }
  }
  function reconcileChildren(old: readonly ViewNode[], next: readonly VNode[], parent: string): ViewNode[] {
    const result = next.map((vnode, index): ViewNode => {
      const previous = old[index];
      if (!previous || !compatible(previous.vnode, vnode)) {
        if (previous) removes.push({ kind: 'REMOVE_SUBTREE', node: previous.ref, parent });
        const tree = create(vnode);
        creates.push({ kind: 'CREATE_SUBTREE', tree });
        return tree;
      }
      if (vnode.kind === 'element' && previous.vnode.kind === 'element') {
        elementChanges(previous.vnode, vnode, previous.ref);
        return { ref: previous.ref, vnode, children: reconcileChildren(previous.children, vnode.children, previous.ref) };
      }
      if (vnode.kind !== 'element' && previous.vnode.kind !== 'element' && vnode.text !== previous.vnode.text) {
        updates.push({ kind: vnode.kind === 'text' ? 'SET_TEXT' : 'SET_COMMENT', node: previous.ref, value: vnode.text });
      }
      return { ref: previous.ref, vnode, children: [] };
    });
    for (let i = next.length; i < old.length; i++) removes.push({ kind: 'REMOVE_SUBTREE', node: old[i].ref, parent });
    // 오른쪽부터 배치하면 신규 anchor도 사용 시점에 부모에 연결되어 있다.
    for (let i = result.length - 1; i >= 0; i--) if (newRefs.has(result[i].ref)) {
      placements.push({ kind: 'PLACE_BEFORE', placement: 'insert', node: result[i].ref, parent, anchor: result[i + 1]?.ref ?? null });
    }
    return result;
  }
  try {
    const children = reconcileChildren(base.children, target.children, base.rootRef);
    const operations = [...creates, ...removes, ...updates, ...placements, ...forms];
    return ok({
      id, mountId: base.mountId, baseRevision: base.revision, target,
      nextView: { ...base, revision: base.revision + (operations.length || !equalData(base.snapshot, target) ? 1 : 0), snapshot: target, children },
      operations,
    });
  } catch (error) { return fail('DIFF_ERROR', error instanceof Error ? error.message : String(error)); }
}
