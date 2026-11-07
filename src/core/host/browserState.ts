import type { MountHandle, PatchPlan } from '../types';

export function attachBrowserState(mount: MountHandle): () => void {
  const ending = new Set<Node>();
  const changed = () => { try { mount.onCompositionChange?.(); } catch { /* 관찰 UI는 host 계약을 바꾸지 않는다. */ } };
  const start = (event: Event) => {
    const target = event.target as Node | null;
    if (!target || !mount.container.contains(target)) return;
    ending.delete(target); mount.composing.add(target); changed();
  };
  const end = (event: Event) => {
    const target = event.target as Node | null;
    if (!target || !mount.composing.has(target)) return;
    ending.add(target);
    // native compositionend 이후의 최종 input/handler까지 처리한 뒤 최신 큐를 재계산한다.
    if (mount.compositionEndTimer === undefined) mount.compositionEndTimer = setTimeout(() => {
      mount.compositionEndTimer = undefined;
      if (mount.disposed) return;
      for (const node of ending) {
        mount.composing.delete(node);
        const ref = mount.refs.get(node);
        if (ref) mount.dirtyForms.set(ref, ++mount.inputSequence);
      }
      ending.clear();
      for (const ref of mount.heldForms) {
        const node = mount.nodes.get(ref);
        if (!node || !isComposing(mount, node)) {
          if (node) mount.dirtyForms.set(ref, ++mount.inputSequence);
          mount.heldForms.delete(ref);
        }
      }
      changed(); mount.onCompositionEnd?.(); mount.onHostInput?.();
    }, 0);
  };
  const focus = () => { mount.focusVersion++; };
  mount.container.addEventListener('compositionstart', start, true);
  mount.container.addEventListener('compositionend', end, true);
  mount.container.ownerDocument.addEventListener('focusin', focus, true);
  return () => {
    mount.container.removeEventListener('compositionstart', start, true);
    mount.container.removeEventListener('compositionend', end, true);
    mount.container.ownerDocument.removeEventListener('focusin', focus, true);
    if (mount.compositionEndTimer !== undefined) clearTimeout(mount.compositionEndTimer);
    mount.compositionEndTimer = undefined; mount.composing.clear(); mount.heldForms.clear(); ending.clear();
  };
}

export function isComposing(mount: MountHandle, node: Node): boolean {
  return [...mount.composing].some(target => target === node || target.contains(node));
}
export function compositionConflict(mount: MountHandle, plan: PatchPlan): readonly string[] {
  if (!mount.composing.size) return [];
  const conflicts = new Set<string>();
  for (const target of mount.composing) for (const op of plan.operations) {
    if (op.kind === 'CREATE_SUBTREE' || op.kind === 'SYNC_FORM' || op.kind === 'SET_EVENT') continue;
    const node = mount.nodes.get(op.node);
    if (!node) continue;
    const ancestor = node === target || node.contains(target);
    const destructive = op.kind === 'REMOVE_SUBTREE' || (op.kind === 'PLACE_BEFORE' && op.placement === 'move');
    const inputMode = (op.kind === 'SET_ATTR' || op.kind === 'REMOVE_ATTR') &&
      ['type', 'disabled', 'readonly', 'inputmode', 'contenteditable', 'hidden', 'inert', 'form', 'multiple'].includes(op.name.toLowerCase());
    const style = op.kind === 'SET_STYLE' || op.kind === 'REMOVE_STYLE';
    const editingText = (op.kind === 'SET_TEXT' || op.kind === 'SET_COMMENT') && target.contains(node);
    if ((ancestor && (destructive || inputMode || style)) || editingText) conflicts.add(op.node);
  }
  return [...conflicts];
}

interface SelectionSnapshot {
  readonly element: HTMLElement;
  readonly ref: string;
  readonly focusVersion: number;
  readonly type: string | null;
  readonly range: { start: number; end: number; direction: 'forward' | 'backward' | 'none' } | null;
}
export function saveSelection(mount: MountHandle): SelectionSnapshot | null {
  const element = mount.container.ownerDocument.activeElement as HTMLElement | null;
  if (!element || !mount.container.contains(element) || isComposing(mount, element)) return null;
  const ref = mount.refs.get(element); if (!ref) return null;
  let range: SelectionSnapshot['range'] = null;
  if (['input', 'textarea'].includes(element.localName)) {
    const field = element as HTMLInputElement | HTMLTextAreaElement;
    if (field.selectionStart !== null && field.selectionEnd !== null) range = { start: field.selectionStart, end: field.selectionEnd, direction: field.selectionDirection ?? 'none' };
  }
  return { element, ref, focusVersion: mount.focusVersion, type: element.getAttribute('type'), range };
}
export function restoreSelection(mount: MountHandle, saved: SelectionSnapshot | null): void {
  if (!saved || mount.disposed) return;
  const { element, range } = saved, doc = mount.container.ownerDocument;
  if (!element.isConnected || mount.nodes.get(saved.ref) !== element || !mount.container.contains(element)
    || element.getAttribute('type') !== saved.type || mount.focusVersion !== saved.focusVersion || isComposing(mount, element)) return;
  if (doc.activeElement !== element) {
    if (doc.activeElement !== doc.body && doc.activeElement !== null) return;
    element.focus({ preventScroll: true });
  }
  if (doc.activeElement === element && range) {
    const field = element as HTMLInputElement | HTMLTextAreaElement;
    const start = Math.min(range.start, field.value.length), end = Math.min(range.end, field.value.length);
    if (field.selectionStart !== start || field.selectionEnd !== end || field.selectionDirection !== range.direction) field.setSelectionRange(start, end, range.direction);
  }
}
