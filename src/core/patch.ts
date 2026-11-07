import type { CommitCounters, CommitResult, MountHandle, PatchPlan, Result, ViewNode } from './types';
import { validatePlan } from './planValidation';
import { clearEvents, setEvent } from './host/events';
import { syncForm } from './host/forms';
import { emitTrace } from '../observe/trace';

export const emptyCounters = (): CommitCounters => ({
  createdNodes: 0, removedNodes: 0, insertedRoots: 0, movedRoots: 0,
  textWrites: 0, attributeWrites: 0, styleWrites: 0, propertyWrites: 0,
  listenerAdds: 0, listenerRemoves: 0, skippedHostCalls: 0,
});

export { validatePlan } from './planValidation';

export function commit(mount: MountHandle, plan: PatchPlan): CommitResult {
  const valid = validatePlan(mount, plan);
  if (!valid.ok) return { status: 'rejected', diagnostics: valid.diagnostics };
  const counters = emptyCounters();
  const initialForms: { element: HTMLElement; tree: ViewNode }[] = [];
  const nodeAt = (ref: string): Node => {
    const node = mount.nodes.get(ref);
    if (!node) throw new Error(`찾을 수 없는 ref: ${ref}`);
    return node;
  };
  function create(tree: ViewNode): Node {
    const vnode = tree.vnode, doc = mount.container.ownerDocument;
    const node = vnode.kind === 'element' ? doc.createElement(vnode.tag)
      : vnode.kind === 'text' ? doc.createTextNode(vnode.text) : doc.createComment(vnode.text);
    mount.nodes.set(tree.ref, node); mount.refs.set(node, tree.ref); counters.createdNodes++;
    if (vnode.kind === 'element') {
      const element = node as HTMLElement;
      for (const [name, value] of Object.entries(vnode.attrs)) { element.setAttribute(name, value); counters.attributeWrites++; }
      for (const [name, style] of Object.entries(vnode.style)) { element.style.setProperty(name, style.value, style.priority); counters.styleWrites++; }
      for (const [name, binding] of Object.entries(vnode.events)) setEvent(element, name, binding, counters);
      for (const child of tree.children) element.appendChild(create(child));
      if (vnode.form) initialForms.push({ element, tree });
    }
    return node;
  }
  function release(node: Node) {
    for (const child of Array.from(node.childNodes)) release(child);
    clearEvents(node, counters);
    const ref = mount.refs.get(node);
    if (ref) mount.nodes.delete(ref);
    mount.refs.delete(node); counters.removedNodes++;
  }
  try {
    for (const op of plan.operations) {
      switch (op.kind) {
        case 'CREATE_SUBTREE': create(op.tree); break;
        case 'REMOVE_SUBTREE': {
          const node = nodeAt(op.node), parent = nodeAt(op.parent);
          if (node.parentNode !== parent) throw new Error('삭제 대상의 parent가 변경되었습니다.');
          parent.removeChild(node); release(node); break;
        }
        case 'SET_TEXT': case 'SET_COMMENT': nodeAt(op.node).nodeValue = op.value; counters.textWrites++; break;
        case 'SET_ATTR': (nodeAt(op.node) as Element).setAttribute(op.name, op.value); counters.attributeWrites++; break;
        case 'REMOVE_ATTR': (nodeAt(op.node) as Element).removeAttribute(op.name); counters.attributeWrites++; break;
        case 'SET_STYLE': (nodeAt(op.node) as HTMLElement).style.setProperty(op.name, op.value.value, op.value.priority); counters.styleWrites++; break;
        case 'REMOVE_STYLE': (nodeAt(op.node) as HTMLElement).style.removeProperty(op.name); counters.styleWrites++; break;
        case 'SET_EVENT': setEvent(nodeAt(op.node) as Element, op.name, op.binding, counters); break;
        case 'PLACE_BEFORE': {
          const node = nodeAt(op.node), parent = nodeAt(op.parent), anchor = op.anchor === null ? null : nodeAt(op.anchor);
          if (anchor && anchor.parentNode !== parent) throw new Error('anchor가 parent의 직접 자식이 아닙니다.');
          if (node.parentNode === parent && node.nextSibling === anchor) { counters.skippedHostCalls++; break; }
          parent.insertBefore(node, anchor);
          if (op.placement === 'insert') counters.insertedRoots++; else counters.movedRoots++;
          break;
        }
        case 'SYNC_FORM': break; // 모든 자식 배치가 끝난 뒤 적용한다.
      }
    }
    for (const { element, tree } of initialForms) if (tree.vnode.kind === 'element' && tree.vnode.form) syncForm(element, tree.vnode.form, true, counters);
    for (const op of plan.operations) if (op.kind === 'SYNC_FORM') syncForm(nodeAt(op.node) as HTMLElement, op.policy, false, counters);
    mount.view = plan.nextView; mount.revision = plan.nextView.revision;
    const status = plan.operations.length === 0 && plan.baseRevision === mount.revision ? 'noop' : 'committed';
    emitTrace(mount.trace, { causeIds: [], mountId: mount.id, commitId: mount.revision, phase: 'patch', detail: { planId: plan.id, status, ...counters } });
    return { status, revision: mount.revision, counters };
  } catch (error) {
    mount.faulted = true;
    return { status: 'faulted', error };
  }
}

export function applySnapshot(mount: MountHandle, plan: Result<PatchPlan>): CommitResult {
  if (!plan.ok) return { status: 'rejected', diagnostics: plan.diagnostics };
  emitTrace(mount.trace, { causeIds: [], mountId: mount.id, phase: 'diff', detail: { planId: plan.value.id, strategy: 'positional', operations: plan.value.operations.length } });
  return commit(mount, plan.value);
}
