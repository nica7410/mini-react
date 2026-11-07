import type { MountHandle, PatchPlan, Result, VElement, VNode, ViewNode } from './types';
import { compatible, equalData, fail, ok } from './vdom';
import { validateTree } from './validate';

interface PlannedNode {
  vnode: VNode | null;
  parent: string | null;
  previous: string | null;
  next: string | null;
  first: string | null;
  last: string | null;
}

// Compare the same host projection as before, without two temporary spread objects per node.
// Identity and children are checked separately; extra own fields remain part of the comparison.
function equalHostData(a: VNode, b: VNode): boolean {
  if (a === b) return true;
  if (a.kind !== b.kind) return false;
  if (a.kind !== 'element' || b.kind !== 'element') return a.kind !== 'element' && b.kind !== 'element' && a.text === b.text;
  let left = 0, right = 0;
  const aa = a as unknown as Record<string, unknown>, bb = b as unknown as Record<string, unknown>;
  for (const key in aa) if (Object.hasOwn(aa, key) && key !== 'identity' && key !== 'children') {
    left++;
    if (!Object.hasOwn(bb, key) || !equalData(aa[key], bb[key])) return false;
  }
  for (const key in bb) if (Object.hasOwn(bb, key) && key !== 'identity' && key !== 'children') right++;
  return left === right;
}

// Patch의 preflight. DOM 쓰기 없이 현재 구조와 명령을 검증한다.
// 형제 연결은 이중 연결 목록으로 모의 실행해, 재배치마다 배열을 검색/복사하지 않는다.
export function validatePlan(mount: MountHandle, plan: PatchPlan): Result<PatchPlan> {
  if (mount.disposed || mount.faulted) return fail('MOUNT_UNAVAILABLE', '해제되었거나 오류 상태인 mount입니다.');
  if (plan.mountId !== mount.id || plan.baseRevision !== mount.revision) return fail('STALE_PLAN', '다른 mount 또는 오래된 revision의 계획입니다.');
  const valid = validateTree(plan.target);
  if (!valid.ok) return valid;
  try {
    const changed = plan.operations.length > 0 || !equalData(mount.view.snapshot, plan.target);
    if (plan.nextView.mountId !== mount.id || plan.nextView.rootRef !== mount.view.rootRef
      || plan.nextView.revision !== mount.revision + (changed ? 1 : 0)
      || !equalData(plan.nextView.snapshot, plan.target)) throw new Error('nextView의 mount/revision/target이 일치하지 않습니다.');
    const graph = new Map<string, PlannedNode>();
    const original = new Map<string, VNode>();
    const created = new Set<string>();
    const requireNode = (ref: string) => {
      const node = graph.get(ref);
      if (!node) throw new Error(`없는 ref: ${ref}`);
      return node;
    };
    const rootRef = mount.view.rootRef;
    graph.set(rootRef, { vnode: null, parent: null, previous: null, next: null, first: null, last: null });
    function load(tree: ViewNode, parent: string | null, fresh: boolean): void {
      if (graph.has(tree.ref) || (fresh && mount.nodes.has(tree.ref))) throw new Error(`중복 ref: ${tree.ref}`);
      const children = tree.vnode.kind === 'element' ? tree.vnode.children : [];
      if (tree.children.length !== children.length || tree.children.some((child, i) => !equalData(child.vnode, children[i]))) throw new Error('ViewNode와 VNode 자식이 다릅니다.');
      graph.set(tree.ref, { vnode: tree.vnode, parent, previous: null, next: null, first: null, last: null });
      if (fresh) created.add(tree.ref); else original.set(tree.ref, tree.vnode);
      loadChildren(tree.ref, tree.children, fresh);
    }
    function loadChildren(parent: string, children: readonly ViewNode[], fresh: boolean) {
      const owner = requireNode(parent);
      owner.first = children[0]?.ref ?? null; owner.last = children.at(-1)?.ref ?? null;
      children.forEach((child, i) => {
        load(child, parent, fresh);
        const node = requireNode(child.ref);
        node.previous = children[i - 1]?.ref ?? null; node.next = children[i + 1]?.ref ?? null;
      });
    }
    loadChildren(rootRef, mount.view.children, false);
    // native value/checked/selection는 편집될 수 있으므로 구조만 검사한다.
    for (const [ref, entry] of graph) {
      const node = mount.nodes.get(ref);
      if (!node || mount.refs.get(node) !== ref) throw new Error(`DOM binding 불일치: ${ref}`);
      if (ref === rootRef && node !== mount.container) throw new Error('root binding이 container와 다릅니다.');
      if (entry.parent && node.parentNode !== mount.nodes.get(entry.parent)) throw new Error(`DOM parent 불일치: ${ref}`);
      const expectedType = entry.vnode?.kind === 'element' ? 1 : entry.vnode?.kind === 'text' ? 3 : 8;
      if (entry.vnode && (node.nodeType !== expectedType || (entry.vnode.kind === 'element' && (node as Element).localName !== entry.vnode.tag))) throw new Error(`DOM type 불일치: ${ref}`);
      let child = entry.first;
      for (const domChild of node.childNodes) {
        if (child === null || mount.nodes.get(child) !== domChild) throw new Error(`DOM 자식 구조 변경: ${ref}`);
        child = requireNode(child).next;
      }
      if (child !== null) throw new Error(`DOM 자식 누락: ${ref}`);
    }
    if (graph.size !== mount.nodes.size) throw new Error('mount registry에 view 밖의 ref가 있습니다.');
    function unlink(ref: string): void {
      const node = requireNode(ref);
      if (!node.parent) return;
      const parent = requireNode(node.parent);
      if (node.previous) requireNode(node.previous).next = node.next; else parent.first = node.next;
      if (node.next) requireNode(node.next).previous = node.previous; else parent.last = node.previous;
      node.parent = node.previous = node.next = null;
    }
    function erase(ref: string): void {
      const node = requireNode(ref);
      let child = node.first;
      while (child) { const next = requireNode(child).next; erase(child); child = next; }
      graph.delete(ref);
    }
    let lastPhase = 0;
    for (const op of plan.operations) {
      const phase = op.kind === 'CREATE_SUBTREE' ? 0 : op.kind === 'REMOVE_SUBTREE' ? 1 : op.kind === 'PLACE_BEFORE' ? 3 : op.kind === 'SYNC_FORM' ? 4 : 2;
      if (phase < lastPhase) throw new Error('Patch 명령의 실행 단계 순서가 잘못되었습니다.');
      lastPhase = phase;
      if (op.kind === 'CREATE_SUBTREE') { load(op.tree, null, true); continue; }
      const node = requireNode(op.node);
      if (!node.vnode) throw new Error('container 자체를 수정하는 명령은 허용하지 않습니다.');
      if (op.kind === 'REMOVE_SUBTREE') {
        if (node.parent !== op.parent || created.has(op.node)) throw new Error('삭제 parent 또는 대상이 잘못되었습니다.');
        unlink(op.node); erase(op.node); continue;
      }
      if (op.kind === 'PLACE_BEFORE') {
        const parent = requireNode(op.parent);
        if (parent.vnode && parent.vnode.kind !== 'element') throw new Error('텍스트/주석은 자식을 가질 수 없습니다.');
        if (op.node === op.anchor || op.node === op.parent) throw new Error('자기 자신을 anchor/parent로 사용할 수 없습니다.');
        if (op.anchor !== null && requireNode(op.anchor).parent !== op.parent) throw new Error('anchor는 해당 parent의 직접 자식이어야 합니다.');
        if (op.placement === 'insert' ? !created.has(op.node) || node.parent !== null : created.has(op.node) || node.parent !== op.parent) throw new Error('insert/move 또는 부모 scope가 잘못되었습니다.');
        let ancestor: string | null = op.parent;
        while (ancestor) { if (ancestor === op.node) throw new Error('순환 배치입니다.'); ancestor = requireNode(ancestor).parent; }
        unlink(op.node);
        node.parent = op.parent; node.next = op.anchor;
        node.previous = op.anchor ? requireNode(op.anchor).previous : parent.last;
        if (node.previous) requireNode(node.previous).next = op.node; else parent.first = op.node;
        if (op.anchor) requireNode(op.anchor).previous = op.node; else parent.last = op.node;
        continue;
      }
      if (op.kind === 'SET_TEXT' || op.kind === 'SET_COMMENT') {
        if (node.vnode.kind !== (op.kind === 'SET_TEXT' ? 'text' : 'comment')) throw new Error('텍스트/주석 명령의 대상 type이 다릅니다.');
        node.vnode = { ...node.vnode, text: op.value } as VNode; continue;
      }
      if (node.vnode.kind !== 'element') throw new Error('element 명령의 대상 type이 다릅니다.');
      const value: VElement = node.vnode;
      switch (op.kind) {
        case 'SET_ATTR': node.vnode = { ...value, attrs: { ...value.attrs, [op.name]: op.value } }; break;
        case 'REMOVE_ATTR': { const attrs = { ...value.attrs }; delete attrs[op.name]; node.vnode = { ...value, attrs }; break; }
        case 'SET_STYLE': node.vnode = { ...value, style: { ...value.style, [op.name]: op.value } }; break;
        case 'REMOVE_STYLE': { const style = { ...value.style }; delete style[op.name]; node.vnode = { ...value, style }; break; }
        case 'SET_EVENT': {
          const events = { ...value.events };
          if (op.binding) events[op.name] = op.binding; else delete events[op.name];
          node.vnode = { ...value, events }; break;
        }
        case 'SYNC_FORM': node.vnode = { ...value, form: op.policy }; break;
        default: throw new Error('알 수 없는 Patch 명령입니다.');
      }
    }
    const visited = new Set<string>([rootRef]);
    function compareChildren(parent: string, expected: readonly ViewNode[]): void {
      let current = requireNode(parent).first;
      for (const tree of expected) {
        if (current !== tree.ref || visited.has(tree.ref)) throw new Error('계획 실행 결과와 nextView 순서/ref가 다릅니다.');
        visited.add(tree.ref);
        const actual = requireNode(tree.ref), before = original.get(tree.ref);
        if (before && !compatible(before, tree.vnode)) throw new Error('호환되지 않는 identity를 재사용했습니다.');
        if (!actual.vnode || !equalHostData(actual.vnode, tree.vnode)) throw new Error('계획의 host 값이 nextView와 다릅니다.');
        const vnodeChildren = tree.vnode.kind === 'element' ? tree.vnode.children : [];
        if (tree.children.length !== vnodeChildren.length || tree.children.some((child, i) => !equalData(child.vnode, vnodeChildren[i]))) throw new Error('nextView의 VNode와 자식 view가 다릅니다.');
        compareChildren(tree.ref, tree.children);
        current = actual.next;
      }
      if (current !== null) throw new Error('계획 실행 후 여분의 자식이 남습니다.');
    }
    if (!equalData(plan.nextView.children.map(n => n.vnode), plan.target.children)) throw new Error('nextView와 target이 다릅니다.');
    compareChildren(rootRef, plan.nextView.children);
    if (visited.size !== graph.size) throw new Error('배치되지 않은 subtree가 있습니다.');
    return ok(plan);
  } catch (error) { return fail('INVALID_PLAN', error instanceof Error ? error.message : String(error)); }
}
